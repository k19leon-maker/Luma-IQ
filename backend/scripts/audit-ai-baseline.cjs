const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const number = (value) => Number(value || 0);

function percentile(values, quantile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function summarize(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const item = grouped.get(row.featureCode) ?? {
      featureCode: row.featureCode,
      count: 0,
      success: 0,
      failed: 0,
      tokens: 0,
      costUsd: 0,
      credits: 0,
      latencies: [],
      tokenCounts: [],
    };

    item.count += 1;
    if (row.status === 'SUCCEEDED') item.success += 1;
    if (row.status === 'FAILED' || row.status === 'TIMEOUT') item.failed += 1;
    item.tokens += row.totalTokens;
    item.costUsd += number(row.actualCostUsd);
    item.credits += row.creditsCharged;
    if (row.latencyMs !== null) item.latencies.push(row.latencyMs);
    if (row.totalTokens > 0) item.tokenCounts.push(row.totalTokens);
    grouped.set(row.featureCode, item);
  }

  return [...grouped.values()]
    .map((item) => ({
      featureCode: item.featureCode,
      count: item.count,
      success: item.success,
      failed: item.failed,
      successRatePct: item.count ? Number((100 * item.success / item.count).toFixed(1)) : 0,
      totalTokens: item.tokens,
      totalCostUsd: Number(item.costUsd.toFixed(6)),
      creditsCharged: item.credits,
      p50Tokens: percentile(item.tokenCounts, 0.5),
      p90Tokens: percentile(item.tokenCounts, 0.9),
      p50LatencyMs: percentile(item.latencies, 0.5),
      p90LatencyMs: percentile(item.latencies, 0.9),
    }))
    .sort((left, right) => right.totalCostUsd - left.totalCostUsd);
}

function summarizeTotal(rows) {
  const successful = rows.filter((row) => row.status === 'SUCCEEDED');
  const failed = rows.filter((row) => row.status === 'FAILED' || row.status === 'TIMEOUT');
  const tokenCounts = successful.map((row) => row.totalTokens).filter(Boolean);
  const latencies = successful.map((row) => row.latencyMs).filter((value) => value !== null);

  return {
    count: rows.length,
    success: successful.length,
    failed: failed.length,
    running: rows.filter((row) => row.status === 'RUNNING').length,
    totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
    totalCostUsd: Number(rows.reduce((sum, row) => sum + number(row.actualCostUsd), 0).toFixed(6)),
    creditsCharged: rows.reduce((sum, row) => sum + row.creditsCharged, 0),
    p50Tokens: percentile(tokenCounts, 0.5),
    p90Tokens: percentile(tokenCounts, 0.9),
    p50LatencyMs: percentile(latencies, 0.5),
    p90LatencyMs: percentile(latencies, 0.9),
  };
}

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const generationSelect = {
    featureCode: true,
    status: true,
    totalTokens: true,
    actualCostUsd: true,
    creditsCharged: true,
    latencyMs: true,
    model: true,
    provider: true,
    createdAt: true,
  };

  const [
    allGenerations,
    recentGenerations,
    workflowStatus,
    requestStatus,
    modelPricing,
    featurePricing,
    subscriptions,
    staleWorkflowRuns,
  ] = await Promise.all([
    prisma.aIGeneration.findMany({ select: generationSelect }),
    prisma.aIGeneration.findMany({
      where: { createdAt: { gte: since } },
      select: generationSelect,
    }),
    prisma.aIWorkflowRun.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.aIRequestLog.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.aIModelPricing.findMany({
      where: { OR: [{ validTo: null }, { validTo: { gte: now } }] },
      select: {
        provider: true,
        model: true,
        inputPricePer1M: true,
        outputPricePer1M: true,
        cachedInputPricePer1M: true,
        validFrom: true,
        validTo: true,
      },
    }),
    prisma.featurePricing.findMany({
      where: { isActive: true },
      select: {
        featureCode: true,
        creditPrice: true,
        generationClass: true,
        pricingMode: true,
        validFrom: true,
        validTo: true,
      },
    }),
    prisma.subscription.groupBy({
      by: ['plan', 'status'],
      _count: { _all: true },
    }),
    prisma.aIWorkflowRun.groupBy({
      by: ['status'],
      where: {
        status: { in: ['QUEUED', 'RUNNING'] },
        updatedAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
  ]);

  const modelDistribution = new Map();
  for (const row of recentGenerations) {
    const key = `${row.provider}:${row.model}`;
    const item = modelDistribution.get(key) ?? {
      provider: row.provider,
      model: row.model,
      count: 0,
      tokens: 0,
      costUsd: 0,
    };
    item.count += 1;
    item.tokens += row.totalTokens;
    item.costUsd += number(row.actualCostUsd);
    modelDistribution.set(key, item);
  }

  const firstGeneration = allGenerations.length
    ? allGenerations.reduce((left, right) => left.createdAt < right.createdAt ? left : right).createdAt
    : null;
  const lastGeneration = allGenerations.length
    ? allGenerations.reduce((left, right) => left.createdAt > right.createdAt ? left : right).createdAt
    : null;

  console.log(JSON.stringify({
    capturedAt: now.toISOString(),
    window30Start: since.toISOString(),
    allTime: {
      firstGeneration,
      lastGeneration,
      total: summarizeTotal(allGenerations),
      summary: summarize(allGenerations),
    },
    last30: {
      total: summarizeTotal(recentGenerations),
      summary: summarize(recentGenerations),
      models: [...modelDistribution.values()]
        .map((item) => ({ ...item, costUsd: Number(item.costUsd.toFixed(6)) }))
        .sort((left, right) => right.costUsd - left.costUsd),
    },
    workflowStatus,
    staleWorkflowRuns,
    requestStatus,
    modelPricing,
    featurePricing,
    subscriptions,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
