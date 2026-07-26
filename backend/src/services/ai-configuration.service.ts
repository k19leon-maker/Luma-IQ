import { AIProvider, Prisma } from '@prisma/client';
import { isFeatureFlagKey, isModelAlias } from '../config/ai-v2';
import { AI_ACTION_DEFINITIONS, type AIActionKey } from '../config/ai-action-registry';
import { prisma } from '../lib/prisma';

function auditData(input: {
  actorUserId?: string;
  configType: string;
  configKey: string;
  operation: string;
  before?: unknown;
  after?: unknown;
}) {
  return {
    actorUserId: input.actorUserId ?? null,
    configType: input.configType,
    configKey: input.configKey,
    operation: input.operation,
    before: input.before as Prisma.InputJsonValue | undefined,
    after: input.after as Prisma.InputJsonValue | undefined,
  };
}

export const aiConfigurationService = {
  async setFeatureFlag(input: { actorUserId: string; key: string; enabled: boolean; description?: string }) {
    if (!isFeatureFlagKey(input.key)) throw new Error(`UNKNOWN_AI_FEATURE_FLAG: ${input.key}`);
    return prisma.$transaction(async (tx) => {
      const before = await tx.aIFeatureFlag.findUnique({ where: { key: input.key } });
      const after = await tx.aIFeatureFlag.upsert({
        where: { key: input.key },
        create: { key: input.key, enabled: input.enabled, description: input.description },
        update: { enabled: input.enabled, ...(input.description !== undefined ? { description: input.description } : {}) },
      });
      await tx.aIConfigurationAuditLog.create({
        data: auditData({
          actorUserId: input.actorUserId,
          configType: 'feature_flag',
          configKey: input.key,
          operation: before ? 'UPDATE' : 'CREATE',
          before,
          after,
        }),
      });
      return after;
    });
  },

  async createModelProfileVersion(input: {
    actorUserId: string;
    alias: string;
    provider: AIProvider;
    actualModelId: string;
    validFrom: Date;
    metadata?: Prisma.InputJsonValue;
  }) {
    if (!isModelAlias(input.alias)) throw new Error(`UNKNOWN_MODEL_ALIAS: ${input.alias}`);
    return prisma.$transaction(async (tx) => {
      const before = await tx.aIModelProfileVersion.findFirst({
        where: { alias: input.alias, isActive: true, validTo: null },
        orderBy: { validFrom: 'desc' },
      });
      if (before && input.validFrom <= before.validFrom) {
        throw new Error('validFrom новой версии должен быть позже текущей версии');
      }
      if (before && before.validFrom < input.validFrom) {
        await tx.aIModelProfileVersion.update({ where: { id: before.id }, data: { validTo: input.validFrom } });
      }
      const after = await tx.aIModelProfileVersion.create({
        data: {
          alias: input.alias,
          provider: input.provider,
          actualModelId: input.actualModelId,
          validFrom: input.validFrom,
          metadata: input.metadata,
        },
      });
      await tx.aIConfigurationAuditLog.create({
        data: auditData({
          actorUserId: input.actorUserId,
          configType: 'model_profile',
          configKey: input.alias,
          operation: 'CREATE_VERSION',
          before,
          after,
        }),
      });
      return after;
    });
  },

  async createActionPricingVersion(input: {
    actorUserId: string;
    actionKey: AIActionKey;
    aiPoints: number;
    validFrom: Date;
    metadata?: Prisma.InputJsonValue;
  }) {
    if (!AI_ACTION_DEFINITIONS[input.actionKey]) throw new Error(`UNKNOWN_AI_ACTION: ${input.actionKey}`);
    return prisma.$transaction(async (tx) => {
      const before = await tx.aIActionPricingVersion.findFirst({
        where: { actionKey: input.actionKey, isActive: true, validTo: null },
        orderBy: { validFrom: 'desc' },
      });
      if (before && input.validFrom <= before.validFrom) {
        throw new Error('validFrom новой версии должен быть позже текущей версии');
      }
      if (before && before.validFrom < input.validFrom) {
        await tx.aIActionPricingVersion.update({ where: { id: before.id }, data: { validTo: input.validFrom } });
      }
      const after = await tx.aIActionPricingVersion.create({
        data: {
          actionKey: input.actionKey,
          aiPoints: input.aiPoints,
          validFrom: input.validFrom,
          metadata: input.metadata,
        },
      });
      await tx.aIConfigurationAuditLog.create({
        data: auditData({
          actorUserId: input.actorUserId,
          configType: 'action_pricing',
          configKey: input.actionKey,
          operation: 'CREATE_VERSION',
          before,
          after,
        }),
      });
      return after;
    });
  },

  async createActionDefinitionVersion(input: {
    actorUserId: string;
    actionKey: AIActionKey;
    pipeline: Prisma.InputJsonValue;
    contextBudget: number;
    outputLimit: number;
    retryPolicy: Prisma.InputJsonValue;
    fallbackPolicy: Prisma.InputJsonValue;
    batchEligible: boolean;
    validFrom: Date;
    metadata?: Prisma.InputJsonValue;
  }) {
    if (!AI_ACTION_DEFINITIONS[input.actionKey]) throw new Error(`UNKNOWN_AI_ACTION: ${input.actionKey}`);
    return prisma.$transaction(async (tx) => {
      const before = await tx.aIActionDefinitionVersion.findFirst({
        where: { actionKey: input.actionKey, isActive: true, validTo: null },
        orderBy: { validFrom: 'desc' },
      });
      if (before && input.validFrom <= before.validFrom) {
        throw new Error('validFrom новой версии должен быть позже текущей версии');
      }
      if (before && before.validFrom < input.validFrom) {
        await tx.aIActionDefinitionVersion.update({ where: { id: before.id }, data: { validTo: input.validFrom } });
      }
      const after = await tx.aIActionDefinitionVersion.create({
        data: {
          actionKey: input.actionKey,
          pipeline: input.pipeline,
          contextBudget: input.contextBudget,
          outputLimit: input.outputLimit,
          retryPolicy: input.retryPolicy,
          fallbackPolicy: input.fallbackPolicy,
          batchEligible: input.batchEligible,
          validFrom: input.validFrom,
          metadata: input.metadata,
        },
      });
      await tx.aIConfigurationAuditLog.create({
        data: auditData({
          actorUserId: input.actorUserId,
          configType: 'action_definition',
          configKey: input.actionKey,
          operation: 'CREATE_VERSION',
          before,
          after,
        }),
      });
      return after;
    });
  },

  async snapshot() {
    const [modelProfiles, actionDefinitions, actionPricing, featureFlags, auditLog] = await Promise.all([
      prisma.aIModelProfileVersion.findMany({ where: { isActive: true, validTo: null }, orderBy: { alias: 'asc' } }),
      prisma.aIActionDefinitionVersion.findMany({ where: { isActive: true, validTo: null }, orderBy: { actionKey: 'asc' } }),
      prisma.aIActionPricingVersion.findMany({ where: { isActive: true, validTo: null }, orderBy: { actionKey: 'asc' } }),
      prisma.aIFeatureFlag.findMany({ orderBy: { key: 'asc' } }),
      prisma.aIConfigurationAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return { modelProfiles, actionDefinitions, actionPricing, featureFlags, auditLog };
  },
};
