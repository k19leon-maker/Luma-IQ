import { apiClient } from './client';

export type ContentType = 'POST' | 'REEL' | 'ARTICLE' | 'VIDEO_SCRIPT' | 'CHATBOT_CHAIN' | 'OTHER';

export interface ContentItem {
  id:        string;
  projectId: string;
  type:      ContentType;
  title:     string | null;
  content:   string;
  provider:  string | null;  // used as platform
  isMock:    boolean;
  metadata:  Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const contentApi = {
  list: (projectId: string, type?: ContentType) =>
    apiClient
      .get<{ items: ContentItem[] }>('/content', { params: { projectId, type } })
      .then((r) => r.data.items),

  create: (data: {
    projectId: string;
    type:      ContentType;
    title?:    string;
    content:   string;
    platform?: string;
    isMock?:   boolean;
    metadata?: Record<string, unknown>;
  }) =>
    apiClient.post<{ item: ContentItem }>('/content', data).then((r) => r.data.item),

  update: (id: string, data: { title?: string; content?: string; metadata?: Record<string, unknown> }) =>
    apiClient.patch<{ item: ContentItem }>(`/content/${id}`, data).then((r) => r.data.item),

  remove: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/content/${id}`).then((r) => r.data),
};
