import axios from 'axios';
import {
  clearSessionTokens,
  getAccessToken,
  getCsrfToken,
  isDevSession,
  setSessionTokens,
} from './token-session';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 25_000,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const csrfToken = getCsrfToken();
  const method = config.method?.toUpperCase();
  if (csrfToken && method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
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

    if (!error.response || error.response.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Dev mode: never redirect to login, just reject
    if (isDevSession()) {
      return Promise.reject(error);
    }

    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      clearSessionTokens();
      window.location.href = '/login';
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
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);
