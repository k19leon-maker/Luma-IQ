import { apiClient } from './client';

export type CaseStudyStatus = 'draft' | 'ready';
export type CaseStudySourceType = 'manual' | 'voice' | 'screenshot' | 'document';

export interface CaseStudy {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  beforeText: string;
  actionsText: string;
  afterText: string;
  clientTask: string | null;
  clientProblem: string | null;
  desiredResult: string | null;
  marketingInsight: string | null;
  status: CaseStudyStatus;
  sourceType: CaseStudySourceType;
  sourceText: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateCaseStudyInput = Pick<CaseStudy, 'title'> & Partial<Pick<CaseStudy,
  | 'beforeText'
  | 'actionsText'
  | 'afterText'
  | 'clientTask'
  | 'clientProblem'
  | 'desiredResult'
  | 'marketingInsight'
  | 'status'
>>;

export type UpdateCaseStudyInput = Partial<Pick<CaseStudy,
  | 'title'
  | 'beforeText'
  | 'actionsText'
  | 'afterText'
  | 'clientTask'
  | 'clientProblem'
  | 'desiredResult'
  | 'marketingInsight'
  | 'status'
>>;

export const casesApi = {
  list: (projectId: string, status?: CaseStudyStatus) =>
    apiClient
      .get<{ cases: CaseStudy[] }>(`/projects/${projectId}/cases`, { params: status ? { status } : undefined })
      .then((response) => response.data.cases),

  get: (projectId: string, caseId: string) =>
    apiClient
      .get<{ case: CaseStudy }>(`/projects/${projectId}/cases/${caseId}`)
      .then((response) => response.data.case),

  create: (projectId: string, input: CreateCaseStudyInput) =>
    apiClient
      .post<{ case: CaseStudy }>(`/projects/${projectId}/cases`, input)
      .then((response) => response.data.case),

  update: (projectId: string, caseId: string, input: UpdateCaseStudyInput) =>
    apiClient
      .patch<{ case: CaseStudy }>(`/projects/${projectId}/cases/${caseId}`, input)
      .then((response) => response.data.case),

  remove: (projectId: string, caseId: string) =>
    apiClient
      .delete<{ ok: boolean }>(`/projects/${projectId}/cases/${caseId}`)
      .then((response) => response.data),
};
