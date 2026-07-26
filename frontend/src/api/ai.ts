import { apiClient } from './client';

export type ChatModel = 'chatgpt' | 'claude';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message:             string;
  model:               ChatModel;
  openaiModel?:        string;
  claudeModel?:        string;
  section?:            string;
  conversationHistory: ConversationMessage[];
  // Dynamic prompt context (optional — improves prompt relevance)
  unpackingProfile?:   Record<string, string>;
  projectName?:        string;
  projectId?:          string;
  fileContext?:        string;
  maxTokens?:          number;
}

export interface ChatResponse {
  content: string;
  mock:    boolean;
  generationId?: string;
  aiPointsCharged?: number;
  aiBalanceRemaining?: number;
}

export interface WorkflowRequest {
  projectId:      string;
  step?:          string;
  inputs?:        Record<string, unknown>;
  workflowRunId?: string;
  provider?:      ChatModel;
  openaiModel?:   string;
  claudeModel?:   string;
  idempotencyKey?: string;
}

export interface WorkflowResponse {
  workflowRunId:  string;
  workflowStepId: string;
  artifactId:     string;
  generationId:   string;
  content:        string;
  structured?:     Record<string, unknown> | null;
  validation:     { ok: boolean; errors: string[] };
  mock:           boolean;
  aiPointsCharged?: number;
  aiBalanceRemaining?: number;
}

export interface AiActionQuote {
  actionKey: string;
  actionLabel: string;
  sectionLabel: string;
  aiPoints: number;
  aiBalanceRemaining: number;
  aiBalanceAfter: number;
  affordable: boolean;
}

export type AiGenerationMode = 'now' | 'background';

export type AiBatchItemRequest = {
  customId?: string;
  title?: string;
  inputs: Record<string, unknown>;
};

export type AiBatchItem = {
  id: string;
  customId: string;
  position: number;
  status: string;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  aiPoints: number;
  artifactId: string | null;
};

export type AiBatchJob = {
  id: string;
  status: 'queued' | 'submitted' | 'in_progress' | 'finalizing' | 'completed' | 'partially_failed' | 'failed' | 'cancelled' | 'expired';
  actionKey: string;
  workflow: string;
  step: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  items?: AiBatchItem[];
};

export interface AiBatchRequest {
  projectId: string;
  workflow: string;
  step: string;
  items: AiBatchItemRequest[];
  idempotencyKey: string;
}

function serverRoutedRequest<T extends { openaiModel?: string; claudeModel?: string }>(
  request: T,
): Omit<T, 'openaiModel' | 'claudeModel'> {
  const { openaiModel: _openaiModel, claudeModel: _claudeModel, ...serverRouted } = request;
  return serverRouted;
}

function serverRoutedWorkflowRequest<T extends WorkflowRequest>(
  request: T,
): Omit<T, 'provider' | 'openaiModel' | 'claudeModel'> {
  const {
    provider: _provider,
    openaiModel: _openaiModel,
    claudeModel: _claudeModel,
    ...serverRouted
  } = request;
  return serverRouted;
}

function notifyBalanceChanged<T>(response: T): T {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lumaiq:ai-balance-changed'));
  }
  return response;
}

export const aiApi = {
  chat: (req: ChatRequest) =>
    apiClient
      .post<ChatResponse>('/ai/chat', serverRoutedRequest(req), { timeout: 180_000 })
      .then((r) => notifyBalanceChanged(r.data)),

  startWorkflow: (workflow: string, req: WorkflowRequest) =>
    apiClient
      .post<WorkflowResponse>(`/ai/workflows/${workflow}/start`, serverRoutedWorkflowRequest(req), { timeout: 180_000 })
      .then((r) => notifyBalanceChanged(r.data)),

  runWorkflowStep: (workflow: string, req: WorkflowRequest) =>
    apiClient
      .post<WorkflowResponse>(`/ai/workflows/${workflow}/step`, serverRoutedWorkflowRequest(req), { timeout: 180_000 })
      .then((r) => notifyBalanceChanged(r.data)),

  quoteWorkflow: (workflow: string, req: WorkflowRequest) =>
    apiClient
      .post<AiActionQuote>(`/ai/workflows/${workflow}/quote`, serverRoutedWorkflowRequest(req))
      .then((r) => r.data),

  createBatch: (req: AiBatchRequest) =>
    apiClient
      .post<{ job: AiBatchJob }>('/ai/batches', req, {
        headers: { 'Idempotency-Key': req.idempotencyKey },
      })
      .then((r) => r.data.job),

  listBatches: (projectId?: string) =>
    apiClient
      .get<{ jobs: AiBatchJob[] }>('/ai/batches', { params: projectId ? { projectId } : undefined })
      .then((r) => r.data.jobs),

  getBatch: (id: string) =>
    apiClient
      .get<{ job: AiBatchJob }>(`/ai/batches/${id}`)
      .then((r) => r.data.job),

  refreshBatch: (id: string) =>
    apiClient
      .post<{ job: AiBatchJob }>(`/ai/batches/${id}/refresh`)
      .then((r) => r.data.job),

  cancelBatch: (id: string) =>
    apiClient
      .post<{ job: AiBatchJob }>(`/ai/batches/${id}/cancel`)
      .then((r) => r.data.job),

  extractFileText: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Do NOT set Content-Type manually — axios adds multipart/form-data + boundary automatically
    return apiClient
      .post<{ text: string }>('/files/extract-text', form)
      .then((r) => r.data.text);
  },

  extractUrlText: (url: string) =>
    apiClient
      .post<{ text: string; fileName: string }>('/files/extract-url', { url })
      .then((r) => r.data),

  transcribeAudio: (file: Blob) => {
    const form = new FormData();
    const extension = file.type.includes('mp4') ? 'm4a' : file.type.includes('wav') ? 'wav' : 'webm';
    form.append('file', file, `voice-message.${extension}`);
    return apiClient
      .post<{ text: string }>('/audio/transcribe', form, { timeout: 120_000 })
      .then((r) => r.data.text);
  },
};

export interface ProjectFile {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  extension: string | null;
  textContent: string;
  summary: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const filesApi = {
  list: (projectId: string) =>
    apiClient
      .get<{ files: ProjectFile[] }>('/files', { params: { projectId } })
      .then((r) => r.data.files),

  upload: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('file', file);
    return apiClient
      .post<{ file: ProjectFile }>('/files', form)
      .then((r) => r.data.file);
  },

  remove: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/files/${id}`).then((r) => r.data),
};
