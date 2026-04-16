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

  completeStrategy: (
    id: string,
    data: { summary?: string; strategyData?: Record<string, unknown> },
  ) =>
    apiClient
      .post<{ project: Project }>(`/projects/${id}/complete-strategy`, data)
      .then((r) => r.data.project),
};
