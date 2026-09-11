import { apiClient } from './client';

export interface LinkedTelegramAccount {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  status: 'LINKED' | 'PENDING' | 'REVOKED' | 'BLOCKED';
  linkedAt: string | null;
}

export const telegramAccountApi = {
  link: (token: string) => apiClient
    .post<{ telegramAccount: LinkedTelegramAccount }>('/telegram-account/link', { token })
    .then((response) => response.data.telegramAccount),
};
