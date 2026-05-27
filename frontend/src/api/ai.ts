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
}

export interface WorkflowRequest {
  projectId:      string;
  step?:          string;
  inputs?:        Record<string, unknown>;
  workflowRunId?: string;
  provider?:      ChatModel;
  openaiModel?:   string;
  claudeModel?:   string;
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
  model:          string;
  provider:       string;
}

export const aiApi = {
  chat: (req: ChatRequest) =>
    apiClient
      .post<ChatResponse>('/ai/chat', req)
      .then((r) => r.data),

  startWorkflow: (workflow: string, req: WorkflowRequest) =>
    apiClient
      .post<WorkflowResponse>(`/ai/workflows/${workflow}/start`, req)
      .then((r) => r.data),

  runWorkflowStep: (workflow: string, req: WorkflowRequest) =>
    apiClient
      .post<WorkflowResponse>(`/ai/workflows/${workflow}/step`, req)
      .then((r) => r.data),

  extractFileText: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Do NOT set Content-Type manually — axios adds multipart/form-data + boundary automatically
    return apiClient
      .post<{ text: string }>('/files/extract-text', form)
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
