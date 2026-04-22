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

  getByProject: (projectId: string) =>
    apiClient
      .get<{ session: { id: string; answers: Record<string, string> | null; currentStep: number; status: string } | null }>(
        `/jtbd/${projectId}`,
      )
      .then((r) => r.data.session),

  save: (projectId: string, answers: Record<string, string>, currentStep?: number) =>
    apiClient
      .post<{ ok: boolean; sessionId: string }>('/jtbd/save', { projectId, answers, currentStep })
      .then((r) => r.data),
};
