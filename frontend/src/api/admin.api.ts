import { apiClient } from './client';
import type { AuthResponse } from './auth.api';

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
  lastActivityAt: string;
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
    source: string;
    externalId: string | null;
    adminNote: string | null;
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
  aiRequestLogs: Array<{
    id: string;
    provider: string;
    section: string | null;
    model: string | null;
    status: string;
    isMock: boolean;
    error: string | null;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
}

export interface AdminDashboard {
  metrics: {
    totalUsers: number;
    newUsers7d: number;
    activePro: number;
    revenue: number;
    averageLtv: number;
    aiTotal: number;
    aiToday: number;
  };
  ai: {
    byProvider: Array<{ provider: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
  };
  recentEvents: Array<{
    id: string;
    type: string;
    userId: string | null;
    actorId: string | null;
    metadata: unknown;
    createdAt: string;
    user: { email: string; name: string | null } | null;
  }>;
}

export const adminApi = {
  dashboard: () =>
    apiClient
      .get<AdminDashboard>('/admin/dashboard')
      .then((r) => r.data),

  listUsers: (params?: { q?: string; plan?: string; limit?: number; offset?: number }) =>
    apiClient
      .get<{ users: AdminUserListItem[]; total: number; limit: number; offset: number }>('/admin/users', { params })
      .then((r) => r.data),

  getUser: (id: string) =>
    apiClient
      .get<{ user: AdminUserDetail }>(`/admin/users/${id}`)
      .then((r) => r.data.user),

  grantPro: (data: {
    email: string;
    name?: string;
    password?: string;
    plan: 'PRO' | 'ANNUAL';
    months: number;
    paymentSource: 'TRIBUTE' | 'MANUAL' | 'PROMO';
    amount?: number;
    externalId?: string;
    adminNote?: string;
  }) =>
    apiClient
      .post<{ ok: boolean; user: { id: string; email: string; name: string | null }; subscription: AdminSubscription }>('/admin/users/grant-pro', data)
      .then((r) => r.data),

  impersonateUser: (id: string) =>
    apiClient
      .post<AuthResponse>(`/admin/users/${id}/impersonate`)
      .then((r) => r.data),
};
