import { apiClient } from './client';

export interface AdminSubscription {
  plan: string;
  status: string;
  expiresAt: string | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  subscription: AdminSubscription;
  projectCount: number;
  generatedTextCount: number;
  aiRequestCount: number;
  ltv: number;
  currentStage: string;
}

export interface AdminUserDetail extends AdminUserListItem {
  specialization: string | null;
  payments: Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    yookassaId: string | null;
    createdAt: string;
  }>;
  aiUsage: Array<{
    id: string;
    date: string;
    count: number;
  }>;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    currentStage: string;
    createdAt: string;
    updatedAt: string;
    productsCount: number;
    generatedTextsCount: number;
    contentPlanItemsCount: number;
  }>;
}

export const adminApi = {
  listUsers: (params?: { q?: string; plan?: string; limit?: number; offset?: number }) =>
    apiClient
      .get<{ users: AdminUserListItem[]; total: number; limit: number; offset: number }>('/admin/users', { params })
      .then((r) => r.data),

  getUser: (id: string) =>
    apiClient
      .get<{ user: AdminUserDetail }>(`/admin/users/${id}`)
      .then((r) => r.data.user),

  grantPro: (data: { email: string; name?: string; password?: string; plan: 'PRO' | 'ANNUAL'; months: number }) =>
    apiClient
      .post<{ ok: boolean; user: { id: string; email: string; name: string | null }; subscription: AdminSubscription }>('/admin/users/grant-pro', data)
      .then((r) => r.data),
};
