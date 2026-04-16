import { apiClient } from './client';

export interface JTBDStep {
  id: number;
  key: string;
  title: string;
  description: string;
  userQuestion: string | null;
}

export interface GenerateRequest {
  stepId: number;
  answers: Record<string, string>;
  model: 'chatgpt' | 'claude';
  projectId?: string;
  sessionId?: string;
}

export interface GenerateResponse {
  stepId: number;
  key: string;
  content: string;
  mock: boolean;
  sessionId?: string;
}

export const jtbdApi = {
  getSteps: () =>
    apiClient.get<{ steps: JTBDStep[] }>('/jtbd/steps').then((r) => r.data.steps),

  generate: (req: GenerateRequest) =>
    apiClient.post<GenerateResponse>('/jtbd/generate', req).then((r) => r.data),
};
