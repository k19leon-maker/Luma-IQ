import { apiClient } from './client';
import type { AuthResponse } from './auth.api';

export type AdminCommercialPlan = 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL' | 'PRO' | 'EXPERT' | 'SUPPORT' | 'MARKETING_PARTNER' | 'IMPLEMENTATION';
export type AdminSubscriptionPlan = 'FREE' | AdminCommercialPlan | 'ANNUAL';

export interface AdminPlanCatalogItem {
  code: AdminSubscriptionPlan;
  name: string;
  priceRub: number;
  periodDays: number;
  aiPoints: number;
  activeProjectsLimit: number;
  public: boolean;
  legacy: boolean;
  purchasable: boolean;
  displayOrder: number;
  shortDescription: string;
  extendedDescription: string;
  createdAt: string | null;
  updatedAt: string | null;
  users: number;
  activeUsers: number;
}

export interface AdminSubscription {
  plan: string;
  status: string;
  expiresAt: string | null;
  paymentSource?: string | null;
  lastPaymentAt?: string | null;
  adminNote?: string | null;
  ltvRub?: string | number | null;
  limitOverrides?: unknown;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean;
  archivedAt: string | null;
  archivedById: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
  subscription: AdminSubscription;
  projectCount: number;
  generatedTextCount: number;
  aiRequestCount: number;
  failedAiRequestCount: number;
  tokens: number;
  aiCostUsd: number;
  ltv: number;
  marginPercent: number;
  lastActivityAt: string;
  currentStage: string;
}

export interface AdminUserDetail extends AdminUserListItem {
  specialization: string | null;
  payments: Array<{
    id: string;
    amount: string;
    currency: string;
    status: string;
    yookassaId: string | null;
    source: string;
    externalId: string | null;
    adminNote: string | null;
    createdAt: string;
  }>;
  aiUsage: Array<{
    id: string;
    date: string;
    count: number;
  }>;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  aiCostUsd: number;
  avgTokensPerRequest: number;
  avgCostPerGenerationUsd: number;
  marginPercent: number;
  featureUsage: Array<{
    featureCode: string;
    requests: number;
    tokens: number;
    costUsd: number;
  }>;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    currentStage: string;
    createdAt: string;
    updatedAt: string;
    productsCount: number;
    generatedTextsCount: number;
    contentPlanItemsCount: number;
    health: number;
    aiRequests: number;
    aiTokens: number;
    aiCostUsd: number;
  }>;
  aiRequestLogs: Array<{
    id: string;
    provider: string;
    section: string | null;
    model: string | null;
    status: string;
    isMock: boolean;
    error: string | null;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
}

export interface AdminDashboard {
  metrics: {
    totalUsers: number;
    newUsers7d: number;
    newUsers30d: number;
    activeUsers30d: number;
    activePro: number;
    revenue: number;
    averageLtv: number;
    aiTotal: number;
    aiToday: number;
    totalAiCostUsd: number;
    aiCostTodayUsd: number;
    avgAiCostPerUserUsd: number;
    avgAiCostPerProjectUsd: number;
    estimatedMarginRub: number;
    estimatedMarginPercent: number;
    tokensToday: number;
    generationsToday: number;
    failedGenerations30d: number;
    missingPricingAlerts30d: number;
    highCostUsers30d: number;
    mostUsedFeature: string;
    promptVersionsCount: number;
    runningPromptExperiments: number;
  };
  ai: {
    byProvider: Array<{ provider: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    byFeature: Array<{ featureCode: string; requests: number; tokens: number; costUsd: number }>;
    byModel: Array<{ provider: string; model: string; requests: number; tokens: number; costUsd: number }>;
    byWorkflow: Array<{ workflow: string; requests: number; tokens: number; costUsd: number; avgLatencyMs: number }>;
    workflowHealth: Array<{
      workflow: string;
      count: number;
      success: number;
      failed: number;
      avgDurationMs: number;
      avgRetry: number;
      successRate: number;
    }>;
    marginByPlan: Array<{
      plan: string;
      users: number;
      revenueRub: number;
      aiCostUsd: number;
      aiCostRub: number;
      aiBudgetRub: number;
      aiBudgetUsedPercent: number;
      aiBudgetDeltaRub: number;
      marginRub: number;
      marginPercent: number;
    }>;
    userEconomics: Array<{
      userId: string;
      email: string;
      name: string | null;
      plan: string;
      revenueRub: number;
      requests: number;
      tokens: number;
      aiPointsUsed: number;
      aiCostUsd: number;
      aiCostRub: number;
      aiBudgetRub: number;
      aiBudgetUsedPercent: number;
      aiBudgetDeltaRub: number;
      avgTokensPerRequest: number;
      avgCostUsd: number;
      avgCostRub: number;
      avgAiPointsPerAction: number;
    }>;
    actionEconomics: Array<{
      actionType: string;
      actionLabel: string;
      sectionLabel: string;
      requests: number;
      tokens: number;
      aiPoints: number;
      costUsd: number;
      costRub: number;
      avgTokensPerRequest: number;
      avgCostUsd: number;
      avgCostRub: number;
      avgAiPoints: number;
    }>;
    promptExperiments: {
      versions: number;
      running: number;
    };
  };
  retention: {
    cohort30dUsers: number;
    activatedUsers: number;
    activationRate: number;
    retained7dUsers: number;
    retained30dUsers: number;
    retention7dRate: number;
    retention30dRate: number;
  };
  recentEvents: Array<{
    id: string;
    type: string;
    userId: string | null;
    actorId: string | null;
    metadata: unknown;
    createdAt: string;
    user: { email: string; name: string | null } | null;
  }>;
}

export interface AdminPromptRegistryItem {
  id: string;
  workflow: string;
  step: string;
  feature: string;
  model: string;
  temperature: number;
  maxTokens: number;
  artifactType: string;
}

export interface AdminPromptVersion {
  id: string;
  promptId: string;
  versionLabel: string;
  workflow: string;
  step: string;
  featureCode: string;
  artifactType: string;
  model: string | null;
  temperature: string | number | null;
  maxTokens: number | null;
  systemPrompt: string | null;
  userPromptTemplate: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromptExperiment {
  id: string;
  name: string;
  workflow: string;
  step: string;
  status: string;
  trafficPct: number;
  startedAt: string | null;
  endedAt: string | null;
  variants: Array<{
    id: string;
    name: string;
    trafficWeight: number;
    isControl: boolean;
    promptVersionId: string | null;
    promptVersion: AdminPromptVersion | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWorkflowGeneration {
  id: string;
  workflowStepId: string | null;
  featureCode: string;
  provider: string;
  model: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  actualCostUsd: number;
  latencyMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AdminWorkflowArtifact {
  id: string;
  type: string;
  title: string | null;
  workflow: string;
  step: string | null;
  createdAt: string;
}

export interface AdminWorkflowStep {
  id: string;
  step: string;
  status: string;
  retryCount: number;
  latencyMs: number | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  artifacts: AdminWorkflowArtifact[];
  generations: AdminWorkflowGeneration[];
}

export interface AdminWorkflowRun {
  id: string;
  workflow: string;
  featureCode: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
  user: { id: string; email: string; name: string | null };
  project: { id: string; name: string };
  totals: {
    steps: number;
    artifacts: number;
    generations: number;
    tokens: number;
    costUsd: number;
    costRub: number;
  };
  errors: Array<{ type: string; step: string | null; message: string }>;
  steps: AdminWorkflowStep[];
  artifacts: AdminWorkflowArtifact[];
  generations: AdminWorkflowGeneration[];
}

export interface AdminAiEconomicsAction {
  actionKey: string;
  actionLabel: string;
  sectionLabel: string;
  runs: number;
  succeeded: number;
  failed: number;
  currentAiPoints: number;
  totalCostUsd: number;
  p50CostUsd: number;
  p90CostUsd: number;
  p95CostUsd: number;
  avgCostPerPointUsd: number;
  p90CostPerPointUsd: number;
  avgTokens: {
    input: number;
    cached: number;
    output: number;
    reasoning: number;
    audioInput: number;
    audioOutput: number;
  };
  retries: number;
  releases: number;
  refunds: number;
  errorRate: number;
  cacheHitRate: number;
  cacheSavingsUsd: number;
  batchSavingsUsd: number;
  modelShares: Array<{ alias: string; calls: number; share: number }>;
  recommendation: {
    formula: string;
    safetyFactor: number;
    rawAiPoints: number;
    recommendedAiPoints: number;
    sampleSize: number;
    reliable: boolean;
    reason: string | null;
  };
}

export interface AdminAiEconomicsV2 {
  period: { from: string; to: string };
  totals: {
    pipelineRuns: number;
    succeeded: number;
    failed: number;
    costUsd: number;
    aiPoints: number;
    p50CostUsd: number;
    p90CostUsd: number;
    p95CostUsd: number;
    costPerPointUsd: number;
    p90CostPerPointUsd: number;
    cacheHitRate: number;
    cacheSavingsUsd: number;
    batchSavingsUsd: number;
    retries: number;
    releases: number;
    refunds: number;
  };
  modelShares: Array<{ alias: string; calls: number; share: number }>;
  actions: AdminAiEconomicsAction[];
  alerts: Array<{
    type: string;
    severity: string;
    actionKey?: string;
    userId?: string;
    email?: string;
    message: string;
  }>;
}

export interface AdminTariffSimulation {
  plan: {
    id: string;
    name: string;
    priceMonthlyRub: number;
    limits: { monthlyCredits: number; aiCostBudgetRub: number };
  };
  lines: Array<{ actionKey: string; count: number; aiPointsEach: number; aiPointsTotal: number }>;
  package: {
    aiPoints: number;
    fitsBalance: boolean;
    remainingPoints: number;
    estimatedAiCostRub: number;
    budgetRub: number;
  };
  forecasts: Array<{
    utilization: number;
    aiPoints: number;
    estimatedAiCostRub: number;
    budgetRub: number;
    withinBudget: boolean;
  }>;
}

export const adminApi = {
  plans: () =>
    apiClient.get<{ plans: AdminPlanCatalogItem[] }>('/admin/plans').then((r) => r.data.plans),

  updatePlan: (code: 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL', data: {
    isPublic: boolean;
    isPurchasable: boolean;
    displayOrder: number;
    shortDescription: string;
    extendedDescription: string;
  }) =>
    apiClient.patch<{ plan: AdminPlanCatalogItem }>(`/admin/plans/${code}`, data).then((r) => r.data.plan),

  dashboard: () =>
    apiClient
      .get<AdminDashboard>('/admin/dashboard')
      .then((r) => r.data),

  listUsers: (params?: { q?: string; plan?: string; status?: string; archive?: 'ACTIVE' | 'ARCHIVED' | 'ALL'; limit?: number; offset?: number }) =>
    apiClient
      .get<{ users: AdminUserListItem[]; total: number; limit: number; offset: number }>('/admin/users', { params })
      .then((r) => r.data),

  workflows: (params?: { userId?: string; projectId?: string; workflow?: string; status?: string; limit?: number; offset?: number }) =>
    apiClient
      .get<{ workflows: AdminWorkflowRun[]; total: number; limit: number; offset: number }>('/admin/workflows', { params })
      .then((r) => r.data),

  aiEconomicsV2: (params?: {
    from?: string;
    to?: string;
    plan?: string;
    actionKey?: string;
    section?: string;
    modelAlias?: string;
    userId?: string;
    projectId?: string;
    batch?: boolean;
    status?: string;
    promptVersion?: string;
    actionPricingVersionId?: string;
  }) =>
    apiClient.get<AdminAiEconomicsV2>('/admin/ai-economics-v2', { params }).then((r) => r.data),

  applyAiEconomicsPrice: (data: {
    actionKey: string;
    aiPoints: number;
    sampleSize: number;
    p90CostUsd: number;
    confirmation: string;
  }) =>
    apiClient.post('/admin/ai-economics-v2/apply-price', data).then((r) => r.data),

  simulateAiTariff: (data: { planId: string; actionMix: Record<string, number> }) =>
    apiClient.post<AdminTariffSimulation>('/admin/ai-economics-v2/simulate', data).then((r) => r.data),

  reconcileAiCosts: (params: { from: string; to: string }) =>
    apiClient.get<{
      enabled: boolean;
      reason?: string;
      localCostUsd?: number;
      openAiCostUsd?: number;
      deltaUsd?: number;
      deltaPercent?: number;
      alert?: boolean;
    }>('/admin/ai-economics-v2/reconcile', { params }).then((r) => r.data),

  getUser: (id: string) =>
    apiClient
      .get<{ user: AdminUserDetail }>(`/admin/users/${id}`)
      .then((r) => r.data.user),

  grantPro: (data: {
    email: string;
    name?: string;
    password?: string;
    plan: AdminCommercialPlan;
    months: number;
    paymentSource: 'TRIBUTE' | 'MANUAL' | 'PROMO';
    amount?: number;
    externalId?: string;
    adminNote?: string;
  }) =>
    apiClient
      .post<{ ok: boolean; user: { id: string; email: string; name: string | null }; subscription: AdminSubscription }>('/admin/users/grant-pro', data)
      .then((r) => r.data),

  impersonateUser: (id: string) =>
    apiClient
      .post<AuthResponse>(`/auth/admin/impersonate/${id}`)
      .then((r) => r.data),

  updateUserAccess: (id: string, data: {
    role?: 'ADMIN' | 'USER';
    plan?: AdminSubscriptionPlan;
    status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    expiresAt?: string | null;
    paymentDate?: string | null;
    paymentSource?: 'TRIBUTE' | 'MANUAL' | 'PROMO';
    paymentAmount?: number;
    externalId?: string;
    adminNote?: string | null;
    ltvRub?: number | null;
    limitOverrides?: {
      monthlyCredits?: number;
      projectLimit?: number;
      heavyGenerationLimit?: number;
      chatDailyLimit?: number;
      dailyGenerationLimit?: number;
      monthlyGenerationLimit?: number;
    } | null;
  }) =>
    apiClient
      .patch<{ ok: boolean; subscription: AdminSubscription }>(`/admin/users/${id}/access`, data)
      .then((r) => r.data),

  archiveUser: (id: string, data: { archived: boolean; reason?: string | null }) =>
    apiClient
      .patch<{ ok: boolean; user: Pick<AdminUserDetail, 'id' | 'email' | 'name' | 'archivedAt' | 'archivedById' | 'archiveReason'> }>(`/admin/users/${id}/archive`, data)
      .then((r) => r.data),

  addUserCredits: (id: string, data: { amount: number; reason?: string }) =>
    apiClient
      .post<{ ok: boolean; entry: { id: string; balanceAfter: number } }>(`/admin/users/${id}/credits`, data)
      .then((r) => r.data),

  prompts: () =>
    apiClient
      .get<{ registry: AdminPromptRegistryItem[]; versions: AdminPromptVersion[]; experiments: AdminPromptExperiment[] }>('/admin/prompts')
      .then((r) => r.data),

  createPromptVersion: (data: {
    workflow: string;
    step: string;
    versionLabel: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    userPromptTemplate?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    notes?: string;
  }) =>
    apiClient.post<{ version: AdminPromptVersion }>('/admin/prompts/versions', data).then((r) => r.data.version),

  createPromptExperiment: (data: {
    name: string;
    workflow: string;
    step: string;
    status?: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'FINISHED';
    trafficPct?: number;
    variants: Array<{ name: string; promptVersionId?: string | null; trafficWeight?: number; isControl?: boolean }>;
  }) =>
    apiClient.post<{ experiment: AdminPromptExperiment }>('/admin/prompts/experiments', data).then((r) => r.data.experiment),
};
