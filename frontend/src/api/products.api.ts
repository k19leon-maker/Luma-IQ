import { apiClient } from './client';

export type ProductType = 'FREE' | 'MINI' | 'MAIN';

export interface ApiProduct {
  id:               string;
  projectId:        string;
  type:             ProductType;
  title:            string;
  format:           string | null;
  shortDescription: string | null;
  transformation:   string | null;
  offer:            string | null;
  priceText:        string | null;
  isAiGenerated:    boolean;
  createdAt:        string;
  updatedAt:        string;
}

export const productsApi = {
  list: (projectId: string, type?: ProductType) =>
    apiClient
      .get<{ products: ApiProduct[] }>('/products', { params: { projectId, type } })
      .then((r) => r.data.products),

  create: (data: {
    projectId: string;
    type:      ProductType;
    title:     string;
    content?:  string;
    isAiGenerated?: boolean;
  }) =>
    apiClient.post<{ product: ApiProduct }>('/products', data).then((r) => r.data.product),

  update: (id: string, data: { title?: string; content?: string }) =>
    apiClient.patch<{ product: ApiProduct }>(`/products/${id}`, data).then((r) => r.data.product),

  remove: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/products/${id}`).then((r) => r.data),
};
