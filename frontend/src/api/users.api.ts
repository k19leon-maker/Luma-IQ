import { apiClient } from './client';

export interface UserProfile {
  id:             string;
  email:          string;
  name:           string | null;
  avatarUrl:      string | null;
  avatarColor:    string | null;
  defaultAiModel: string | null;
  specialization: string | null;
  role:           string;
}

export const usersApi = {
  getMe: () =>
    apiClient.get<{ user: UserProfile }>('/users/me').then((r) => r.data.user),

  updateMe: (data: Partial<Pick<UserProfile, 'name' | 'avatarColor' | 'defaultAiModel' | 'specialization'>>) =>
    apiClient.patch<{ user: UserProfile }>('/users/me', data).then((r) => r.data.user),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ ok: boolean }>('/users/me/password', { currentPassword, newPassword }).then((r) => r.data),

  deleteMe: () =>
    apiClient.delete<{ ok: boolean }>('/users/me').then((r) => r.data),
};
