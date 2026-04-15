import axios from 'axios';

const DEV_TOKEN = 'dev-token';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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

    const accessToken  = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    // Dev mode: never redirect to login, just reject
    if (accessToken === DEV_TOKEN || refreshToken === DEV_TOKEN) {
      return Promise.reject(error);
    }

    if (!refreshToken) {
      localStorage.removeItem('accessToken');
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
      const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
      const { accessToken: newAccess, refreshToken: newRefresh } = data.tokens;
      localStorage.setItem('accessToken', newAccess);
      localStorage.setItem('refreshToken', newRefresh);

      waitQueue.forEach((cb) => cb(newAccess));
      waitQueue = [];

      original.headers.Authorization = `Bearer ${newAccess}`;
      return apiClient(original);
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);
