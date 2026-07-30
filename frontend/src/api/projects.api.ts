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

export const INSTAGRAM_PACKAGING_VERSION = 1 as const;

export interface InstagramStoryDraft {
  id: string;
  title: string;
  position: number;
}

export interface InstagramHighlightDraft {
  id: string;
  title: string;
  goal: string;
  description: string;
  icon: string;
  position: number;
  stories: InstagramStoryDraft[];
}

export interface InstagramProfileHeader {
  username: string;
  displayName: string;
  category: string;
  bio: string;
  callToAction: string;
  link: string;
  logicExplanation: string;
}

export interface InstagramPackaging {
  version: typeof INSTAGRAM_PACKAGING_VERSION;
  profileHeader: InstagramProfileHeader;
  highlights: InstagramHighlightDraft[];
  updatedAt: string;
  metadata?: {
    importedFrom?: 'generatedData.social.instagram';
    legacyInstagramText?: string;
  };
}

export type SaveInstagramPackagingInput = Omit<InstagramPackaging, 'updatedAt' | 'metadata'>;
export type InstagramPackagingSource = 'current' | 'legacy' | 'empty';
export interface InstagramFieldLimit {
  label: string;
  max: number;
  required: boolean;
  pattern?: string;
  patternHint?: string;
  format?: 'http_url';
}

export interface InstagramPackagingLimits {
  version: number;
  verifiedAt: string;
  characterCounting: 'unicode_code_points';
  fields: Record<keyof InstagramProfileHeader, InstagramFieldLimit>;
  combined: {
    bioAndCallToAction: {
      label: string;
      fields: ['bio', 'callToAction'];
      separator: string;
      max: number;
    };
  };
}

export interface InstagramPackagingResponse {
  packaging: InstagramPackaging;
  source: InstagramPackagingSource;
  limits: InstagramPackagingLimits;
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

  setArchived: (id: string, archived: boolean) =>
    apiClient.patch<{ project: Project }>(`/projects/${id}/archive`, { archived }).then((r) => r.data.project),

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

  getInstagramPackaging: (id: string) =>
    apiClient
      .get<InstagramPackagingResponse>(`/projects/${id}/instagram-packaging`)
      .then((r) => r.data),

  saveInstagramPackaging: (id: string, data: SaveInstagramPackagingInput) =>
    apiClient
      .put<InstagramPackagingResponse>(`/projects/${id}/instagram-packaging`, data)
      .then((r) => r.data),
};

export const paymentApi = {
  createPayment: (plan: 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL') =>
    apiClient.post<{ confirmationUrl: string; paymentId: string }>('/payments/create', { plan }).then((r) => r.data),

  getSubscription: () =>
    apiClient.get<{ subscription: { plan: string; status: string; expiresAt: string | null } }>('/payments/subscription').then((r) => r.data.subscription),
};
