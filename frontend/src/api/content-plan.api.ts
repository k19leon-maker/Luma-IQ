import { apiClient } from './client';

export interface ApiContentPlanItem {
  id:        string;
  projectId: string;
  type:      string;
  title:     string;
  content:   string | null;
  platform:  string | null;
  status:    string;
  date:      string;
  sourceId:  string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiContentPlanCreateResult {
  item: ApiContentPlanItem;
  created: boolean;
}

export const contentPlanApi = {
  list: (projectId: string) =>
    apiClient
      .get<{ items: ApiContentPlanItem[] }>('/content-plan', { params: { projectId } })
      .then((r) => r.data.items),

  create: (data: {
    projectId: string;
    type:      string;
    title:     string;
    content?:  string;
    platform?: string;
    status?:   string;
    date:      string;
    sourceId?: string;
  }) =>
    apiClient.post<ApiContentPlanCreateResult>('/content-plan', data).then((r) => r.data),

  update: (id: string, data: { title?: string; content?: string; status?: string; date?: string; platform?: string }) =>
    apiClient.patch<{ item: ApiContentPlanItem }>(`/content-plan/${id}`, data).then((r) => r.data.item),

  remove: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/content-plan/${id}`).then((r) => r.data),
};
