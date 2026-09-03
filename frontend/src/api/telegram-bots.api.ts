import axios from 'axios';
import { apiClient } from './client';

export type TelegramBotStatus = 'DRAFT' | 'ACTIVE' | 'DISCONNECTED' | 'ERROR' | 'ARCHIVED';

export interface TelegramBot {
  id: string;
  defaultProjectId: string | null;
  telegramBotId: string;
  username: string;
  displayName: string;
  tokenHint: string | null;
  status: TelegramBotStatus;
  webhookConfigured: boolean;
  webhookUrl: string | null;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  webhookConnectedAt: string | null;
  disconnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramBotDiagnostics {
  bot: {
    id: number;
    firstName: string;
    username: string | null;
    canJoinGroups: boolean;
    canReadAllGroupMessages: boolean;
    supportsInlineQueries: boolean;
  };
  webhook: {
    configured: boolean;
    url: string | null;
    host: string | null;
    pendingUpdateCount: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    maxConnections: number | null;
    allowedUpdates: string[];
  };
}

export interface TelegramBotApiError {
  code: string | null;
  message: string;
  existingHost: string | null;
}

interface BotWithDiagnosticsResponse {
  bot: TelegramBot;
  diagnostics: TelegramBotDiagnostics;
}

export function telegramBotApiError(error: unknown, fallback: string): TelegramBotApiError {
  if (!axios.isAxiosError(error)) {
    return { code: null, message: fallback, existingHost: null };
  }

  const data = error.response?.data as {
    error?: string;
    message?: string;
    details?: { existingHost?: string | null };
  } | undefined;

  return {
    code: data?.error ?? null,
    message: data?.message ?? fallback,
    existingHost: data?.details?.existingHost ?? null,
  };
}

export const telegramBotsApi = {
  list: (signal?: AbortSignal) =>
    apiClient
      .get<{ bots: TelegramBot[] }>('/telegram-bots', { signal })
      .then((response) => response.data.bots),

  create: (data: { token: string; defaultProjectId?: string }, signal?: AbortSignal) =>
    apiClient
      .post<BotWithDiagnosticsResponse>('/telegram-bots', data, { signal })
      .then((response) => response.data),

  update: (botId: string, data: { defaultProjectId: string | null }) =>
    apiClient
      .patch<{ bot: TelegramBot }>(`/telegram-bots/${botId}`, data)
      .then((response) => response.data.bot),

  replaceToken: (botId: string, token: string) =>
    apiClient
      .put<{ bot: TelegramBot }>(`/telegram-bots/${botId}/token`, { token })
      .then((response) => response.data.bot),

  diagnostics: (botId: string, signal?: AbortSignal) =>
    apiClient
      .get<{ diagnostics: TelegramBotDiagnostics }>(`/telegram-bots/${botId}/diagnostics`, { signal })
      .then((response) => response.data.diagnostics),

  connectWebhook: (botId: string, options?: {
    replaceExistingWebhook?: boolean;
    dropPendingUpdates?: boolean;
  }) =>
    apiClient
      .post<BotWithDiagnosticsResponse>(`/telegram-bots/${botId}/webhook`, {
        replaceExistingWebhook: options?.replaceExistingWebhook ?? false,
        dropPendingUpdates: options?.dropPendingUpdates ?? false,
      })
      .then((response) => response.data),

  disconnectWebhook: (botId: string, dropPendingUpdates = false) =>
    apiClient
      .delete<{ bot: TelegramBot }>(`/telegram-bots/${botId}/webhook`, {
        data: { dropPendingUpdates },
      })
      .then((response) => response.data.bot),

  archive: (botId: string) => apiClient.delete(`/telegram-bots/${botId}`),
};
