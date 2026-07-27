import axios from 'axios';
import {
  clearSessionTokens,
  getAccessToken,
  getAdminReturnCsrfToken,
  getCsrfToken,
  isDevSession,
  setSessionTokens,
} from './token-session';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

const AUTH_LOGIN_RETRY_DELAYS_MS = [400, 1_200];
const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'ERR_NETWORK',
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
]);

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 25_000,
});

function isTransientLoginNetworkError(error: unknown) {
  if (!axios.isAxiosError(error) || error.response || !error.config) {
    return false;
  }

  const requestUrl = typeof error.config.url === 'string' ? error.config.url : '';
  return requestUrl.includes('/auth/login')
    && (!error.code || TRANSIENT_NETWORK_ERROR_CODES.has(error.code));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const method = config.method?.toUpperCase();
  const requestUrl = typeof config.url === 'string' ? config.url : '';
  const csrfToken = requestUrl.includes('/auth/admin/restore-impersonation')
    ? getAdminReturnCsrfToken()
    : getCsrfToken();
  if (csrfToken && method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (requestUrl.includes('/auth/admin/restore-impersonation')) {
      config.headers['X-Admin-Return-CSRF-Token'] = csrfToken;
    } else {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// Auto-refresh on 401 (skip for dev sessions)
let isRefreshing = false;
let waitQueue: Array<(token: string) => void> = [];

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const requestUrl = typeof original?.url === 'string' ? original.url : '';
    const isAuthRequest = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/oauth/session'].some((path) =>
      requestUrl.includes(path),
    );

    if (isTransientLoginNetworkError(error)) {
      const retryCount = Number(original._authNetworkRetryCount ?? 0);
      const retryDelay = AUTH_LOGIN_RETRY_DELAYS_MS[retryCount];
      if (retryDelay !== undefined) {
        original._authNetworkRetryCount = retryCount + 1;
        await wait(retryDelay);
        return apiClient(original);
      }
    }

    if (error.response?.data?.error === 'LIMIT_EXCEEDED' && error.response.data.message) {
      error.response.data.error = error.response.data.message;
    }
    if (typeof error.response?.data?.userMessage === 'string') {
      error.response.data.error = error.response.data.userMessage;
    }

    if (!error.response || error.response.status !== 401 || original?._retry || isAuthRequest) {
      return Promise.reject(error);
    }

    // Dev mode: never redirect to login, just reject
    if (isDevSession()) {
      return Promise.reject(error);
    }

    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      clearSessionTokens();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve) => {
        waitQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(original));
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${API_BASE}/auth/refresh`, undefined, {
        withCredentials: true,
        headers: { 'X-CSRF-Token': csrfToken },
      });
      const { accessToken: newAccess, csrfToken: newCsrf } = data.tokens;
      setSessionTokens(newAccess, newCsrf);

      waitQueue.forEach((cb) => cb(newAccess));
      waitQueue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch {
      clearSessionTokens();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);
