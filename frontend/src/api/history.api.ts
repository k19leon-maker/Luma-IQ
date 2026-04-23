import { apiClient } from './client';

export interface HistoryItem {
  id:          string;
  type:        string;
  title:       string | null;
  content:     string;
  provider:    string | null;
  projectId:   string;
  projectName: string;
  createdAt:   string;
}

export const historyApi = {
  list: (limit = 50, offset = 0) =>
    apiClient
      .get<{ items: HistoryItem[] }>('/content/history', { params: { limit, offset } })
      .then((r) => r.data.items),
};
