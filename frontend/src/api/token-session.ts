const ACCESS_TOKEN_DEV = 'dev-token';
const CSRF_COOKIE = 'csrf_token';

let accessToken: string | null = null;
let csrfToken: string | null = null;
let adminAccessTokenBackup: string | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getCsrfToken(): string | null {
  return csrfToken ?? readCookie(CSRF_COOKIE);
}

export function setSessionTokens(nextAccessToken: string, nextCsrfToken?: string): void {
  accessToken = nextAccessToken;
  if (nextCsrfToken) csrfToken = nextCsrfToken;
}

export function clearSessionTokens(): void {
  accessToken = null;
  csrfToken = null;
}

export function isDevSession(): boolean {
  return accessToken === ACCESS_TOKEN_DEV;
}

export function setAdminAccessTokenBackup(token: string | null): void {
  adminAccessTokenBackup = token;
  window.dispatchEvent(new Event('admin-session-backup-changed'));
}

export function consumeAdminAccessTokenBackup(): string | null {
  const token = adminAccessTokenBackup;
  adminAccessTokenBackup = null;
  window.dispatchEvent(new Event('admin-session-backup-changed'));
  return token;
}

export function hasAdminAccessTokenBackup(): boolean {
  return Boolean(adminAccessTokenBackup);
}
