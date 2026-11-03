import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Employe, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { normalizeEmail } from '../../common/employe-link/employe-link';
import { PrismaService } from '../../prisma/prisma.service';
import { ActiviteService } from '../activite/activite.service';
import { EmployesService } from '../employes/employes.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { RefreshTokenService } from './refresh-token.service';
import {
  AuthLoginResult,
  JwtPayload,
  UserMePayload,
  UserPayload,
} from './types/auth.types';
import { ActiveSessionDto, SessionMeta } from './types/session.types';
import { omitPasswordHash } from './utils/omit-password.util';

export type RegisteredEmployee = {
  user: UserPayload & { employeId: number };
  employe: Employe;
};

@Injectable()
export class AuthService {
  private readonly bcryptRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly activiteService: ActiviteService,
    private readonly employesService: EmployesService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return null;
    }

    if (user.isActive === false) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return null;
    }

    await this.usersService.updateLastLogin(user.id);

    return user;
  }

  async login(user: UserPayload, meta: SessionMeta): Promise<AuthLoginResult> {
    await this.activiteService.log('connexion', `Connexion de ${user.email}`, null, {
      role: user.role,
    });

    return this.issueTokens(user, meta);
  }

  /** Création d'un compte RH / manager par un admin : aucune session n'est ouverte pour le compte créé. */
  register(dto: RegisterDto, creatorRole: UserRole): Promise<UserResponseDto> {
    return this.usersService.create(
      {
        email: dto.email,
        password: dto.password,
        nom: dto.nom,
        prenom: dto.prenom,
        role: dto.role,
        salaireBase: dto.salaireBase,
      },
      creatorRole,
    );
  }

  async getMe(userId: number): Promise<UserMePayload> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return this.enrichUserProfile(omitPasswordHash(user));
  }

  private async enrichUserProfile(user: UserPayload): Promise<UserMePayload> {
    const employe = await this.employesService.findEmployeForUser({
      id: user.id,
      email: user.email,
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

  /**
   * Création par la RH d'un compte employé et de sa fiche liée (ou rattachement à la
   * fiche existante de même email). Aucune session n'est ouverte pour le compte créé.
   */
  async registerEmployee(dto: RegisterEmployeeDto): Promise<RegisteredEmployee> {
    const email = normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    const { user, employe } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          nom: dto.nom,
          prenom: dto.prenom,
          role: UserRole.employee,
        },
      });

      const orphan = await tx.employe.findFirst({
        where: {
          deletedAt: null,
          userId: null,
          email: { equals: email, mode: 'insensitive' },
        },
        orderBy: { id: 'asc' },
      });

      if (orphan) {
        const employe = await tx.employe.update({
          where: { id: orphan.id },
          data: { userId: user.id },
        });
        return { user, employe };
      }

      const created = await tx.employe.create({
        data: {
          nom: dto.nom,
          prenom: dto.prenom,
          email,
          userId: user.id,
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

      const employe = await tx.employe.update({
        where: { id: created.id },
        data: { matricule: this.formatMatricule(created.id) },
      });

      return { user, employe };
    });

    await this.activiteService.log(
      'inscription_employe',
      `Compte employé créé : ${dto.nom} ${dto.prenom} (${email})`,
      employe.id,
    );

    return {
      user: { ...omitPasswordHash(user), employeId: employe.id },
      employe,
    };
  }

  async refreshFromCookie(
    refreshToken: string,
    meta: SessionMeta,
  ): Promise<AuthLoginResult> {
    const { userId, refreshToken: newRefreshToken } =
      await this.refreshTokenService.rotate(refreshToken, meta);

    const user = await this.usersService.findById(userId);

    if (!user || user.isActive === false) {
      await this.refreshTokenService.revokeAllForUser(userId);
      throw new UnauthorizedException('Utilisateur introuvable ou désactivé');
    }

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
    });

    return {
      accessToken,
      access_token: accessToken,
      user: await this.enrichUserProfile(omitPasswordHash(user)),
      refreshToken: newRefreshToken,
    };
  }

  async logoutFromCookie(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.refreshTokenService.revokeByToken(refreshToken);
    }
  }

  async logoutAll(userId: number): Promise<{ revoked: number }> {
    const revoked = await this.refreshTokenService.revokeAllForUser(userId);
    return { revoked };
  }

  async listSessions(
    userId: number,
    currentRefreshToken?: string,
  ): Promise<ActiveSessionDto[]> {
    const currentTokenId = currentRefreshToken
      ? this.refreshTokenService.parseTokenId(currentRefreshToken)
      : null;

    return this.refreshTokenService.listActiveSessions(userId, currentTokenId);
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.bcryptRounds);
  }

  private async issueTokens(
    user: UserPayload,
    meta: SessionMeta,
  ): Promise<AuthLoginResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
    };

    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.refreshTokenService.create(user.id, meta);

    return {
      accessToken,
      access_token: accessToken,
      user: await this.enrichUserProfile(user),
      refreshToken,
    };
  }

  private signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  private formatMatricule(id: number): string {
    return `EMP-${String(id).padStart(6, '0')}`;
  }
}
