import { apiClient } from './client';

export type CastDevStatus = 'pending' | 'queued' | 'transcribing' | 'ready_for_analysis' | 'analyzing' | 'completed' | 'failed';

export interface CastDevRecord {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  sourceUrl: string;
  sourceType: string;
  fileName: string | null;
  mimeType: string | null;
  durationSec: number | null;
  status: CastDevStatus;
  transcriptText: string | null;
  transcriptFormatted: string | null;
  analysis: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CastDevAnalyzeResult {
  record: CastDevRecord;
  aiPointsCharged: number;
  aiBalanceRemaining: number | null;
  replayed: boolean;
}

export interface CastDevTranscribeResult {
  record: CastDevRecord;
  queued: boolean;
  aiPointsCharged?: number;
  aiBalanceRemaining?: number | null;
}

export interface CastDevSynthesis {
  id: string;
  title: string | null;
  content: string;
  structured: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  workflowRunId: string | null;
  generationId: string | null;
  createdAt: string;
}

export interface CastDevSynthesisResult {
  synthesis: CastDevSynthesis;
  aiPointsCharged: number;
  aiBalanceRemaining: number | null;
  replayed: boolean;
}

export const castDevApi = {
  list: (projectId: string) =>
    apiClient.get<{ records: CastDevRecord[] }>('/castdev', { params: { projectId } }).then((r) => r.data.records),

  create: (data: { projectId: string; title: string; sourceUrl: string }) =>
    apiClient.post<{ record: CastDevRecord }>('/castdev', data).then((r) => r.data.record),

  transcribe: (id: string, mode: 'mini' | 'diarize' = 'mini') =>
    apiClient.post<CastDevTranscribeResult>(`/castdev/${id}/transcribe`, { mode }, { timeout: 300_000 }).then((r) => r.data),

  analyze: (id: string) =>
    apiClient.post<CastDevAnalyzeResult>(`/castdev/${id}/analyze`, undefined, { timeout: 300_000 }).then((r) => r.data),

  listSyntheses: (projectId: string) =>
    apiClient.get<{ syntheses: CastDevSynthesis[] }>('/castdev/syntheses', { params: { projectId } }).then((r) => r.data.syntheses),

  synthesize: (projectId: string, recordIds: string[]) =>
    apiClient.post<CastDevSynthesisResult>('/castdev/syntheses', { projectId, recordIds }, { timeout: 300_000 }).then((r) => r.data),

  update: (id: string, data: Partial<Pick<CastDevRecord, 'title' | 'status' | 'fileName' | 'mimeType' | 'durationSec' | 'transcriptText' | 'transcriptFormatted' | 'analysis' | 'errorMessage' | 'metadata'>>) =>
    apiClient.patch<{ record: CastDevRecord }>(`/castdev/${id}`, data).then((r) => r.data.record),

  remove: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/castdev/${id}`).then((r) => r.data),
};
