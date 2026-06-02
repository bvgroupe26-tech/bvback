import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ActiveSessionDto, SessionMeta } from './types/session.types';

export interface RefreshRotationResult {
  userId: number;
  refreshToken: string;
}

interface RefreshJwtPayload {
  sub: number;
  tid: number;
  type: 'refresh';
}

@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly bcryptRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshSecret(): string {
    const secret =
      this.configService.get<string>('REFRESH_TOKEN_SECRET') ??
      this.configService.get<string>('AUTH_SECRET');

    if (!secret) {
      throw new Error(
        'REFRESH_TOKEN_SECRET ou AUTH_SECRET est requis dans les variables d\'environnement',
      );
    }

    return secret;
  }

  private getRefreshExpiresIn(): string {
    return this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '60d');
  }

  private computeExpiresAt(): Date {
    const expiresIn = this.getRefreshExpiresIn();
    const match = expiresIn.match(/^(\d+)([smhd])$/);

    if (!match) {
      return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * (multipliers[unit] ?? multipliers.d));
  }

  async create(userId: number, meta: SessionMeta): Promise<string> {
    const expiresAt = this.computeExpiresAt();
    const placeholderHash = await bcrypt.hash('pending', this.bcryptRounds);

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: placeholderHash,
        deviceInfo: meta.deviceInfo ?? null,
        ipAddress: meta.ipAddress ?? null,
        expiresAt,
      },
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, tid: record.id, type: 'refresh' } satisfies RefreshJwtPayload,
      {
        secret: this.getRefreshSecret(),
        expiresIn: this.getRefreshExpiresIn() as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: {
        tokenHash: await bcrypt.hash(refreshToken, this.bcryptRounds),
      },
    });

    return refreshToken;
  }

  async rotate(
    refreshToken: string,
    meta: SessionMeta,
  ): Promise<RefreshRotationResult> {
    let payload: RefreshJwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshJwtPayload>(
        refreshToken,
        { secret: this.getRefreshSecret() },
      );
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    if (payload.type !== 'refresh' || !payload.sub || !payload.tid) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.tid },
    });

    if (!record || record.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (record.revokedAt) {
      await this.revokeAllForUser(record.userId);
      this.logger.warn(
        `Réutilisation d'un refresh token révoqué — userId=${record.userId}`,
      );
      throw new UnauthorizedException(
        'Session compromise — toutes les sessions ont été révoquées',
      );
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expiré');
    }

    const hashValid = await bcrypt.compare(refreshToken, record.tokenHash);

    if (!hashValid) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = await this.create(payload.sub, meta);

    return {
      userId: payload.sub,
      refreshToken: newRefreshToken,
    };
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    let payload: RefreshJwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshJwtPayload>(
        refreshToken,
        {
          secret: this.getRefreshSecret(),
          ignoreExpiration: true,
        },
      );
    } catch {
      return;
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.tid },
    });

    if (!record || record.userId !== payload.sub || record.revokedAt) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: number): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  async listActiveSessions(
    userId: number,
    currentTokenId?: number | null,
  ): Promise<ActiveSessionDto[]> {
    const now = new Date();
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return tokens.map((token) => ({
      ...token,
      current: currentTokenId != null && token.id === currentTokenId,
    }));
  }

  parseTokenId(refreshToken: string): number | null {
    const decoded = this.jwtService.decode(refreshToken) as RefreshJwtPayload | null;
    return decoded?.tid ?? null;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const threshold = new Date();
    const revokedCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: threshold } }, { revokedAt: { lt: revokedCutoff } }],
      },
    });

    return result.count;
  }
}
