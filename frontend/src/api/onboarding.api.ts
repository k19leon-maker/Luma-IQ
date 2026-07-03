import { apiClient } from './client';
import type { AuthUser } from './auth.api';
import type { Project } from './projects.api';
import type { Task } from '../store/tasks.store';

export interface OnboardingData {
  projectName?: string;
  projectShortDescription?: string;
  targetAudience?: string;
  products?: string;
  strengths?: string;
}

export interface OnboardingState {
  onboardingStatus: 'not_started' | 'in_progress' | 'completed' | 'skipped' | string;
  onboardingStep: number;
  onboardingVersion: string;
  onboardingCompletedAt: string | null;
  onboardingData: OnboardingData | null;
  recommendedRoute: string | null;
  createdProjectId: string | null;
}

export const onboardingApi = {
  state: () =>
    apiClient.get<{ onboarding: OnboardingState }>('/onboarding').then((r) => r.data.onboarding),

  progress: (onboardingStep: number, onboardingData: OnboardingData) =>
    apiClient.patch<{ user: AuthUser }>('/onboarding/progress', { onboardingStep, onboardingData }).then((r) => r.data.user),

  skip: (onboardingData: OnboardingData) =>
    apiClient.post<{ user: AuthUser; recommendedRoute: string }>('/onboarding/skip', { onboardingData }).then((r) => r.data),

  complete: (payload: { onboardingData: OnboardingData; projectId?: string }) =>
    apiClient.post<{
      user: AuthUser;
      project: Project;
      tasks: Task[];
      recommendedRoute: string;
      starterTasksCreated: boolean;
      starterTasksError?: boolean;
    }>('/onboarding/complete', payload).then((r) => r.data),

  event: (type: 'onboarding_tasks_route_clicked' | 'onboarding_about_route_clicked', metadata?: Record<string, unknown>) =>
    apiClient.post<{ ok: boolean }>('/onboarding/event', { type, metadata }).then((r) => r.data),
};
