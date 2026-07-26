import { AIProvider as DbAIProvider, Prisma } from '@prisma/client';
import crypto from 'crypto';
import type { FeatureCode } from '../config/ai-economy';
import type { AIActionKey, AIActionStage } from '../config/ai-action-registry';
import { prisma } from '../lib/prisma';
import type { ProjectContextBundle } from './project-context.service';
import { aiActionRegistryService } from './ai-action-registry.service';
import { aiGenerationService } from './ai-generation.service';
import { aiPointLedgerService } from './ai-point-ledger.service';
import { chat, type AIProvider } from './ai.service';
import { contextBuilderService } from './context-builder.service';
import { modelRouterService } from './model-router.service';
import {
  pipelineRunnerService,
  type PipelineStageExecutionInput,
} from './pipeline-runner.service';
import { structuredOutputService } from './structured-output.service';
import { aiValidationService } from './ai-validation.service';
import type { ValidationRules } from '../prompts/registry';

function toRuntimeProvider(provider: DbAIProvider): AIProvider {
  if (provider === 'ANTHROPIC') return 'anthropic';
  if (provider === 'GEMINI') return 'gemini';
  if (provider === 'GROK') return 'grok';
  return 'openai';
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function idempotencyKey(input: {
  userId: string;
  projectId: string;
  actionKey: AIActionKey;
  workflow: string;
  inputs: Record<string, unknown>;
}) {
  return `orchestrator:${crypto.createHash('sha256').update(stableJson(input)).digest('hex')}`;
}

export type OrchestratorStagePromptInput = {
  actionKey: AIActionKey;
  stage: AIActionStage;
  context: ProjectContextBundle;
  payload: Record<string, unknown>;
  inputs: Record<string, unknown>;
};

export type OrchestratorStagePrompt = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
};

export type AiOrchestratorResult = {
  workflowRunId: string;
  workflowStepId: string;
  generationId: string;
  artifactId: string;
  content: string;
  structured: Prisma.JsonValue | null;
  aiPointsCharged: number;
  aiBalanceRemaining: number;
  mock: boolean;
  model: string;
  provider: AIProvider;
  validation: { ok: boolean; errors: string[] };
  replayed?: boolean;
};

export const aiOrchestratorService = {
  async run(input: {
    userId: string;
    projectId: string;
    actionKey: AIActionKey;
    featureCode: FeatureCode;
    workflow: string;
    inputs: Record<string, unknown>;
    promptVersion: string;
    artifactType: string;
    validationRules?: ValidationRules;
    title?: string;
    idempotencyKey?: string;
    buildStagePrompt: (stageInput: OrchestratorStagePromptInput) => OrchestratorStagePrompt | Promise<OrchestratorStagePrompt>;
  }): Promise<AiOrchestratorResult> {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: { id: true },
    });
    if (!project) throw Object.assign(new Error('Проект не найден'), { status: 404 });

    const requestKey = input.idempotencyKey ?? idempotencyKey(input);
    const replay = await prisma.aIGeneration.findUnique({ where: { idempotencyKey: requestKey } });
    if (replay?.status === 'SUCCEEDED') {
      const artifact = await prisma.aIArtifact.findFirst({
        where: {
          generationId: replay.id,
          userId: input.userId,
          projectId: input.projectId,
          type: input.artifactType,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (artifact) {
        const balance = replay.billingPeriodId
          ? await aiPointLedgerService.getState(input.userId, replay.billingPeriodId)
          : null;
        return {
          workflowRunId: artifact.workflowRunId ?? '',
          workflowStepId: artifact.workflowStepId ?? '',
          generationId: replay.id,
          artifactId: artifact.id,
          content: artifact.content,
          structured: artifact.structured,
          aiPointsCharged: replay.aiPointsCaptured,
          aiBalanceRemaining: balance?.available ?? 0,
          mock: Boolean((artifact.metadata as { mock?: unknown } | null)?.mock),
          model: replay.model,
          provider: toRuntimeProvider(replay.provider),
          validation: { ok: true, errors: [] },
          replayed: true,
        };
      }
    }
    if (replay?.status === 'RUNNING') {
      throw Object.assign(new Error('Это AI-действие уже выполняется'), {
        status: 409,
        code: 'ORCHESTRATION_IN_PROGRESS',
      });
    }
    if (replay) {
      await prisma.aIGeneration.update({
        where: { id: replay.id },
        data: { idempotencyKey: null },
      });
    }

    const definition = await aiActionRegistryService.resolve(input.actionKey);
    const context = await contextBuilderService.build({
      userId: input.userId,
      projectId: input.projectId,
      workflow: input.workflow,
      actionKey: input.actionKey,
      actionDefinition: definition,
      inputs: input.inputs,
      promptVersion: input.promptVersion,
    });
    const firstStage = definition.pipeline[0];
    if (!firstStage) throw new Error(`EMPTY_AI_PIPELINE: ${input.actionKey}`);
    const initialRoute = await modelRouterService.routeForAttempt({
      definition,
      stage: firstStage,
      attemptIndex: 0,
    });
    const workflowRun = await prisma.aIWorkflowRun.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        workflow: input.workflow,
        featureCode: input.featureCode,
        input: {
          actionKey: input.actionKey,
          inputs: input.inputs,
          contextSummaryId: context.summaryId,
        } as unknown as Prisma.InputJsonValue,
        metadata: {
          runtime: 'ai-orchestrator-v2',
          actionDefinitionVersionId: definition.definitionVersionId,
          actionPricingVersionId: definition.pricingVersionId,
          contextVersion: context.bundle.contextVersion,
          contextSummaryVersion: context.summaryVersion,
          promptCacheKey: context.promptCacheKey,
          contextCompressed: context.compressed,
          contextCacheHit: context.cacheHit,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    let generationId: string | null = null;
    let pointsPending = false;
    try {
      const executed = await aiGenerationService.run({
        userId: input.userId,
        projectId: input.projectId,
        workflowRunId: workflowRun.id,
        featureCode: input.featureCode,
        actionKey: input.actionKey,
        provider: initialRoute.provider,
        model: initialRoute.actualModelId,
        idempotencyKey: requestKey,
        promptVersion: input.promptVersion,
        contextVersion: context.bundle.contextVersion,
        deferAiPointCapture: true,
        metadata: {
          runtime: 'ai-orchestrator-v2',
          actionKey: input.actionKey,
          aiPoints: definition.aiPoints,
          actionDefinitionVersionId: definition.definitionVersionId,
          actionPricingVersionId: definition.pricingVersionId,
          contextSummaryId: context.summaryId,
          contextSummaryVersion: context.summaryVersion,
          contextApproxTokens: context.approxTokens,
          contextSourceTokens: context.sourceTokens,
          contextCompressed: context.compressed,
          compressionDroppedBlocks: context.droppedBlockKeys,
          contextCacheHit: context.cacheHit,
          promptCacheKey: context.promptCacheKey,
          outputLimit: definition.outputLimit,
          initialRoute,
        } as unknown as Prisma.InputJsonValue,
        execute: async ({ generationId: activeGenerationId }) => {
          generationId = activeGenerationId;
          const pipeline = await pipelineRunnerService.run({
            userId: input.userId,
            projectId: input.projectId,
            workflowRunId: workflowRun.id,
            generationId: activeGenerationId,
            workflow: input.workflow,
            definition,
            initialPayload: {
              inputs: input.inputs,
              context: context.compactJson,
            },
            executeStage: async (stageInput: PipelineStageExecutionInput) => {
              const prompt = await input.buildStagePrompt({
                actionKey: input.actionKey,
                stage: stageInput.stage,
                context: context.bundle,
                payload: stageInput.payload,
                inputs: input.inputs,
              });
              const provider = toRuntimeProvider(stageInput.route.provider);
              const response = await chat({
                provider,
                messages: [{ role: 'user', content: prompt.userPrompt }],
                systemPrompt: prompt.systemPrompt,
                section: input.workflow.split('.')[0],
                openaiModel: provider === 'openai' ? stageInput.route.actualModelId : undefined,
                claudeModel: provider === 'anthropic' ? stageInput.route.actualModelId : undefined,
                maxTokens: stageInput.outputLimit,
                temperature: prompt.temperature,
                telemetry: {
                  generationId: activeGenerationId,
                  workflowRunId: workflowRun.id,
                  workflowStepId: stageInput.workflowStepId,
                  userId: input.userId,
                  projectId: input.projectId,
                  actionKey: input.actionKey,
                  pipeline: input.workflow,
                  stage: stageInput.stage.stage,
                  promptVersion: input.promptVersion,
                  modelAlias: stageInput.route.selectedAlias,
                  modelSnapshot: stageInput.route as unknown as Prisma.InputJsonValue,
                  retryIndex: stageInput.attemptIndex,
                  metadata: {
                    promptCacheKey: context.promptCacheKey,
                    contextCacheHit: context.cacheHit,
                    contextCompressed: context.compressed,
                    routeReason: stageInput.route.reason,
                    fallback: stageInput.route.fallback,
                    downgrade: stageInput.route.downgrade,
                  },
                },
              });
              return { content: response.content, mock: response.mock };
            },
          });
          const lastRoute = pipeline.finalRoute;
          return {
            result: pipeline,
            usage: { inputTokens: 0, outputTokens: 0 },
            provider: lastRoute.provider,
            model: lastRoute.actualModelId,
          };
        },
      });
      generationId = executed.generationId;
      pointsPending = executed.aiPointsPending;
      const validation: { ok: boolean; errors: string[] } = input.validationRules
        ? aiValidationService.validate(executed.result.finalContent, input.validationRules)
        : { ok: true, errors: [] };
      if (!validation.ok) {
        throw Object.assign(
          new Error(`FINAL_VALIDATION_FAILED: ${validation.errors.join('; ')}`),
          { code: 'FINAL_VALIDATION_FAILED', validation },
        );
      }

      const artifact = await prisma.aIArtifact.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          workflowRunId: workflowRun.id,
          workflowStepId: executed.result.stageSteps[executed.result.stageSteps.length - 1] ?? null,
          generationId: executed.generationId,
          workflow: input.workflow,
          step: 'final',
          type: input.artifactType,
          title: input.title ?? input.artifactType,
          content: executed.result.finalContent,
          structured: executed.result.finalStructured as Prisma.InputJsonValue,
          metadata: {
            runtime: 'ai-orchestrator-v2',
            stageArtifacts: executed.result.stageArtifacts,
            stageSteps: executed.result.stageSteps,
            routeDecisions: executed.result.routeDecisions,
            mock: executed.result.mock,
            contextSummaryId: context.summaryId,
            contextSummaryVersion: context.summaryVersion,
            promptCacheKey: context.promptCacheKey,
            validation,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await structuredOutputService.save({
        userId: input.userId,
        projectId: input.projectId,
        artifactId: artifact.id,
        workflow: input.workflow,
        step: 'final',
        type: input.artifactType,
        title: artifact.title,
        content: artifact.content,
        inputs: input.inputs,
        metadata: { runtime: 'ai-orchestrator-v2' },
      });
      await prisma.aIWorkflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: 'SUCCEEDED',
          output: {
            artifactId: artifact.id,
            generationId: executed.generationId,
            finalStage: definition.pipeline[definition.pipeline.length - 1]?.stage,
          } as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      const charged = pointsPending
        ? await aiGenerationService.finalizeDeferredAiPoints({
          generationId: executed.generationId,
          userId: input.userId,
        })
        : {
          aiPointsCharged: executed.aiPointsCharged,
          aiBalanceRemaining: executed.aiBalanceRemaining,
        };
      return {
        workflowRunId: workflowRun.id,
        workflowStepId: executed.result.stageSteps[executed.result.stageSteps.length - 1] ?? '',
        generationId: executed.generationId,
        artifactId: artifact.id,
        content: artifact.content,
        structured: artifact.structured,
        aiPointsCharged: charged.aiPointsCharged,
        aiBalanceRemaining: charged.aiBalanceRemaining,
        mock: executed.result.mock,
        model: executed.result.finalRoute.actualModelId,
        provider: toRuntimeProvider(executed.result.finalRoute.provider),
        validation,
      };
    } catch (error) {
      if (generationId && pointsPending) {
        await aiGenerationService.failDeferredAiPoints({
          generationId,
          userId: input.userId,
          error,
        }).catch(() => undefined);
      }
      await prisma.aIWorkflowRun.update({
        where: { id: workflowRun.id },
        data: {
          status: 'FAILED',
          output: {
            error: error instanceof Error ? error.message : String(error),
          } as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      }).catch(() => undefined);
      throw error;
    }
  },
};
