import { apiClient } from './client';

export interface AuthUser {
  id:             string;
  email:          string;
  name:           string | null;
  avatarUrl:      string | null;
  role:           string;
  tariff?:        string;
  specialization?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: TokenPair;
}

export const authApi = {
  register: (email: string, password: string, name?: string) =>
    apiClient.post<AuthResponse>('/auth/register', { email, password, name }).then((r) => r.data),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthResponse>('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }).then((r) => r.data),

  me: () =>
    apiClient.get<{ user: AuthUser }>('/auth/me').then((r) => r.data.user),

  oauthSession: () =>
    apiClient.get<AuthResponse>('/auth/oauth/session', { withCredentials: true }).then((r) => r.data),

  googleLogin: () => {
    window.location.href = '/api/v1/auth/google';
  },
};
