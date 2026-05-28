const ACCESS_TOKEN_DEV = 'dev-token';
const CSRF_COOKIE = 'csrf_token';
const CSRF_SESSION_KEY = 'lumaiq_csrf_token';
const ADMIN_BACKUP_SESSION_KEY = 'lumaiq_admin_access_backup';

let accessToken: string | null = null;
let csrfToken: string | null = null;
let adminAccessTokenBackup: string | null = null;

function readSessionValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(key);
}

function writeSessionValue(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  if (value) window.sessionStorage.setItem(key, value);
  else window.sessionStorage.removeItem(key);
}

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
  return csrfToken ?? readSessionValue(CSRF_SESSION_KEY) ?? readCookie(CSRF_COOKIE);
}

export function setSessionTokens(nextAccessToken: string, nextCsrfToken?: string): void {
  accessToken = nextAccessToken;
  if (nextCsrfToken) {
    csrfToken = nextCsrfToken;
    writeSessionValue(CSRF_SESSION_KEY, nextCsrfToken);
  }
}

export function clearSessionTokens(): void {
  accessToken = null;
  csrfToken = null;
  writeSessionValue(CSRF_SESSION_KEY, null);
}

export function isDevSession(): boolean {
  return accessToken === ACCESS_TOKEN_DEV;
}

export function setAdminAccessTokenBackup(token: string | null): void {
  adminAccessTokenBackup = token;
  writeSessionValue(ADMIN_BACKUP_SESSION_KEY, token);
  window.dispatchEvent(new Event('admin-session-backup-changed'));
}

export function clearAdminAccessTokenBackup(): void {
  setAdminAccessTokenBackup(null);
}

export function consumeAdminAccessTokenBackup(): string | null {
  const token = adminAccessTokenBackup ?? readSessionValue(ADMIN_BACKUP_SESSION_KEY);
  adminAccessTokenBackup = null;
  writeSessionValue(ADMIN_BACKUP_SESSION_KEY, null);
  window.dispatchEvent(new Event('admin-session-backup-changed'));
  return token;
}

export function hasAdminAccessTokenBackup(): boolean {
  return Boolean(adminAccessTokenBackup ?? readSessionValue(ADMIN_BACKUP_SESSION_KEY));
}
