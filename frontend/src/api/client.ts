import axios from 'axios';

const DEV_TOKEN = 'dev-token';
const CSRF_STORAGE_KEY = 'csrfToken';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const csrfToken = localStorage.getItem(CSRF_STORAGE_KEY);
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

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    const accessToken = localStorage.getItem('accessToken');
    const csrfToken = localStorage.getItem(CSRF_STORAGE_KEY);

    // Dev mode: never redirect to login, just reject
    if (accessToken === DEV_TOKEN) {
      return Promise.reject(error);
    }

    if (!csrfToken) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem(CSRF_STORAGE_KEY);
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
      localStorage.setItem('accessToken', newAccess);
      if (newCsrf) localStorage.setItem(CSRF_STORAGE_KEY, newCsrf);

      waitQueue.forEach((cb) => cb(newAccess));
      waitQueue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem(CSRF_STORAGE_KEY);
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);
