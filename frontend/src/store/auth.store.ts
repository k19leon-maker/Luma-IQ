import { create } from 'zustand';
import { authApi, AuthUser } from '../api/auth.api';
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

function saveTokens(accessToken: string, csrfToken?: string) {
  localStorage.setItem('accessToken', accessToken);
  if (csrfToken) localStorage.setItem('csrfToken', csrfToken);
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('csrfToken');
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
    saveTokens(tokens.accessToken, tokens.csrfToken);
    set({ user, isAuthenticated: true });
  },

  register: async (email, password, name) => {
    const { user, tokens } = await authApi.register(email, password, name);
    resetSessionStores();
    saveTokens(tokens.accessToken, tokens.csrfToken);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken && accessToken !== DEV_TOKEN) {
      await authApi.logout().catch(() => {});
    }
    clearTokens();
    resetSessionStores();
    set({ user: null, isAuthenticated: false });
  },

  restoreSession: async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      resetSessionStores();
      set({ isLoading: false });
      return;
    }

    // Dev mode: restore mock session without backend call
    if (DEV_MODE && accessToken === DEV_TOKEN) {
      resetSessionStores();
      set({ user: DEV_USER, isAuthenticated: true, isLoading: false });
      return;
    }

    try {
      const user = await authApi.me();
      resetSessionStores();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      resetSessionStores();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setTokens: (accessToken, csrfToken) => {
    resetSessionStores();
    saveTokens(accessToken, csrfToken);
    // Fetch user info after OAuth callback
    authApi.me().then((user) => {
      set({ user, isAuthenticated: true });
    });
  },

  loginAsTestUser: () => {
    if (!DEV_MODE) return;
    resetSessionStores();
    saveTokens(DEV_TOKEN, DEV_TOKEN);
    set({ user: DEV_USER, isAuthenticated: true });
  },
}));
