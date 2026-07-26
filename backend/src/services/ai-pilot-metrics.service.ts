import { prisma } from '../lib/prisma';
import { env } from '../config/env';

function metadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(8));
}

export const aiPilotMetricsService = {
  async report(input: { days?: number; userId?: string }) {
    const days = Math.min(180, Math.max(1, input.days ?? 30));
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.aIGeneration.findMany({
      where: {
        createdAt: { gte: from },
        ...(input.userId ? { userId: input.userId } : {}),
        metadata: { path: ['runtime'], equals: 'ai-orchestrator-v2' },
      },
      select: {
        status: true,
        actualCostUsd: true,
        aiPointsCaptured: true,
        latencyMs: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = metadataString(row.metadata, 'actionKey') || 'unknown';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const summarize = (items: typeof rows) => {
      const succeeded = items.filter((item) => item.status === 'SUCCEEDED');
      const costPerPoint = succeeded
        .filter((item) => item.aiPointsCaptured > 0)
        .map((item) => Number(item.actualCostUsd) / item.aiPointsCaptured);
      const latencies = succeeded.map((item) => item.latencyMs ?? 0).filter((value) => value > 0);
      return {
        runs: items.length,
        succeeded: succeeded.length,
        failed: items.filter((item) => item.status === 'FAILED').length,
        errorRate: items.length ? rounded(items.filter((item) => item.status === 'FAILED').length / items.length) : 0,
        totalCostUsd: rounded(succeeded.reduce((sum, item) => sum + Number(item.actualCostUsd), 0)),
        pointsCharged: succeeded.reduce((sum, item) => sum + item.aiPointsCaptured, 0),
        p50CostPerPointUsd: rounded(percentile(costPerPoint, 0.5)),
        p90CostPerPointUsd: rounded(percentile(costPerPoint, 0.9)),
        p50LatencyMs: percentile(latencies, 0.5),
        p90LatencyMs: percentile(latencies, 0.9),
      };
    };

    const total = summarize(rows);
    const alerts = total.runs < env.AI_V2_ALERT_MIN_RUNS
      ? []
      : [
        ...(total.errorRate > env.AI_V2_MAX_ERROR_RATE ? [{
          code: 'AI_V2_ERROR_RATE_HIGH',
          severity: 'critical',
          value: total.errorRate,
          threshold: env.AI_V2_MAX_ERROR_RATE,
          message: 'Доля ошибок AI V2 превысила допустимый порог. Остановите расширение rollout.',
        }] : []),
        ...(total.p90CostPerPointUsd > env.AI_V2_MAX_P90_COST_PER_POINT_USD ? [{
          code: 'AI_V2_P90_COST_HIGH',
          severity: 'critical',
          value: total.p90CostPerPointUsd,
          threshold: env.AI_V2_MAX_P90_COST_PER_POINT_USD,
          message: 'P90 стоимости AI-балла превысил допустимый порог. Остановите расширение rollout.',
        }] : []),
      ];

    return {
      period: { days, from: from.toISOString(), to: new Date().toISOString() },
      rollout: {
        percent: env.AI_ORCHESTRATION_V2_ROLLOUT_PERCENT,
        minRunsForAlerts: env.AI_V2_ALERT_MIN_RUNS,
      },
      total,
      alerts,
      actions: [...groups.entries()]
        .map(([actionKey, items]) => ({ actionKey, ...summarize(items) }))
        .sort((left, right) => right.runs - left.runs),
    };
  },
};
