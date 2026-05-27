import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { contextAppendix } from '../prompts/registry/helpers';
import { PromptConfig } from '../prompts/registry';
import { ProjectContextBundle } from './project-context.service';

export interface EffectivePromptConfig {
  config: PromptConfig;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  cmsVersionId?: string;
  cmsVersionLabel?: string;
  experimentId?: string;
  experimentName?: string;
  variantId?: string;
  variantName?: string;
}

function hashPercent(raw: string): number {
  const hex = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 100;
}

function renderTemplate(template: string, values: Record<string, unknown>, context: ProjectContextBundle): string {
  return template
    .replaceAll('{{context}}', contextAppendix(context))
    .replace(/\{\{input\.([a-zA-Z0-9_.-]+)\}\}/g, (_, path: string) => {
      const value = path.split('.').reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
      }, values);
      return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
    });
}

export const promptCmsService = {
  async resolve(input: {
    config: PromptConfig;
    userId: string;
    projectId: string;
    context: ProjectContextBundle;
    inputs: Record<string, unknown>;
    baseSystemPrompt: string;
    baseUserPrompt: string;
  }): Promise<EffectivePromptConfig> {
    const active = await prisma.promptVersion.findFirst({
      where: {
        workflow: input.config.workflow,
        step: input.config.step,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
    });

    const experiment = await prisma.promptExperiment.findFirst({
      where: {
        workflow: input.config.workflow,
        step: input.config.step,
        status: 'RUNNING',
        OR: [{ endedAt: null }, { endedAt: { gt: new Date() } }],
      },
      orderBy: { startedAt: 'desc' },
      include: { variants: { include: { promptVersion: true } } },
    });

    let selectedVersion = active;
    let selectedVariant: NonNullable<typeof experiment>['variants'][number] | null = null;

    if (experiment && experiment.variants.length > 0 && hashPercent(`${input.userId}:${input.projectId}:${experiment.id}`) < experiment.trafficPct) {
      const total = experiment.variants.reduce((sum, variant) => sum + Math.max(0, variant.trafficWeight), 0) || 1;
      const point = hashPercent(`${input.userId}:${input.projectId}:${experiment.id}:variant`) % total;
      let cursor = 0;
      selectedVariant = experiment.variants[0];
      for (const variant of experiment.variants) {
        cursor += Math.max(0, variant.trafficWeight);
        if (point < cursor) {
          selectedVariant = variant;
          break;
        }
      }
      selectedVersion = selectedVariant.promptVersion ?? null;
    }

    const systemPrompt = selectedVersion?.systemPrompt
      ? renderTemplate(selectedVersion.systemPrompt, input.inputs, input.context)
      : input.baseSystemPrompt;
    const userPrompt = selectedVersion?.userPromptTemplate
      ? renderTemplate(selectedVersion.userPromptTemplate, input.inputs, input.context)
      : input.baseUserPrompt;

    return {
      config: input.config,
      model: selectedVersion?.model ?? input.config.model,
      temperature: selectedVersion?.temperature ? Number(selectedVersion.temperature) : input.config.temperature,
      maxTokens: selectedVersion?.maxTokens ?? input.config.maxTokens,
      systemPrompt,
      userPrompt,
      cmsVersionId: selectedVersion?.id,
      cmsVersionLabel: selectedVersion?.versionLabel,
      experimentId: experiment?.id,
      experimentName: experiment?.name,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
    };
  },

  promptVersionData(input: {
    prompt: PromptConfig;
    userId?: string;
    data: {
      versionLabel: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      userPromptTemplate?: string;
      validationRules?: unknown;
      status?: string;
      notes?: string;
    };
  }): Prisma.PromptVersionCreateInput {
    return {
      promptId: input.prompt.id,
      versionLabel: input.data.versionLabel,
      workflow: input.prompt.workflow,
      step: input.prompt.step,
      featureCode: input.prompt.feature,
      artifactType: input.prompt.artifactType,
      model: input.data.model ?? null,
      temperature: input.data.temperature == null ? null : new Prisma.Decimal(input.data.temperature),
      maxTokens: input.data.maxTokens ?? null,
      systemPrompt: input.data.systemPrompt ?? null,
      userPromptTemplate: input.data.userPromptTemplate ?? null,
      validationRules: (input.data.validationRules ?? input.prompt.validationRules) as Prisma.InputJsonValue,
      status: input.data.status ?? 'DRAFT',
      notes: input.data.notes ?? null,
      createdBy: input.userId ? { connect: { id: input.userId } } : undefined,
    };
  },
};
