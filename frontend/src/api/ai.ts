import { apiClient } from './client';

export type ChatModel = 'chatgpt' | 'claude';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message:             string;
  model:               ChatModel;
  claudeModel?:        string;
  section?:            string;
  conversationHistory: ConversationMessage[];
  // Dynamic prompt context (optional — improves prompt relevance)
  unpackingProfile?:   Record<string, string>;
  projectName?:        string;
  fileContext?:        string;
}

export interface ChatResponse {
  content: string;
  mock:    boolean;
}

export const aiApi = {
  chat: (req: ChatRequest) =>
    apiClient
      .post<ChatResponse>('/ai/chat', req)
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
