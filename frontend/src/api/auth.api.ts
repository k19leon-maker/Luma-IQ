import { apiClient } from './client';
import { legalConsentPayload, type LegalConsentState } from '../data/legal';

const API_ORIGIN = import.meta.env.VITE_API_URL ?? '';

export interface AuthUser {
  id:             string;
  email:          string;
  name:           string | null;
  avatarUrl:      string | null;
  role:           string;
  isVerified?:    boolean;
  tariff?:        string;
  specialization?: string | null;
}

export interface TokenPair {
  accessToken: string;
  csrfToken?: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: TokenPair;
}

export const authApi = {
  register: (email: string, password: string, name: string | undefined, consents: LegalConsentState) =>
    apiClient.post<AuthResponse>('/auth/register', { email, password, name, consents: legalConsentPayload(consents) }).then((r) => r.data),

  login: (email: string, password: string, consents: LegalConsentState) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password, consents: legalConsentPayload(consents) }).then((r) => r.data),

  refresh: () =>
    apiClient.post<AuthResponse>('/auth/refresh').then((r) => r.data),

  logout: () =>
    apiClient.post('/auth/logout').then((r) => r.data),

  me: () =>
    apiClient.get<{ user: AuthUser }>('/auth/me').then((r) => r.data.user),

  oauthSession: () =>
    apiClient.get<AuthResponse>('/auth/oauth/session', { withCredentials: true }).then((r) => r.data),

  verifyEmail: (token: string) =>
    apiClient.get<{ message: string }>(`/auth/verify-email?token=${token}`).then((r) => r.data),

  resendVerification: () =>
    apiClient.post<{ message: string }>('/auth/resend-verification').then((r) => r.data),

  googleLogin: () => {
    window.location.href = `${API_ORIGIN}/api/v1/auth/google?legalConsent=1`;
  },
};
