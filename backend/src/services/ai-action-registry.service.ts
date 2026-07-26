import { Prisma } from '@prisma/client';
import {
  AI_ACTION_DEFINITIONS,
  type AIActionDefinition,
  type AIActionKey,
} from '../config/ai-action-registry';
import { prisma } from '../lib/prisma';

function json<T>(value: Prisma.JsonValue, fallback: T): T {
  return value && typeof value === 'object' ? value as T : fallback;
}

export const aiActionRegistryService = {
  fallback(actionKey: AIActionKey): AIActionDefinition {
    const definition = AI_ACTION_DEFINITIONS[actionKey];
    if (!definition) throw new Error(`UNKNOWN_AI_ACTION: ${actionKey}`);
    return definition;
  },

  async resolve(actionKey: AIActionKey, at = new Date()): Promise<AIActionDefinition & {
    definitionVersionId: string | null;
    pricingVersionId: string | null;
    pricingMetadata: Prisma.JsonValue | null;
    source: 'database' | 'config';
  }> {
    const fallback = aiActionRegistryService.fallback(actionKey);
    const [definition, pricing] = await Promise.all([
      prisma.aIActionDefinitionVersion.findFirst({
        where: {
          actionKey,
          isActive: true,
          validFrom: { lte: at },
          OR: [{ validTo: null }, { validTo: { gt: at } }],
        },
        orderBy: { validFrom: 'desc' },
      }),
      prisma.aIActionPricingVersion.findFirst({
        where: {
          actionKey,
          isActive: true,
          validFrom: { lte: at },
          OR: [{ validTo: null }, { validTo: { gt: at } }],
        },
        orderBy: { validFrom: 'desc' },
      }),
    ]);

    return {
      ...fallback,
      ...(definition ? {
        pipeline: json(definition.pipeline, fallback.pipeline),
        contextBudget: definition.contextBudget,
        outputLimit: definition.outputLimit,
        retryPolicy: json(definition.retryPolicy, fallback.retryPolicy),
        fallbackPolicy: json(definition.fallbackPolicy, fallback.fallbackPolicy),
        batchEligible: definition.batchEligible,
      } : {}),
      aiPoints: pricing?.aiPoints ?? fallback.aiPoints,
      definitionVersionId: definition?.id ?? null,
      pricingVersionId: pricing?.id ?? null,
      pricingMetadata: pricing?.metadata ?? null,
      source: definition || pricing ? 'database' : 'config',
    };
  },

  async listPrices(at = new Date()): Promise<Array<{
    actionKey: AIActionKey;
    aiPoints: number;
  }>> {
    const rows = await prisma.aIActionPricingVersion.findMany({
      where: {
        isActive: true,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { validFrom: 'desc' },
      select: {
        actionKey: true,
        aiPoints: true,
      },
    });
    const currentPrices = new Map<string, number>();

    for (const row of rows) {
      if (!currentPrices.has(row.actionKey)) {
        currentPrices.set(row.actionKey, row.aiPoints);
      }
    }

    return (Object.keys(AI_ACTION_DEFINITIONS) as AIActionKey[]).map((actionKey) => ({
      actionKey,
      aiPoints: currentPrices.get(actionKey) ?? AI_ACTION_DEFINITIONS[actionKey].aiPoints,
    }));
  },
};
