import type { AIProvider, Prisma } from '@prisma/client';
import type { TokenUsage } from '../services/ai-cost.service';

export type ProviderTelemetryContext = {
  generationId?: string | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  userId?: string | null;
  projectId?: string | null;
  correlationId?: string | null;
  actionKey: string;
  pipeline?: string | null;
  stage: string;
  promptVersion?: string | null;
  modelAlias?: string | null;
  modelSnapshot?: Prisma.InputJsonValue;
  retryIndex?: number;
  isBatch?: boolean;
  metadata?: Prisma.InputJsonValue;
};

export type ProviderExecutionResult<T> = {
  result: T;
  responseId?: string | null;
  usage: TokenUsage;
};

export type MeteredProviderResult<T> = ProviderExecutionResult<T> & {
  provider: AIProvider;
  model: string;
  providerCallId: string | null;
  actualCostUsd: string;
  pricingSnapshot: Prisma.InputJsonValue;
};
