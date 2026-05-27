import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ActiviteService } from '../activite/activite.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import {
  AuthTokenResponse,
  JwtPayload,
  UserMePayload,
  UserPayload,
} from './types/auth.types';
import { omitPasswordHash } from './utils/omit-password.util';

@Injectable()
export class AuthService {
  private readonly bcryptRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly activiteService: ActiviteService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return null;
    }

    await this.usersService.updateLastLogin(user.id);

    return user;
  }

  async login(user: UserPayload): Promise<AuthTokenResponse> {
    await this.activiteService.log('connexion', `Connexion de ${user.email}`, null, {
      role: user.role,
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: await this.enrichUserProfile(user),
    };
  }

  async register(dto: RegisterDto): Promise<AuthTokenResponse> {
    this.assertRegistrationAllowed();
    this.assertRoleNotAdmin(dto.role);

    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const created = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      nom: dto.nom,
      prenom: dto.prenom,
      role: dto.role,
    });

    const user = await this.usersService.findById(created.id);

    if (!user) {
      throw new InternalServerErrorException(
        'Utilisateur créé introuvable après inscription',
      );
    }

    return this.login(omitPasswordHash(user));
  }

  async getMe(userId: number): Promise<UserMePayload> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.enrichUserProfile(omitPasswordHash(user));
  }

  private async enrichUserProfile(user: UserPayload): Promise<UserMePayload> {
    const employe = await this.prisma.employe.findFirst({
      where: { email: user.email, deletedAt: null },
      select: {
        id: true,
        matricule: true,
        poste: true,
        departement: true,
        avatar: true,
      },
    });

    if (!employe) {
      return {
        ...user,
        employeId: null,
        matricule: null,
        poste: null,
        departement: null,
        avatar: null,
      };
    }

    return {
      ...user,
      employeId: employe.id,
      matricule: employe.matricule,
      poste: employe.poste,
      departement: employe.departement,
      avatar: employe.avatar,
    };
  }

  async registerEmployee(dto: RegisterEmployeeDto): Promise<AuthTokenResponse> {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          nom: dto.nom,
          prenom: dto.prenom,
          role: UserRole.employee,
        },
      });

      const employe = await tx.employe.create({
        data: {
          nom: dto.nom,
          prenom: dto.prenom,
          email: dto.email,
          telephone: dto.telephone,
          adresse: dto.adresse,
          poste: dto.poste,
          departement: dto.departement,
          typeContrat: dto.typeContrat,
          dateEmbauche: dto.dateEmbauche
            ? new Date(dto.dateEmbauche)
            : undefined,
          salaireBase: dto.salaireBase ?? 0,
        },
      });

      await tx.employe.update({
        where: { id: employe.id },
        data: { matricule: this.formatMatricule(employe.id) },
      });

      return user;
    });

    await this.activiteService.log(
      'inscription_employe',
      `Nouvel employé inscrit : ${dto.nom} ${dto.prenom} (${dto.email})`,
      null,
    );

    const user = await this.usersService.findById(result.id);

    if (!user) {
      throw new InternalServerErrorException(
        'Utilisateur créé introuvable après inscription',
      );
    }

    return this.login(omitPasswordHash(user));
  }

  async refreshToken(userId: number): Promise<AuthTokenResponse> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: await this.enrichUserProfile(omitPasswordHash(user)),
    };
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.bcryptRounds);
  }

  private formatMatricule(id: number): string {
    return `EMP-${String(id).padStart(6, '0')}`;
  }

  private assertRegistrationAllowed(): void {
    const disabled =
      this.configService.get<string>('AUTH_DISABLE_REGISTRATION') === '1';

    if (disabled) {
      throw new ForbiddenException('L\'inscription est désactivée');
    }
  }

  private assertRoleNotAdmin(role: UserRole): void {
    if (role === UserRole.admin) {
      throw new ForbiddenException(
        'La création d\'un compte administrateur via l\'API est interdite',
      );
    }
  }
}
