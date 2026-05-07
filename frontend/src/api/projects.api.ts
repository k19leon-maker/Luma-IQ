import { apiClient } from './client';

export interface Project {
  id: string;
  name: string;
  niche: string | null;
  description: string | null;
  status: 'DRAFT' | 'STRATEGY_COMPLETED' | 'ARCHIVED';
  strategySummary: string | null;
  strategyCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const projectsApi = {
  list: () =>
    apiClient.get<{ projects: Project[] }>('/projects').then((r) => r.data.projects),

  create: (data: { name: string; niche?: string; description?: string }) =>
    apiClient.post<{ project: Project }>('/projects', data).then((r) => r.data.project),

  get: (id: string) =>
    apiClient.get<{ project: Project }>(`/projects/${id}`).then((r) => r.data.project),

  update: (id: string, data: Partial<Pick<Project, 'name' | 'niche' | 'description'>>) =>
    apiClient.patch<{ project: Project }>(`/projects/${id}`, data).then((r) => r.data.project),

  delete: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/projects/${id}`).then((r) => r.data),

  completeStrategy: (
    id: string,
    data: { summary?: string; strategyData?: Record<string, unknown> },
  ) =>
    apiClient
      .post<{ project: Project }>(`/projects/${id}/complete-strategy`, data)
      .then((r) => r.data.project),

  getStrategy: (id: string) =>
    apiClient
      .get<{ strategyData: Record<string, unknown> | null }>(`/projects/${id}/strategy`)
      .then((r) => r.data.strategyData),

  saveStrategy: (id: string, data: Record<string, unknown>) =>
    apiClient
      .patch<{ ok: boolean }>(`/projects/${id}/strategy`, data)
      .then((r) => r.data),

  saveUnpacking: (id: string, data: Record<string, unknown>) =>
    apiClient
      .patch<{ ok: boolean }>(`/projects/${id}/strategy`, { unpackingData: data })
      .then((r) => r.data),

  getUnpacking: (id: string) =>
    apiClient
      .get<{ strategyData: Record<string, unknown> | null }>(`/projects/${id}/strategy`)
      .then((r) => (r.data.strategyData as Record<string, unknown> | null)?.['unpackingData'] as Record<string, unknown> | null ?? null),
};

export const paymentApi = {
  createPayment: (plan: 'PRO' | 'ANNUAL') =>
    apiClient.post<{ confirmationUrl: string; paymentId: string }>('/payments/create', { plan }).then((r) => r.data),

  getSubscription: () =>
    apiClient.get<{ subscription: { plan: string; status: string; expiresAt: string | null } }>('/payments/subscription').then((r) => r.data.subscription),
};
