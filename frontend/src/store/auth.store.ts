import { create } from 'zustand';
import { authApi, AuthUser } from '../api/auth.api';
import type { LegalConsentState } from '../data/legal';
import {
  clearAdminAccessTokenBackup,
  clearSessionTokens,
  getAccessToken,
  getCsrfToken,
  isDevSession,
  setSessionTokens,
} from '../api/token-session';
import { useProjectsStore } from './projects.store';
import { useTasksStore } from './tasks.store';

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';
const DEV_TOKEN = 'dev-token';

const DEV_USER: AuthUser = {
  id: 'dev-user-001',
  email: 'ivan@psyboost.ru',
  name: 'Иван Петров',
  avatarUrl: null,
  role: 'USER',
  tariff: 'Pro',
  onboardingStatus: 'completed',
  onboardingStep: 5,
  onboardingVersion: 'b2b_v1',
  onboardingCompletedAt: null,
  onboardingData: null,
  recommendedRoute: '/app/tasks',
  createdProjectId: null,
};

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string, consents: LegalConsentState) => Promise<void>;
  register: (email: string, password: string, name: string | undefined, consents: LegalConsentState) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  setTokens: (accessToken: string, csrfToken?: string) => Promise<AuthUser | null>;
  loginAsTestUser: () => void;
}

function resetSessionStores() {
  useProjectsStore.getState().resetProjects();
  useTasksStore.getState().resetTasks();
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password, consents) => {
    clearSessionTokens();
    clearAdminAccessTokenBackup();
    const { user, tokens } = await authApi.login(email, password, consents);
    resetSessionStores();
    setSessionTokens(tokens.accessToken, tokens.csrfToken);
    set({ user, isAuthenticated: true });
  },

  register: async (email, password, name, consents) => {
    clearSessionTokens();
    clearAdminAccessTokenBackup();
    const { user, tokens } = await authApi.register(email, password, name, consents);
    resetSessionStores();
    setSessionTokens(tokens.accessToken, tokens.csrfToken);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    const accessToken = getAccessToken();
    if (accessToken && !isDevSession()) {
      await authApi.logout().catch(() => {});
    }
    clearSessionTokens();
    clearAdminAccessTokenBackup();
    resetSessionStores();
    set({ user: null, isAuthenticated: false });
  },

  restoreSession: async () => {
    // Dev mode: restore mock session without backend call
    if (DEV_MODE && isDevSession()) {
      resetSessionStores();
      set({ user: DEV_USER, isAuthenticated: true, isLoading: false });
      return;
    }

    try {
      if (!getAccessToken() && !getCsrfToken()) {
        resetSessionStores();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      if (!getAccessToken() && getCsrfToken()) {
        const refreshed = await authApi.refresh();
        setSessionTokens(refreshed.tokens.accessToken, refreshed.tokens.csrfToken);
      }
      const user = await authApi.me();
      resetSessionStores();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      clearSessionTokens();
      clearAdminAccessTokenBackup();
      resetSessionStores();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false });
      return user;
    } catch {
      return null;
    }
  },

  setTokens: async (accessToken, csrfToken) => {
    resetSessionStores();
    clearAdminAccessTokenBackup();
    setSessionTokens(accessToken, csrfToken);
    try {
      const user = await authApi.me();
      set({ user, isAuthenticated: true, isLoading: false });
      return user;
    } catch {
      clearSessionTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
      return null;
    }
  },

  loginAsTestUser: () => {
    if (!DEV_MODE) return;
    resetSessionStores();
    setSessionTokens(DEV_TOKEN, DEV_TOKEN);
    set({ user: DEV_USER, isAuthenticated: true });
  },
}));
