import { AIProvider as DbAIProvider, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { withGlobalAiBehaviorPrompt } from '../config/system-prompt';
import { prisma } from '../lib/prisma';
import { promptRegistry } from '../prompts/registry';
import { AIProvider, chat } from './ai.service';
import { aiGenerationService } from './ai-generation.service';
import { aiValidationService } from './ai-validation.service';
import { projectContextService } from './project-context.service';
import { promptCmsService } from './prompt-cms.service';
import { structuredOutputService } from './structured-output.service';

export interface RunWorkflowInput {
  userId: string;
  projectId: string;
  workflow: string;
  step: string;
  inputs: Record<string, unknown>;
  workflowRunId?: string;
  provider?: 'chatgpt' | 'claude';
  openaiModel?: string;
  claudeModel?: string;
  idempotencyKey?: string;
}

function toProvider(input?: 'chatgpt' | 'claude'): AIProvider {
  return input === 'claude' ? 'anthropic' : 'openai';
}

function toDbProvider(provider: AIProvider): DbAIProvider {
  if (provider === 'anthropic') return 'ANTHROPIC';
  if (provider === 'gemini') return 'GEMINI';
  if (provider === 'grok') return 'GROK';
  return 'OPENAI';
}

function workflowGroup(workflow: string): string {
  return workflow.split('.')[0] ?? workflow;
}

function workflowStageType(workflow: string, step: string): 'analysis' | 'options' | 'final' {
  if (workflow.includes('analysis') || workflow.includes('gap-analysis') || workflow.endsWith('.score')) {
    return 'analysis';
  }
  if (workflow.includes('topic') || workflow.includes('hooks') || workflow.includes('models') || workflow.includes('variants')) {
    return 'options';
  }
  if (step === 'generate' && (workflow === 'product.main' || workflow === 'product.mini' || workflow === 'leadmagnet')) {
    return 'analysis';
  }
  if (step === 'names' || step === 'offer' || step === 'bestName') {
    return 'options';
  }
  return 'final';
}

function buildRepairPrompt(content: string, errors: string[]): string {
  return `Исправь результат под ожидаемый формат.

Ошибки валидации:
${errors.map((error) => `- ${error}`).join('\n')}

Текущий результат:
${content}

Верни только исправленную финальную версию без комментариев.`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function makeIdempotencyKey(input: RunWorkflowInput): string {
  const raw = stableJson({
    userId: input.userId,
    projectId: input.projectId,
    workflow: input.workflow,
    step: input.step,
    workflowRunId: input.workflowRunId ?? null,
    provider: input.provider ?? null,
    openaiModel: input.openaiModel ?? null,
    claudeModel: input.claudeModel ?? null,
    inputs: input.inputs,
  });
  return `workflow:${crypto.createHash('sha256').update(raw).digest('hex')}`;
}

export const aiWorkflowService = {
  async run(input: RunWorkflowInput) {
    const config = promptRegistry.get(input.workflow, input.step);
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: { id: true },
    });
    if (!project) throw new Error('Проект не найден');

    const idempotencyKey = input.idempotencyKey ?? makeIdempotencyKey(input);
    const replayGeneration = await prisma.aIGeneration.findUnique({
      where: { idempotencyKey },
    });
    if (replayGeneration?.status === 'SUCCEEDED') {
      const artifact = await prisma.aIArtifact.findFirst({
        where: { generationId: replayGeneration.id, userId: input.userId, projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
      });
      if (artifact) {
        return {
          workflowRunId: artifact.workflowRunId ?? '',
          workflowStepId: artifact.workflowStepId ?? '',
          artifactId: artifact.id,
          generationId: replayGeneration.id,
          content: artifact.content,
          structured: artifact.structured,
          validation: (artifact.metadata as { validation?: unknown } | null)?.validation ?? { ok: true, errors: [] },
          mock: Boolean((artifact.metadata as { mock?: unknown } | null)?.mock),
          model: replayGeneration.model,
          provider: replayGeneration.provider === 'ANTHROPIC' ? 'anthropic' : 'openai',
          replayed: true,
        };
      }
    }
    if (replayGeneration?.status === 'RUNNING') {
      throw Object.assign(new Error('Этот workflow step уже выполняется'), { status: 409, code: 'WORKFLOW_IN_PROGRESS' });
    }

    const workflowRun = input.workflowRunId
      ? await prisma.aIWorkflowRun.findFirst({
        where: { id: input.workflowRunId, userId: input.userId, projectId: input.projectId },
      })
      : await prisma.aIWorkflowRun.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          workflow: input.workflow,
          featureCode: config.feature,
          input: input.inputs as Prisma.InputJsonValue,
          metadata: {
            promptId: config.id,
            promptVersion: config.version,
            stageType: workflowStageType(input.workflow, input.step),
          },
        },
      });

    if (!workflowRun) throw new Error('Workflow run не найден');
    const stageType = workflowStageType(input.workflow, input.step);

    const stepStartedAt = Date.now();
    const workflowStep = await prisma.aIWorkflowStep.create({
      data: {
        workflowRunId: workflowRun.id,
        step: input.step,
        input: input.inputs as Prisma.InputJsonValue,
      },
    });

    const context = await projectContextService.build({
      userId: input.userId,
      projectId: input.projectId,
      workflow: input.workflow,
      step: input.step,
      inputs: input.inputs,
    });

    const provider = toProvider(input.provider);
    const dbProvider = toDbProvider(provider);
    const baseSystemPrompt = withGlobalAiBehaviorPrompt(config.systemPrompt(context));
    const baseUserPrompt = config.userPromptBuilder({ inputs: input.inputs, context });
    const effectivePrompt = await promptCmsService.resolve({
      config,
      userId: input.userId,
      projectId: input.projectId,
      context,
      inputs: input.inputs,
      baseSystemPrompt,
      baseUserPrompt,
    });
    const model = provider === 'anthropic'
      ? input.claudeModel ?? effectivePrompt.model
      : input.openaiModel ?? effectivePrompt.model;
    const systemPrompt = effectivePrompt.systemPrompt;
    const userPrompt = effectivePrompt.userPrompt;
    let generationId: string | null = null;

    try {
      const executed = await aiGenerationService.run({
        userId: input.userId,
        projectId: input.projectId,
        workflowRunId: workflowRun.id,
        workflowStepId: workflowStep.id,
        featureCode: config.feature,
        provider: dbProvider,
        model,
        idempotencyKey,
        promptVersion: config.version,
        contextVersion: context.contextVersion,
        metadata: {
          workflow: input.workflow,
          step: input.step,
          promptId: config.id,
          cmsVersionId: effectivePrompt.cmsVersionId,
          cmsVersionLabel: effectivePrompt.cmsVersionLabel,
          promptExperimentId: effectivePrompt.experimentId,
          promptExperimentName: effectivePrompt.experimentName,
          promptExperimentVariantId: effectivePrompt.variantId,
          promptExperimentVariantName: effectivePrompt.variantName,
          contextBlocks: context.blocks.map((block) => block.key),
          contextApproxTokens: context.approxTokens,
          stageType,
        },
        execute: async () => {
          let response = await chat({
            provider,
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt,
            section: workflowGroup(input.workflow),
            openaiModel: provider === 'openai' ? model : undefined,
            claudeModel: provider === 'anthropic' ? model : undefined,
            maxTokens: effectivePrompt.maxTokens,
            temperature: effectivePrompt.temperature,
          });

          let validation = aiValidationService.validate(response.content, config.validationRules);
          let retryCount = 0;
          let usage = response.usage;

          if (!validation.ok) {
            retryCount = 1;
            const repair = await chat({
              provider,
              messages: [{ role: 'user', content: buildRepairPrompt(response.content, validation.errors) }],
              systemPrompt,
              section: workflowGroup(input.workflow),
              openaiModel: provider === 'openai' ? model : undefined,
              claudeModel: provider === 'anthropic' ? model : undefined,
              maxTokens: effectivePrompt.maxTokens,
              temperature: Math.max(0.2, effectivePrompt.temperature - 0.2),
            });
            response = repair;
            usage = {
              inputTokens: usage.inputTokens + repair.usage.inputTokens,
              outputTokens: usage.outputTokens + repair.usage.outputTokens,
              cachedInputTokens: (usage.cachedInputTokens ?? 0) + (repair.usage.cachedInputTokens ?? 0),
              totalTokens: usage.totalTokens + repair.usage.totalTokens,
            };
            validation = aiValidationService.validate(response.content, config.validationRules);
          }

          return {
            result: { response, validation, retryCount },
            usage,
            provider: toDbProvider(response.provider),
            model: response.model,
          };
        },
      });
      generationId = executed.generationId;
      const { response, validation, retryCount } = executed.result;

      const structured = structuredOutputService.build({
        userId: input.userId,
        projectId: input.projectId,
        artifactId: '',
        workflow: input.workflow,
        step: input.step,
        type: config.artifactType,
        title: String(input.inputs.topic ?? input.inputs.title ?? config.artifactType),
        content: response.content,
        inputs: input.inputs,
        metadata: { validation, stageType },
      });

      const artifact = await prisma.aIArtifact.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          workflowRunId: workflowRun.id,
          workflowStepId: workflowStep.id,
          generationId,
          workflow: input.workflow,
          step: input.step,
          type: config.artifactType,
          title: String(input.inputs.topic ?? input.inputs.title ?? config.artifactType),
          content: response.content,
          structured: {
            ...structured.data,
            rawContent: response.content,
            validation,
            workflow: input.workflow,
            step: input.step,
            stageType,
            inputs: input.inputs,
            provider: response.provider,
            model: response.model,
            mock: response.mock,
          } as unknown as Prisma.InputJsonValue,
          metadata: {
            promptId: config.id,
            promptVersion: config.version,
            cmsVersionId: effectivePrompt.cmsVersionId,
            cmsVersionLabel: effectivePrompt.cmsVersionLabel,
            promptExperimentId: effectivePrompt.experimentId,
            promptExperimentName: effectivePrompt.experimentName,
            promptExperimentVariantId: effectivePrompt.variantId,
            promptExperimentVariantName: effectivePrompt.variantName,
            validation,
            retryCount,
            provider: response.provider,
            model: response.model,
            mock: response.mock,
            stageType,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await structuredOutputService.save({
        userId: input.userId,
        projectId: input.projectId,
        artifactId: artifact.id,
        workflow: input.workflow,
        step: input.step,
        type: config.artifactType,
        title: artifact.title,
        content: response.content,
        inputs: input.inputs,
        metadata: { validation, stageType },
      }).catch((error) => {
        console.error('[AIWorkflow] structured output save failed:', error);
      });

      await prisma.aIWorkflowStep.update({
        where: { id: workflowStep.id },
        data: {
          status: 'SUCCEEDED',
          output: {
            artifactId: artifact.id,
            generationId,
            validation,
          } as unknown as Prisma.InputJsonValue,
          retryCount,
          latencyMs: Date.now() - stepStartedAt,
          completedAt: new Date(),
        },
      });

      await prisma.aIWorkflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: validation.ok ? 'SUCCEEDED' : 'SUCCEEDED_WITH_WARNINGS',
          output: {
            lastArtifactId: artifact.id,
            lastStep: input.step,
            validation,
          } as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      return {
        workflowRunId: workflowRun.id,
        workflowStepId: workflowStep.id,
        artifactId: artifact.id,
        generationId,
        content: response.content,
        structured: artifact.structured,
        validation,
        mock: response.mock,
        model: response.model,
        provider: response.provider,
      };
    } catch (err) {
      await prisma.aIWorkflowStep.update({
        where: { id: workflowStep.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'unknown',
          latencyMs: Date.now() - stepStartedAt,
          completedAt: new Date(),
        },
      }).catch(() => {});

      await prisma.aIWorkflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      }).catch(() => {});

      throw err;
    }
  },

  async cancel(input: { userId: string; workflowRunId: string }) {
    const workflowRun = await prisma.aIWorkflowRun.findFirst({
      where: { id: input.workflowRunId, userId: input.userId },
    });
    if (!workflowRun) throw new Error('Workflow run не найден');
    if (workflowRun.status !== 'RUNNING') return workflowRun;

    const [updated] = await prisma.$transaction([
      prisma.aIWorkflowRun.update({
        where: { id: workflowRun.id },
        data: { status: 'CANCELED', completedAt: new Date() },
      }),
      prisma.aIWorkflowStep.updateMany({
        where: { workflowRunId: workflowRun.id, status: 'RUNNING' },
        data: { status: 'CANCELED', completedAt: new Date() },
      }),
    ]);
    return updated;
  },
};
