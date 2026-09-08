import axios from 'axios';
import { apiClient } from './client';

export type TelegramScenarioStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';
export type TelegramScenarioNodeType =
  | 'send_message'
  | 'send_media'
  | 'wait'
  | 'condition'
  | 'collect_input'
  | 'set_field'
  | 'add_tag'
  | 'remove_tag'
  | 'goal'
  | 'handoff'
  | 'end';

export interface TelegramScenarioButton {
  type: 'url' | 'callback';
  label: string;
  url?: string;
  callbackData?: string;
}

export interface TelegramScenarioNode {
  id: string;
  type: TelegramScenarioNodeType;
  label?: string;
  text?: string;
  buttons?: TelegramScenarioButton[];
  schedule?: { type: 'duration'; seconds: number } | {
    type: 'next_local_time';
    localTime: string;
    timezone: string;
    minDelaySeconds: number;
  };
  [key: string]: unknown;
}

export interface TelegramScenarioEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: unknown;
}

export interface TelegramScenarioEntrypoint {
  id: string;
  type: 'start' | 'start_parameter' | 'keyword' | 'manual';
  targetNodeId: string;
  value?: string;
  match?: 'exact' | 'contains';
  caseSensitive?: boolean;
}

export interface TelegramScenarioDefinition {
  schemaVersion: '1.0';
  name: string;
  description?: string;
  timezone: string;
  entrypoints: TelegramScenarioEntrypoint[];
  variables: unknown[];
  nodes: TelegramScenarioNode[];
  edges: TelegramScenarioEdge[];
  goals: unknown[];
  metadata: { locale: string; source: 'manual' | 'ai' | 'import' };
}

export interface TelegramScenarioValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface TelegramScenarioValidationReport {
  valid: boolean;
  issues: TelegramScenarioValidationIssue[];
  stats?: { nodeCount: number; edgeCount: number; maximumHorizonSeconds: number };
}

export interface TelegramScenarioVersion {
  id: string;
  version: number;
  schemaVersion: string;
  definition: TelegramScenarioDefinition;
  source: 'MANUAL' | 'AI' | 'IMPORT';
  validationReport: TelegramScenarioValidationReport | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramScenarioSummary {
  id: string;
  botId: string;
  projectId: string;
  name: string;
  description: string | null;
  status: TelegramScenarioStatus;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramScenario extends TelegramScenarioSummary {
  draftVersion: TelegramScenarioVersion | null;
  publishedVersion: TelegramScenarioVersion | null;
  versions: TelegramScenarioVersion[];
}

export interface TelegramScenarioTestRecipient {
  verified: boolean;
  telegramUserId: string | null;
  verifiedAt: string | null;
}

export interface TelegramScenarioTestVerification {
  deepLink: string;
  expiresAt: string;
}

export interface TelegramScenarioApiError {
  code: string | null;
  message: string;
  details: Record<string, unknown> | null;
}

export function telegramScenarioApiError(error: unknown, fallback: string): TelegramScenarioApiError {
  if (!axios.isAxiosError(error)) return { code: null, message: fallback, details: null };
  const data = error.response?.data as {
    error?: string;
    message?: string;
    details?: Record<string, unknown>;
  } | undefined;
  return { code: data?.error ?? null, message: data?.message ?? fallback, details: data?.details ?? null };
}

const basePath = (botId: string) => `/telegram-bots/${botId}`;

export const telegramScenariosApi = {
  list: (botId: string, projectId: string, signal?: AbortSignal) =>
    apiClient.get<{ scenarios: TelegramScenarioSummary[] }>(`${basePath(botId)}/scenarios`, {
      params: { projectId }, signal,
    }).then((response) => response.data.scenarios),

  get: (botId: string, scenarioId: string, signal?: AbortSignal) =>
    apiClient.get<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios/${scenarioId}`, { signal })
      .then((response) => response.data.scenario),

  create: (botId: string, data: { projectId: string; name: string; description?: string }) =>
    apiClient.post<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios`, data)
      .then((response) => response.data.scenario),

  updateMetadata: (botId: string, scenarioId: string, data: { name?: string; description?: string | null }) =>
    apiClient.patch<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios/${scenarioId}`, data)
      .then((response) => response.data.scenario),

  updateDraft: (botId: string, scenarioId: string, data: {
    expectedDraftVersionId: string;
    expectedUpdatedAt: string;
    definition: TelegramScenarioDefinition;
  }) => apiClient.put<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios/${scenarioId}/draft`, data)
    .then((response) => response.data.scenario),

  createDraftVersion: (botId: string, scenarioId: string, sourceVersionId?: string) =>
    apiClient.post<{ version: TelegramScenarioVersion }>(`${basePath(botId)}/scenarios/${scenarioId}/versions`, {
      confirmed: true, ...(sourceVersionId ? { sourceVersionId } : {}),
    }).then((response) => response.data.version),

  publish: (botId: string, scenarioId: string, expectedDraftVersionId: string) =>
    apiClient.post<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios/${scenarioId}/publish`, {
      confirmed: true, expectedDraftVersionId,
    }).then((response) => response.data.scenario),

  pause: (botId: string, scenarioId: string) =>
    apiClient.post<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios/${scenarioId}/pause`, { confirmed: true })
      .then((response) => response.data.scenario),

  rollback: (botId: string, scenarioId: string, versionId: string) =>
    apiClient.post<{ scenario: TelegramScenario }>(`${basePath(botId)}/scenarios/${scenarioId}/rollback`, {
      confirmed: true, versionId,
    }).then((response) => response.data.scenario),

  archive: (botId: string, scenarioId: string) =>
    apiClient.post(`${basePath(botId)}/scenarios/${scenarioId}/archive`, { confirmed: true }),

  testRecipient: (botId: string) =>
    apiClient.get<{ recipient: TelegramScenarioTestRecipient }>(`${basePath(botId)}/test-recipient`)
      .then((response) => response.data.recipient),

  createTestVerification: (botId: string) =>
    apiClient.post<{ verification: TelegramScenarioTestVerification }>(`${basePath(botId)}/test-recipient-verifications`)
      .then((response) => response.data.verification),

  testRun: (botId: string, scenarioId: string, versionId?: string) =>
    apiClient.post<{ run: { id: string } }>(`${basePath(botId)}/scenarios/${scenarioId}/test-runs`, {
      confirmed: true, ...(versionId ? { versionId } : {}),
    }).then((response) => response.data.run),
};
