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
import { RefreshTokenService } from './refresh-token.service';
import {
  AuthLoginResult,
  AuthTokenResponse,
  JwtPayload,
  UserMePayload,
  UserPayload,
} from './types/auth.types';
import { ActiveSessionDto, SessionMeta } from './types/session.types';
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
    private readonly refreshTokenService: RefreshTokenService,
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

  async login(user: UserPayload, meta: SessionMeta): Promise<AuthLoginResult> {
    await this.activiteService.log('connexion', `Connexion de ${user.email}`, null, {
      role: user.role,
    });

    return this.issueTokens(user, meta);
  }

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthLoginResult> {
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

    return this.login(omitPasswordHash(user), meta);
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

  async registerEmployee(
    dto: RegisterEmployeeDto,
    meta: SessionMeta,
  ): Promise<AuthLoginResult> {
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

    return this.login(omitPasswordHash(user), meta);
  }

  /** @deprecated Préférer POST /auth/refresh (cookie HttpOnly). */
  async refreshToken(userId: number): Promise<AuthTokenResponse> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
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
    };
  }

  async refreshFromCookie(
    refreshToken: string,
    meta: SessionMeta,
  ): Promise<AuthLoginResult> {
    const { userId, refreshToken: newRefreshToken } =
      await this.refreshTokenService.rotate(refreshToken, meta);

    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
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
