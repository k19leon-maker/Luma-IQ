import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AI_ACTION_DEFINITIONS } from '../config/ai-action-registry';
import {
  CASTDEV_ANALYSIS_PRICING_POLICY,
  CASTDEV_TRANSCRIPTION_PRICING_POLICY,
} from '../config/ai-actions';
import { AI_FEATURE_FLAG_KEYS, DEFAULT_AI_FEATURE_FLAGS, DEFAULT_MODEL_PROFILES } from '../config/ai-v2';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const validFrom = new Date('2026-07-26T00:00:00.000Z');

function pricingPolicyFor(actionKey: string): Prisma.InputJsonValue | undefined {
  if (actionKey === 'castdev_transcription' || actionKey === 'cases_voice_transcription') {
    return CASTDEV_TRANSCRIPTION_PRICING_POLICY as unknown as Prisma.InputJsonValue;
  }
  if (actionKey === 'castdev_analysis' || actionKey === 'cases_extract_case') {
    return CASTDEV_ANALYSIS_PRICING_POLICY as unknown as Prisma.InputJsonValue;
  }
  return undefined;
}

const pricing = [
  { model: 'gpt-5.6-sol', input: '5', cached: '0.5', output: '30', audioInput: null, audioOutput: null },
  { model: 'gpt-5.6-terra', input: '2.5', cached: '0.25', output: '15', audioInput: null, audioOutput: null },
  { model: 'gpt-5.6-luna', input: '1', cached: '0.1', output: '6', audioInput: null, audioOutput: null },
  { model: 'gpt-4o-mini-transcribe', input: '0', cached: null, output: '5', audioInput: '1.25', audioOutput: '5' },
  { model: 'gpt-4o-transcribe-diarize', input: '0', cached: null, output: '10', audioInput: '2.5', audioOutput: '10' },
] as const;

async function seedModelPricing() {
  for (const item of pricing) {
    const existing = await prisma.aIModelPricing.findFirst({
      where: { provider: 'OPENAI', model: item.model, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (existing) continue;
    const created = await prisma.aIModelPricing.create({
      data: {
        provider: 'OPENAI',
        model: item.model,
        inputPricePer1M: item.input,
        cachedInputPricePer1M: item.cached,
        outputPricePer1M: item.output,
        audioInputPricePer1M: item.audioInput,
        audioOutputPricePer1M: item.audioOutput,
        validFrom,
        metadata: {
          source: 'https://openai.com/api/pricing/',
          accountingVersion: 'v2',
        },
      },
    });
    await prisma.aIConfigurationAuditLog.create({
      data: {
        configType: 'model_pricing',
        configKey: `OPENAI:${item.model}`,
        operation: 'SEED_VERSION',
        after: created as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function seedProfiles() {
  for (const [alias, profile] of Object.entries(DEFAULT_MODEL_PROFILES)) {
    const existing = await prisma.aIModelProfileVersion.findFirst({
      where: { alias, isActive: true, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (existing) continue;
    const created = await prisma.aIModelProfileVersion.create({
      data: {
        alias,
        provider: profile.provider,
        actualModelId: profile.actualModelId,
        validFrom,
        metadata: { source: 'initial-v2-seed' },
      },
    });
    await prisma.aIConfigurationAuditLog.create({
      data: {
        configType: 'model_profile',
        configKey: alias,
        operation: 'SEED_VERSION',
        after: created as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function seedActions() {
  for (const definition of Object.values(AI_ACTION_DEFINITIONS)) {
    const currentDefinition = await prisma.aIActionDefinitionVersion.findFirst({
      where: { actionKey: definition.actionKey, isActive: true, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    const desiredDefinition = {
      pipeline: definition.pipeline,
      contextBudget: definition.contextBudget,
      outputLimit: definition.outputLimit,
      retryPolicy: definition.retryPolicy,
      fallbackPolicy: definition.fallbackPolicy,
      batchEligible: definition.batchEligible,
    };
    const currentDefinitionSnapshot = currentDefinition ? {
      pipeline: currentDefinition.pipeline,
      contextBudget: currentDefinition.contextBudget,
      outputLimit: currentDefinition.outputLimit,
      retryPolicy: currentDefinition.retryPolicy,
      fallbackPolicy: currentDefinition.fallbackPolicy,
      batchEligible: currentDefinition.batchEligible,
    } : null;
    if (JSON.stringify(currentDefinitionSnapshot) !== JSON.stringify(desiredDefinition)) {
      const now = new Date();
      if (currentDefinition) {
        await prisma.aIActionDefinitionVersion.updateMany({
          where: { actionKey: definition.actionKey, isActive: true, validTo: null },
          data: { isActive: false, validTo: now },
        });
      }
      const created = await prisma.aIActionDefinitionVersion.create({
        data: {
          actionKey: definition.actionKey,
          pipeline: definition.pipeline as unknown as Prisma.InputJsonValue,
          contextBudget: definition.contextBudget,
          outputLimit: definition.outputLimit,
          retryPolicy: definition.retryPolicy as Prisma.InputJsonValue,
          fallbackPolicy: definition.fallbackPolicy as Prisma.InputJsonValue,
          batchEligible: definition.batchEligible,
          validFrom: now,
          metadata: {
            source: 'config-version-seed',
            supersedes: currentDefinition?.id ?? null,
          },
        },
      });
      await prisma.aIConfigurationAuditLog.create({
        data: {
          configType: 'action_definition',
          configKey: definition.actionKey,
          operation: currentDefinition ? 'UPDATE_VERSION' : 'SEED_VERSION',
          before: currentDefinition as unknown as Prisma.InputJsonValue,
          after: created as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const currentPricing = await prisma.aIActionPricingVersion.findFirst({
      where: { actionKey: definition.actionKey, isActive: true, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    const desiredPricingPolicy = pricingPolicyFor(definition.actionKey);
    const currentPricingMetadata = currentPricing?.metadata
      && typeof currentPricing.metadata === 'object'
      && !Array.isArray(currentPricing.metadata)
      ? currentPricing.metadata as Record<string, unknown>
      : {};
    if (
      !currentPricing
      || currentPricing.aiPoints !== definition.aiPoints
      || JSON.stringify(currentPricingMetadata.pricingPolicy ?? null) !== JSON.stringify(desiredPricingPolicy ?? null)
    ) {
      const now = new Date();
      if (currentPricing) {
        await prisma.aIActionPricingVersion.updateMany({
          where: { actionKey: definition.actionKey, isActive: true, validTo: null },
          data: { isActive: false, validTo: now },
        });
      }
      const created = await prisma.aIActionPricingVersion.create({
        data: {
          actionKey: definition.actionKey,
          aiPoints: definition.aiPoints,
          validFrom: now,
          metadata: {
            source: 'config-version-seed',
            supersedes: currentPricing?.id ?? null,
            ...(desiredPricingPolicy ? { pricingPolicy: desiredPricingPolicy } : {}),
          },
        },
      });
      await prisma.aIConfigurationAuditLog.create({
        data: {
          configType: 'action_pricing',
          configKey: definition.actionKey,
          operation: currentPricing ? 'UPDATE_VERSION' : 'SEED_VERSION',
          before: currentPricing as unknown as Prisma.InputJsonValue,
          after: created as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
}

async function seedFlags() {
  for (const key of AI_FEATURE_FLAG_KEYS) {
    await prisma.aIFeatureFlag.upsert({
      where: { key },
      create: {
        key,
        enabled: DEFAULT_AI_FEATURE_FLAGS[key],
        description: 'AI Infrastructure V2 rollout flag',
        metadata: { source: 'initial-v2-seed' },
      },
      update: {},
    });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await seedModelPricing();
  await seedProfiles();
  await seedActions();
  await seedFlags();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
