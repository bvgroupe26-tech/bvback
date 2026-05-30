import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from '../constants/auth-cookies.constant';

function parseExpiresInToMs(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 60 * 24 * 60 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] ?? multipliers.d);
}

const cookieBaseOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/api/auth',
};

export function setRefreshTokenCookie(
  res: Response,
  token: string,
  configService: ConfigService,
): void {
  const expiresIn = configService.get<string>(
    'REFRESH_TOKEN_EXPIRES_IN',
    '60d',
  );
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...cookieBaseOptions,
    secure: isProduction,
    maxAge: parseExpiresInToMs(expiresIn),
  });
}

export function clearRefreshTokenCookie(
  res: Response,
  configService: ConfigService,
): void {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...cookieBaseOptions,
    secure: false,
  });

  if (isProduction) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...cookieBaseOptions,
      secure: true,
    });
  }
}
