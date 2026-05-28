import { create } from 'zustand';
import { authApi, AuthUser } from '../api/auth.api';
import { clearSessionTokens, getAccessToken, getCsrfToken, isDevSession, setSessionTokens } from '../api/token-session';
import { useProjectsStore } from './projects.store';

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';
const DEV_TOKEN = 'dev-token';

const DEV_USER: AuthUser = {
  id: 'dev-user-001',
  email: 'ivan@psyboost.ru',
  name: 'Иван Петров',
  avatarUrl: null,
  role: 'USER',
  tariff: 'Pro',
};

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setTokens: (accessToken: string, csrfToken?: string) => void;
  loginAsTestUser: () => void;
}

function resetSessionStores() {
  useProjectsStore.getState().resetProjects();
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const { user, tokens } = await authApi.login(email, password);
    resetSessionStores();
    setSessionTokens(tokens.accessToken, tokens.csrfToken);
    set({ user, isAuthenticated: true });
  },

  register: async (email, password, name) => {
    const { user, tokens } = await authApi.register(email, password, name);
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
      if (!getAccessToken() && getCsrfToken()) {
        const refreshed = await authApi.refresh();
        setSessionTokens(refreshed.tokens.accessToken, refreshed.tokens.csrfToken);
      }
      const user = await authApi.me();
      resetSessionStores();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      clearSessionTokens();
      resetSessionStores();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setTokens: (accessToken, csrfToken) => {
    resetSessionStores();
    setSessionTokens(accessToken, csrfToken);
    // Fetch user info after OAuth callback
    authApi.me().then((user) => {
      set({ user, isAuthenticated: true });
    });
  },

  loginAsTestUser: () => {
    if (!DEV_MODE) return;
    resetSessionStores();
    setSessionTokens(DEV_TOKEN, DEV_TOKEN);
    set({ user: DEV_USER, isAuthenticated: true });
  },
}));
