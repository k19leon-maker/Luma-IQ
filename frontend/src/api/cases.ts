import { apiClient } from './client';

function notifyBalanceChanged<T>(response: T): T {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lumaiq:ai-balance-changed'));
  }
  return response;
}

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

export interface CaseExtractionCandidate {
  title: string;
  beforeText: string;
  actionsText: string;
  afterText: string;
  clientTask: string;
  clientProblem: string;
  desiredResult: string;
  marketingInsight: string;
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

  extract: (projectId: string, input: {
    sourceText: string;
    sourceType: CaseStudySourceType;
    idempotencyKey: string;
  }) => apiClient
    .post<{
      candidates: CaseExtractionCandidate[];
      generationId: string;
      aiPointsCharged: number;
      aiBalanceRemaining: number;
    }>(`/projects/${projectId}/cases/extract`, input, {
      timeout: 180_000,
      headers: { 'Idempotency-Key': input.idempotencyKey },
    })
    .then((response) => notifyBalanceChanged(response.data)),

  createBatch: (projectId: string, input: {
    candidates: CaseExtractionCandidate[];
    sourceText: string;
    sourceType: CaseStudySourceType;
    idempotencyKey: string;
  }) => apiClient
    .post<{ cases: CaseStudy[]; replayed: boolean }>(`/projects/${projectId}/cases/batch`, input, {
      headers: { 'Idempotency-Key': input.idempotencyKey },
    })
    .then((response) => response.data),

  generateInsights: (projectId: string, caseId: string, idempotencyKey: string) => apiClient
    .post<{
      case: CaseStudy;
      generationId: string;
      aiPointsCharged: number;
      aiBalanceRemaining: number;
    }>(`/projects/${projectId}/cases/${caseId}/generate-insights`, { idempotencyKey }, {
      timeout: 180_000,
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    .then((response) => notifyBalanceChanged(response.data)),
};
