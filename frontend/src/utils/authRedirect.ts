export const DEFAULT_AFTER_AUTH = '/app/ai-dialog';

const AUTH_PATHS = new Set(['/auth', '/login', '/app/auth', '/app/login', '/register']);

export function getSafeAfterAuthPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return DEFAULT_AFTER_AUTH;
  }

  const [pathname] = nextPath.split(/[?#]/);
  return AUTH_PATHS.has(pathname) ? DEFAULT_AFTER_AUTH : nextPath;
}

export function authNextLink(path: string, nextPath: string | null) {
  const safeNextPath = getSafeAfterAuthPath(nextPath);
  if (safeNextPath === DEFAULT_AFTER_AUTH) return path;
  return `${path}?next=${encodeURIComponent(safeNextPath)}`;
}
