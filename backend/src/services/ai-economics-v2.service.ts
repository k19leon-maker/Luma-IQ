import { Prisma } from '@prisma/client';
import { AI_ACTION_LABELS, AI_ACTION_SECTIONS, type AiActionType } from '../config/ai-actions';
import { AI_ACTION_DEFINITIONS, type AIActionKey } from '../config/ai-action-registry';
import { env } from '../config/env';
import { getPlanById, normalizePlanId, resolvePlanId, type PlanId } from '../config/pricing-plans';
import { prisma } from '../lib/prisma';
import { openAiCostsProvider } from '../providers/openai-costs.provider';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiConfigurationService } from './ai-configuration.service';
import { aiFeatureFlagsService } from './ai-feature-flags.service';

export type AiEconomicsFilters = {
  from?: Date;
  to?: Date;
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
};

type NumberRow = {
  id: string;
  actualCostUsd: Prisma.Decimal;
  aiPointsCaptured: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  audioInputTokens: number;
  audioOutputTokens: number;
  retryCount: number;
  status: string;
  metadata: Prisma.JsonValue | null;
  workflowRunId: string | null;
  promptVersion: string | null;
  userId: string;
  projectId: string | null;
  user: {
    email: string;
    subscription: { plan: string } | null;
  };
  providerCalls: Array<{
    modelAlias: string | null;
    actualModelId: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    audioInputTokens: number;
    audioOutputTokens: number;
    retryIndex: number;
    isBatch: boolean;
    costUsd: Prisma.Decimal;
    pricingSnapshot: Prisma.JsonValue | null;
  }>;
  ledgerEntries: Array<{
    type: string;
    quantity: number;
  }>;
};

function metadataString(metadata: Prisma.JsonValue | null, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function actionKey(row: NumberRow): AIActionKey {
  const value = metadataString(row.metadata, 'actionKey');
  return value && value in AI_ACTION_DEFINITIONS ? value as AIActionKey : 'ai_chat';
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function rounded(value: number, digits = 8): number {
  return Number(value.toFixed(digits));
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function roundRecommendedAiPoints(value: number): number {
  const step = value <= 50 ? 5 : value <= 250 ? 10 : 25;
  return Math.max(step, Math.ceil(value / step) * step);
}

function pricingNumber(snapshot: Prisma.JsonValue | null, key: string): number {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return 0;
  const value = (snapshot as Record<string, unknown>)[key];
  return Number(value ?? 0);
}

function cacheSavingsUsd(call: NumberRow['providerCalls'][number]): number {
  if (call.cachedInputTokens <= 0) return 0;
  const regular = pricingNumber(call.pricingSnapshot, 'inputPricePer1M');
  const cached = pricingNumber(call.pricingSnapshot, 'cachedInputPricePer1M');
  return Math.max(0, call.cachedInputTokens / 1_000_000 * (regular - cached));
}

function runKey(row: NumberRow): string {
  return metadataString(row.metadata, 'batchJobId')
    || row.workflowRunId
    || metadataString(row.metadata, 'correlationId')
    || `generation:${row.id}`;
}

type PipelineRun = {
  key: string;
  actionKey: AIActionKey;
  userId: string;
  email: string;
  projectId: string | null;
  plan: string;
  status: string;
  batch: boolean;
  costUsd: number;
  points: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  audioInput: number;
  audioOutput: number;
  retries: number;
  errors: number;
  releases: number;
  refunds: number;
  cacheSavingsUsd: number;
  batchSavingsUsd: number;
  aliases: Record<string, number>;
  promptVersions: Set<string>;
  pricingVersionIds: Set<string>;
};

function buildRuns(rows: NumberRow[]): PipelineRun[] {
  const runs = new Map<string, PipelineRun>();
  for (const row of rows) {
    const key = runKey(row);
    const action = actionKey(row);
    const calls = row.providerCalls;
    const isBatch = calls.some((call) => call.isBatch) || Boolean(metadataString(row.metadata, 'batchJobId'));
    const item = runs.get(key) ?? {
      key,
      actionKey: action,
      userId: row.userId,
      email: row.user.email,
      projectId: row.projectId,
      plan: row.user.subscription?.plan ?? 'FREE',
      status: 'SUCCEEDED',
      batch: isBatch,
      costUsd: 0,
      points: 0,
      input: 0,
      cached: 0,
      output: 0,
      reasoning: 0,
      audioInput: 0,
      audioOutput: 0,
      retries: 0,
      errors: 0,
      releases: 0,
      refunds: 0,
      cacheSavingsUsd: 0,
      batchSavingsUsd: 0,
      aliases: {},
      promptVersions: new Set<string>(),
      pricingVersionIds: new Set<string>(),
    };
    item.costUsd += Number(row.actualCostUsd);
    item.points += row.aiPointsCaptured;
    item.input += row.inputTokens;
    item.cached += row.cachedInputTokens;
    item.output += row.outputTokens;
    item.reasoning += row.reasoningTokens;
    item.audioInput += row.audioInputTokens;
    item.audioOutput += row.audioOutputTokens;
    item.retries += Math.max(row.retryCount, calls.filter((call) => call.retryIndex > 0).length);
    item.errors += row.status === 'FAILED' || row.status === 'TIMEOUT' ? 1 : 0;
    item.releases += row.ledgerEntries.filter((entry) => entry.type === 'RELEASE').length;
    item.refunds += row.ledgerEntries.filter((entry) => entry.type === 'REFUND').length;
    item.cacheSavingsUsd += calls.reduce((sum, call) => sum + cacheSavingsUsd(call), 0);
    item.batchSavingsUsd += calls.filter((call) => call.isBatch).reduce((sum, call) => sum + Number(call.costUsd), 0);
    item.batch = item.batch || isBatch;
    if (row.status !== 'SUCCEEDED') item.status = row.status;
    if (row.promptVersion) item.promptVersions.add(row.promptVersion);
    const pricingVersionId = metadataString(row.metadata, 'actionPricingVersionId');
    if (pricingVersionId) item.pricingVersionIds.add(pricingVersionId);
    for (const call of calls) {
      const alias = call.modelAlias ?? call.actualModelId;
      item.aliases[alias] = (item.aliases[alias] ?? 0) + 1;
    }
    runs.set(key, item);
  }
  return [...runs.values()];
}

function matchesRun(run: PipelineRun, filters: AiEconomicsFilters): boolean {
  if (filters.actionKey && run.actionKey !== filters.actionKey) return false;
  const section = AI_ACTION_SECTIONS[run.actionKey as AiActionType] ?? 'Другое';
  if (filters.section && section !== filters.section) return false;
  if (filters.modelAlias && !(filters.modelAlias in run.aliases)) return false;
  if (filters.batch !== undefined && run.batch !== filters.batch) return false;
  if (filters.status && run.status !== filters.status) return false;
  if (filters.promptVersion && !run.promptVersions.has(filters.promptVersion)) return false;
  if (filters.actionPricingVersionId && !run.pricingVersionIds.has(filters.actionPricingVersionId)) return false;
  return true;
}

async function loadRows(filters: AiEconomicsFilters): Promise<NumberRow[]> {
  const from = filters.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = filters.to ?? new Date();
  return prisma.aIGeneration.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.plan ? { user: { subscription: { plan: filters.plan as never } } } : {}),
    },
    select: {
      id: true,
      actualCostUsd: true,
      aiPointsCaptured: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
      reasoningTokens: true,
      audioInputTokens: true,
      audioOutputTokens: true,
      retryCount: true,
      status: true,
      metadata: true,
      workflowRunId: true,
      promptVersion: true,
      userId: true,
      projectId: true,
      user: {
        select: {
          email: true,
          subscription: { select: { plan: true } },
        },
      },
      providerCalls: {
        select: {
          modelAlias: true,
          actualModelId: true,
          inputTokens: true,
          cachedInputTokens: true,
          outputTokens: true,
          reasoningTokens: true,
          audioInputTokens: true,
          audioOutputTokens: true,
          retryIndex: true,
          isBatch: true,
          costUsd: true,
          pricingSnapshot: true,
        },
      },
      ledgerEntries: {
        where: { unit: 'AI_POINT', type: { in: ['RELEASE', 'REFUND'] } },
        select: { type: true, quantity: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  }) as unknown as Promise<NumberRow[]>;
}

async function actionSummaries(runs: PipelineRun[]) {
  const groups = new Map<AIActionKey, PipelineRun[]>();
  for (const run of runs) groups.set(run.actionKey, [...(groups.get(run.actionKey) ?? []), run]);
  return Promise.all([...groups.entries()].map(async ([key, items]) => {
    const successes = items.filter((item) => item.status === 'SUCCEEDED' && item.points > 0);
    const costs = successes.map((item) => item.costUsd);
    const costPerPoint = successes.map((item) => item.costUsd / item.points);
    const definition = await aiActionRegistryService.resolve(key);
    const p90CostUsd = percentile(costs, 0.9);
    const rawRecommendedPoints = p90CostUsd * 1000 * 1.2;
    const recommendedPoints = roundRecommendedAiPoints(rawRecommendedPoints);
    const reliable = successes.length >= 20;
    const calls = items.reduce((sum, item) => sum + Object.values(item.aliases).reduce((a, b) => a + b, 0), 0);
    const aliasTotals: Record<string, number> = {};
    for (const item of items) {
      for (const [alias, count] of Object.entries(item.aliases)) aliasTotals[alias] = (aliasTotals[alias] ?? 0) + count;
    }
    return {
      actionKey: key,
      actionLabel: AI_ACTION_LABELS[key as AiActionType] ?? key,
      sectionLabel: AI_ACTION_SECTIONS[key as AiActionType] ?? 'Другое',
      runs: items.length,
      succeeded: successes.length,
      failed: items.filter((item) => item.status !== 'SUCCEEDED').length,
      currentAiPoints: definition.aiPoints,
      totalCostUsd: rounded(items.reduce((sum, item) => sum + item.costUsd, 0)),
      p50CostUsd: rounded(percentile(costs, 0.5)),
      p90CostUsd: rounded(p90CostUsd),
      p95CostUsd: rounded(percentile(costs, 0.95)),
      avgCostPerPointUsd: rounded(avg(costPerPoint)),
      p90CostPerPointUsd: rounded(percentile(costPerPoint, 0.9)),
      avgTokens: {
        input: Math.round(avg(items.map((item) => item.input))),
        cached: Math.round(avg(items.map((item) => item.cached))),
        output: Math.round(avg(items.map((item) => item.output))),
        reasoning: Math.round(avg(items.map((item) => item.reasoning))),
        audioInput: Math.round(avg(items.map((item) => item.audioInput))),
        audioOutput: Math.round(avg(items.map((item) => item.audioOutput))),
      },
      retries: items.reduce((sum, item) => sum + item.retries, 0),
      releases: items.reduce((sum, item) => sum + item.releases, 0),
      refunds: items.reduce((sum, item) => sum + item.refunds, 0),
      errorRate: rounded(items.length ? items.filter((item) => item.status !== 'SUCCEEDED').length / items.length : 0, 4),
      cacheHitRate: rounded(
        items.reduce((sum, item) => sum + item.input, 0)
          ? items.reduce((sum, item) => sum + item.cached, 0) / items.reduce((sum, item) => sum + item.input, 0)
          : 0,
        4,
      ),
      cacheSavingsUsd: rounded(items.reduce((sum, item) => sum + item.cacheSavingsUsd, 0)),
      batchSavingsUsd: rounded(items.reduce((sum, item) => sum + item.batchSavingsUsd, 0)),
      modelShares: Object.entries(aliasTotals).map(([alias, count]) => ({
        alias,
        calls: count,
        share: rounded(calls ? count / calls : 0, 4),
      })),
      recommendation: {
        formula: 'P90 cost USD × 1000 × 1.20',
        safetyFactor: 1.2,
        rawAiPoints: rounded(rawRecommendedPoints, 2),
        recommendedAiPoints: recommendedPoints,
        sampleSize: successes.length,
        reliable,
        reason: reliable ? null : 'Для надежной рекомендации нужно минимум 20 успешных результатов.',
      },
    };
  }));
}

export const aiEconomicsV2Service = {
  async report(filters: AiEconomicsFilters) {
    const rows = await loadRows(filters);
    const allRuns = buildRuns(rows);
    const runs = allRuns.filter((run) => matchesRun(run, filters));
    const actions = (await actionSummaries(runs)).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
    const totalInput = runs.reduce((sum, run) => sum + run.input, 0);
    const totalCached = runs.reduce((sum, run) => sum + run.cached, 0);
    const aliasTotals: Record<string, number> = {};
    for (const run of runs) {
      for (const [alias, count] of Object.entries(run.aliases)) aliasTotals[alias] = (aliasTotals[alias] ?? 0) + count;
    }
    const totalCalls = Object.values(aliasTotals).reduce((sum, count) => sum + count, 0);
    const userGroups = new Map<string, PipelineRun[]>();
    for (const run of runs) userGroups.set(run.userId, [...(userGroups.get(run.userId) ?? []), run]);
    const userAlerts = [...userGroups.entries()].flatMap(([userId, items]) => {
      const planId = normalizePlanId(items[0]?.plan);
      const budgetRub = getPlanById(planId).limits.aiCostBudgetRub;
      const costRub = items.reduce((sum, item) => sum + item.costUsd, 0) * 100;
      return costRub > budgetRub
        ? [{
          type: 'USER_OVER_AI_BUDGET',
          severity: 'warning',
          userId,
          email: items[0]?.email,
          message: `AI-расход ${Math.round(costRub)} ₽ превысил бюджет тарифа ${budgetRub} ₽.`,
        }]
        : [];
    });
    const actionAlerts = actions.flatMap((item) => {
      const alerts = [];
      if (item.recommendation.reliable && item.recommendation.recommendedAiPoints > item.currentAiPoints) {
        alerts.push({
          type: 'ACTION_UNDERPRICED',
          severity: 'warning',
          actionKey: item.actionKey,
          message: `P90 рекомендует ${item.recommendation.recommendedAiPoints} баллов вместо ${item.currentAiPoints}.`,
        });
      }
      if (item.runs >= 10 && item.errorRate > 0.15) {
        alerts.push({
          type: 'ACTION_HIGH_ERROR_RATE',
          severity: 'info',
          actionKey: item.actionKey,
          message: `Доля ошибок ${(item.errorRate * 100).toFixed(1)}%.`,
        });
      }
      return alerts;
    });
    return {
      period: {
        from: (filters.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString(),
        to: (filters.to ?? new Date()).toISOString(),
      },
      filters,
      totals: {
        pipelineRuns: runs.length,
        succeeded: runs.filter((run) => run.status === 'SUCCEEDED').length,
        failed: runs.filter((run) => run.status !== 'SUCCEEDED').length,
        costUsd: rounded(runs.reduce((sum, run) => sum + run.costUsd, 0)),
        aiPoints: runs.reduce((sum, run) => sum + run.points, 0),
        p50CostUsd: rounded(percentile(runs.map((run) => run.costUsd), 0.5)),
        p90CostUsd: rounded(percentile(runs.map((run) => run.costUsd), 0.9)),
        p95CostUsd: rounded(percentile(runs.map((run) => run.costUsd), 0.95)),
        costPerPointUsd: rounded(
          runs.reduce((sum, run) => sum + run.points, 0)
            ? runs.reduce((sum, run) => sum + run.costUsd, 0) / runs.reduce((sum, run) => sum + run.points, 0)
            : 0,
        ),
        p90CostPerPointUsd: rounded(percentile(
          runs.filter((run) => run.points > 0).map((run) => run.costUsd / run.points),
          0.9,
        )),
        cacheHitRate: rounded(totalInput ? totalCached / totalInput : 0, 4),
        cacheSavingsUsd: rounded(runs.reduce((sum, run) => sum + run.cacheSavingsUsd, 0)),
        batchSavingsUsd: rounded(runs.reduce((sum, run) => sum + run.batchSavingsUsd, 0)),
        retries: runs.reduce((sum, run) => sum + run.retries, 0),
        releases: runs.reduce((sum, run) => sum + run.releases, 0),
        refunds: runs.reduce((sum, run) => sum + run.refunds, 0),
      },
      modelShares: Object.entries(aliasTotals).map(([alias, calls]) => ({
        alias,
        calls,
        share: rounded(totalCalls ? calls / totalCalls : 0, 4),
      })),
      actions,
      alerts: [...actionAlerts, ...userAlerts],
    };
  },

  async applyRecommendedPrice(input: {
    actorUserId: string;
    actionKey: AIActionKey;
    aiPoints: number;
    sampleSize: number;
    p90CostUsd: number;
    confirmation: string;
  }) {
    if (input.confirmation !== `APPLY ${input.actionKey} ${input.aiPoints}`) {
      throw Object.assign(new Error(`Подтвердите строкой: APPLY ${input.actionKey} ${input.aiPoints}`), { status: 400 });
    }
    if (input.sampleSize < 20) {
      throw Object.assign(new Error('Нельзя применить ненадежную рекомендацию: нужно минимум 20 результатов.'), { status: 400 });
    }
    return aiConfigurationService.createActionPricingVersion({
      actorUserId: input.actorUserId,
      actionKey: input.actionKey,
      aiPoints: input.aiPoints,
      validFrom: new Date(),
      metadata: {
        source: 'ai-economics-v2',
        sampleSize: input.sampleSize,
        p90CostUsd: input.p90CostUsd,
        safetyFactor: 1.2,
      },
    });
  },

  async simulateTariff(input: {
    planId: PlanId;
    actionMix: Record<string, number>;
  }) {
    const plan = getPlanById(input.planId);
    const lines = await Promise.all(Object.entries(input.actionMix).map(async ([key, count]) => {
      if (!(key in AI_ACTION_DEFINITIONS)) throw new Error(`UNKNOWN_AI_ACTION: ${key}`);
      const definition = await aiActionRegistryService.resolve(key as AIActionKey);
      return {
        actionKey: key,
        count: Math.max(0, Math.floor(count)),
        aiPointsEach: definition.aiPoints,
        aiPointsTotal: definition.aiPoints * Math.max(0, Math.floor(count)),
      };
    }));
    const packagePoints = lines.reduce((sum, line) => sum + line.aiPointsTotal, 0);
    const historical = await prisma.aIGeneration.findMany({
      where: {
        status: 'SUCCEEDED',
        aiPointsCaptured: { gt: 0 },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { actualCostUsd: true, aiPointsCaptured: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const historicalCostPerPoint = historical.map((item) => (
      Number(item.actualCostUsd) / item.aiPointsCaptured
    ));
    // Until production has enough observations, use the inverse of the
    // recommendation formula: cost × 1000 × 1.2 = points.
    const estimatedUsdPerPoint = historical.length >= 20
      ? percentile(historicalCostPerPoint, 0.9)
      : 1 / 1200;
    return {
      plan,
      lines,
      package: {
        aiPoints: packagePoints,
        fitsBalance: packagePoints <= plan.limits.monthlyCredits,
        remainingPoints: plan.limits.monthlyCredits - packagePoints,
        estimatedAiCostRub: Math.round(packagePoints * estimatedUsdPerPoint * 100),
        budgetRub: plan.limits.aiCostBudgetRub,
        estimatedUsdPerPoint: rounded(estimatedUsdPerPoint),
        estimateSource: historical.length >= 20 ? 'historical_p90_90d' : 'formula_fallback',
        estimateSampleSize: historical.length,
      },
      forecasts: [30, 50, 70, 100].map((utilization) => {
        const points = Math.round(plan.limits.monthlyCredits * utilization / 100);
        const estimatedAiCostRub = Math.round(points * estimatedUsdPerPoint * 100);
        return {
          utilization,
          aiPoints: points,
          estimatedAiCostRub,
          budgetRub: plan.limits.aiCostBudgetRub,
          withinBudget: estimatedAiCostRub <= plan.limits.aiCostBudgetRub,
        };
      }),
    };
  },

  async reconcileOpenAiCosts(input: { from: Date; to: Date }) {
    if (!(await aiFeatureFlagsService.isEnabled('AI_COST_RECONCILIATION'))) {
      return { enabled: false, reason: 'AI_COST_RECONCILIATION disabled' };
    }
    if (!env.OPENAI_ADMIN_KEY) return { enabled: false, reason: 'OPENAI_ADMIN_KEY is not configured' };
    const openAiCostUsd = await openAiCostsProvider.totalCostUsd({
      adminKey: env.OPENAI_ADMIN_KEY,
      from: input.from,
      to: input.to,
    });
    const local = await prisma.aIProviderCall.aggregate({
      where: {
        provider: 'OPENAI',
        status: 'SUCCEEDED',
        createdAt: { gte: input.from, lte: input.to },
      },
      _sum: { costUsd: true },
    });
    const localCostUsd = Number(local._sum.costUsd ?? 0);
    const deltaUsd = openAiCostUsd - localCostUsd;
    return {
      enabled: true,
      period: { from: input.from.toISOString(), to: input.to.toISOString() },
      localCostUsd: rounded(localCostUsd),
      openAiCostUsd: rounded(openAiCostUsd),
      deltaUsd: rounded(deltaUsd),
      deltaPercent: rounded(localCostUsd ? deltaUsd / localCostUsd * 100 : 0, 2),
      alert: Math.abs(deltaUsd) > Math.max(1, localCostUsd * 0.1),
    };
  },

  validatePlanId(value: string): PlanId {
    const planId = resolvePlanId(value);
    if (!planId) throw new Error(`UNKNOWN_PLAN: ${value}`);
    return planId;
  },
};
