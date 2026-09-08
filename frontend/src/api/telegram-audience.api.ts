import { apiClient } from './client';

export type TelegramSubscriberStatus = 'ACTIVE' | 'STOPPED' | 'BLOCKED' | 'ARCHIVED';

export interface TelegramAudienceTag {
  id: string;
  name: string;
  color: string | null;
  assignedAt: string;
}

export interface TelegramAudienceEnrollment {
  id: string;
  status: 'ACTIVE' | 'WAITING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
  currentNodeId: string | null;
  source: string;
  startParameter: string | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  stoppedAt: string | null;
  scenario: { id: string; name: string; status: string };
}

export interface TelegramAudienceSubscriber {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  status: TelegramSubscriberStatus;
  source: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  tags: TelegramAudienceTag[];
  currentEnrollment: TelegramAudienceEnrollment | null;
}

export interface TelegramAudienceSubscriberDetails extends Omit<TelegramAudienceSubscriber, 'currentEnrollment'> {
  enrollments: TelegramAudienceEnrollment[];
  activity: { delivered: number; failed: number; buttonClicks: number; goalsReached: number };
}

export interface TelegramAudienceAnalytics {
  period: { from: string; to: string };
  metrics: {
    activeSubscribers: number;
    newSubscribers: number;
    entries: number;
    completed: number;
    delivered: number;
    failed: number;
    buttonClicks: number;
    goalsReached: number;
  };
  semantics: { telegramReadReceiptsSupported: false; note: string };
}

export const telegramAudienceApi = {
  list: (botId: string, params: { status?: TelegramSubscriberStatus; search?: string; limit?: number; offset?: number }, signal?: AbortSignal) =>
    apiClient.get<{
      subscribers: TelegramAudienceSubscriber[];
      pagination: { total: number; limit: number; offset: number; hasMore: boolean };
    }>(`/telegram-bots/${botId}/audience/subscribers`, { params, signal }).then((response) => response.data),

  get: (botId: string, subscriberId: string, signal?: AbortSignal) =>
    apiClient.get<{ subscriber: TelegramAudienceSubscriberDetails }>(
      `/telegram-bots/${botId}/audience/subscribers/${subscriberId}`,
      { signal },
    ).then((response) => response.data.subscriber),

  analytics: (botId: string, projectId?: string, signal?: AbortSignal) =>
    apiClient.get<TelegramAudienceAnalytics>(`/telegram-bots/${botId}/audience/analytics`, {
      params: projectId ? { projectId } : undefined,
      signal,
    }).then((response) => response.data),

  exportCsv: (botId: string, params: { status?: TelegramSubscriberStatus; search?: string }) =>
    apiClient.get<Blob>(`/telegram-bots/${botId}/audience/subscribers.csv`, {
      params,
      responseType: 'blob',
    }).then((response) => response.data),
};
