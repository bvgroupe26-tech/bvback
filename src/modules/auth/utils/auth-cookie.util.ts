import type { Response } from 'express';
import { REFRESH_TOKEN_COOKIE } from '../constants/auth-cookies.constant';

/** 60 jours en millisecondes */
export const REFRESH_TOKEN_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

const refreshCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  maxAge: REFRESH_TOKEN_MAX_AGE_MS,
};

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, refreshCookieOptions);
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions);
}
