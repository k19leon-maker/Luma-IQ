export const APP_PREFIX = '/app';

export function appPath(path: string) {
  if (!path || path === '/') return APP_PREFIX;
  if (path.startsWith(`${APP_PREFIX}/`) || path === APP_PREFIX) return path;
  return `${APP_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}

export function stripAppPrefix(path: string) {
  if (path === APP_PREFIX) return '/dashboard';
  return path.startsWith(`${APP_PREFIX}/`) ? path.slice(APP_PREFIX.length) || '/dashboard' : path;
}
