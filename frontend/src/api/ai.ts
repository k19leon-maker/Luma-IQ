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
