import type { Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from '../constants/auth-cookies.constant';

/** 60 jours en millisecondes */
export const REFRESH_TOKEN_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

type RefreshCookieSameSite = 'lax' | 'none';

function getRefreshCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: RefreshCookieSameSite;
  maxAge: number;
} {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    // En local HTTP, secure=true bloque le cookie.
    secure: isProduction,
    // Cross-origin prod (Vercel <-> Render) exige SameSite=None + Secure=true.
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  };
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, getRefreshCookieOptions());
}
