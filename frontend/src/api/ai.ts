import { apiClient } from './client';

export type ChatModel = 'chatgpt' | 'claude';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  model: ChatModel;
  conversationHistory: ConversationMessage[];
}

export interface ChatResponse {
  content: string;
  mock: boolean;
}

export const aiApi = {
  chat: (req: ChatRequest) =>
    apiClient
      .post<ChatResponse>('/ai/chat', req)
      .then((r) => r.data),
};
