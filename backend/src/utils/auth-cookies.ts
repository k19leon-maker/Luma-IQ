import crypto from 'crypto';
import { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';

export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
export const ADMIN_RETURN_REFRESH_COOKIE = 'admin_return_refresh_token';
export const ADMIN_RETURN_CSRF_COOKIE = 'admin_return_csrf_token';
export const ADMIN_RETURN_CSRF_HEADER = 'x-admin-return-csrf-token';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
};

const csrfCookieOptions: CookieOptions = {
  httpOnly: false,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

export function csrfTokenFor(refreshToken: string): string {
  return crypto
    .createHmac('sha256', env.JWT_REFRESH_SECRET)
    .update(refreshToken)
    .digest('hex');
}

export function setRefreshCookie(res: Response, refreshToken: string): string {
  const csrfToken = csrfTokenFor(refreshToken);
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...csrfCookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return csrfToken;
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.clearCookie(CSRF_COOKIE, csrfCookieOptions);
}

export function getRefreshCookie(req: Request): string | undefined {
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
}

export function setAdminReturnCookie(res: Response, refreshToken: string): string {
  const csrfToken = csrfTokenFor(refreshToken);
  res.cookie(ADMIN_RETURN_REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.cookie(ADMIN_RETURN_CSRF_COOKIE, csrfToken, {
    ...csrfCookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return csrfToken;
}

export function clearAdminReturnCookie(res: Response): void {
  res.clearCookie(ADMIN_RETURN_REFRESH_COOKIE, cookieOptions);
  res.clearCookie(ADMIN_RETURN_CSRF_COOKIE, csrfCookieOptions);
}

export function getAdminReturnCookie(req: Request): string | undefined {
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[ADMIN_RETURN_REFRESH_COOKIE];
}

export function assertAdminReturnCsrf(req: Request, refreshToken: string): boolean {
  const header = req.header(ADMIN_RETURN_CSRF_HEADER);
  if (!header) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(csrfTokenFor(refreshToken));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function assertRefreshCsrf(req: Request, refreshToken: string): boolean {
  const header = req.header(CSRF_HEADER);
  if (!header) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(csrfTokenFor(refreshToken));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
