import { Prisma } from '@prisma/client';
import type { AIActionDefinition, AIActionStage } from '../config/ai-action-registry';
import { prisma } from '../lib/prisma';
import { modelRouterService, type ModelRouteDecision } from './model-router.service';

function compactValue(value: unknown, depth = 0, maxStringLength = 4_000): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}...[сокращено]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactValue(item, depth + 1, maxStringLength));
  if (typeof value === 'object') {
    if (depth >= 5) return '[вложенные данные сокращены]';
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, nested]) => [key, compactValue(nested, depth + 1, maxStringLength)]),
    );
  }
  return String(value);
}

function compactStructured(
  content: string,
  structured?: Record<string, unknown>,
  maxStringLength = 4_000,
): Record<string, unknown> {
  if (structured) return compactValue(structured, 0, maxStringLength) as Record<string, unknown>;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return compactValue(parsed, 0, maxStringLength) as Record<string, unknown>;
    }
  } catch {
    // Text output is intentionally converted to compact JSON between stages.
  }
  return { summary: compactValue(content, 0, maxStringLength) };
}

export type PipelineStageExecutionInput = {
  stage: AIActionStage;
  route: ModelRouteDecision;
  workflowRunId: string;
  workflowStepId: string;
  generationId: string;
  attemptIndex: number;
  payload: Record<string, unknown>;
  outputLimit: number;
};

export type PipelineStageExecutionResult = {
  content: string;
  structured?: Record<string, unknown>;
  mock?: boolean;
};

export type PipelineRunResult = {
  finalContent: string;
  finalStructured: Record<string, unknown>;
  stageArtifacts: string[];
  stageSteps: string[];
  routeDecisions: ModelRouteDecision[];
  finalRoute: ModelRouteDecision;
  mock: boolean;
};

export const pipelineRunnerService = {
  async run(input: {
    userId: string;
    projectId: string;
    workflowRunId: string;
    generationId: string;
    workflow: string;
    definition: AIActionDefinition;
    initialPayload: Record<string, unknown>;
    executeStage: (stageInput: PipelineStageExecutionInput) => Promise<PipelineStageExecutionResult>;
  }): Promise<PipelineRunResult> {
    let payload = compactValue(input.initialPayload) as Record<string, unknown>;
    let finalContent = '';
    let finalStructured: Record<string, unknown> = {};
    let finalRoute: ModelRouteDecision | null = null;
    let finalMock = false;
    const stageArtifacts: string[] = [];
    const stageSteps: string[] = [];
    const routeDecisions: ModelRouteDecision[] = [];

    for (const stage of input.definition.pipeline) {
      let completed = false;
      let lastError: unknown = null;
      const attemptLimit = Math.max(
        1,
        input.definition.retryPolicy.maxAttempts + input.definition.fallbackPolicy.aliases.length,
      );

      for (let attemptIndex = 0; attemptIndex < attemptLimit; attemptIndex += 1) {
        let route: ModelRouteDecision;
        try {
          route = await modelRouterService.routeForAttempt({
            definition: input.definition,
            stage,
            attemptIndex,
          });
        } catch (error) {
          lastError = error;
          break;
        }
        routeDecisions.push(route);
        const startedAt = Date.now();
        const workflowStep = await prisma.aIWorkflowStep.create({
          data: {
            workflowRunId: input.workflowRunId,
            step: stage.stage,
            retryCount: attemptIndex,
            input: {
              payload,
              route,
              outputLimit: stage.outputLimit ?? input.definition.outputLimit,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        stageSteps.push(workflowStep.id);

        try {
          const result = await input.executeStage({
            stage,
            route,
            workflowRunId: input.workflowRunId,
            workflowStepId: workflowStep.id,
            generationId: input.generationId,
            attemptIndex,
            payload,
            outputLimit: stage.outputLimit ?? input.definition.outputLimit,
          });
          const stageOutputLimit = stage.outputLimit ?? input.definition.outputLimit;
          const handoffCharLimit = Math.min(30_000, Math.max(4_000, stageOutputLimit * 3));
          const structured = compactStructured(result.content, result.structured, handoffCharLimit);
          const artifact = await prisma.aIArtifact.create({
            data: {
              userId: input.userId,
              projectId: input.projectId,
              workflowRunId: input.workflowRunId,
              workflowStepId: workflowStep.id,
              generationId: input.generationId,
              workflow: input.workflow,
              step: stage.stage,
              type: 'pipeline_stage',
              title: `${input.definition.actionKey}: ${stage.stage}`,
              content: JSON.stringify(structured),
              structured: structured as Prisma.InputJsonValue,
              metadata: {
                internal: true,
                route,
                attemptIndex,
              } as unknown as Prisma.InputJsonValue,
            },
          });
          stageArtifacts.push(artifact.id);
          await prisma.aIWorkflowStep.update({
            where: { id: workflowStep.id },
            data: {
              status: 'SUCCEEDED',
              output: {
                artifactId: artifact.id,
                structured,
                route,
              } as unknown as Prisma.InputJsonValue,
              retryCount: attemptIndex,
              latencyMs: Date.now() - startedAt,
              completedAt: new Date(),
            },
          });

          payload = {
            previousStage: stage.stage,
            result: structured,
          };
          finalContent = result.content;
          finalStructured = structured;
          finalRoute = route;
          finalMock = Boolean(result.mock);
          completed = true;
          break;
        } catch (error) {
          lastError = error;
          await prisma.aIWorkflowStep.update({
            where: { id: workflowStep.id },
            data: {
              status: 'FAILED',
              error: error instanceof Error ? error.message : String(error),
              retryCount: attemptIndex,
              latencyMs: Date.now() - startedAt,
              completedAt: new Date(),
              output: { route } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }

      if (!completed) {
        throw Object.assign(
          new Error(lastError instanceof Error ? lastError.message : `PIPELINE_STAGE_FAILED: ${stage.stage}`),
          { code: 'PIPELINE_STAGE_FAILED', stage: stage.stage },
        );
      }
    }

    if (!finalRoute) throw new Error('PIPELINE_FINISHED_WITHOUT_ROUTE');
    return {
      finalContent,
      finalStructured,
      stageArtifacts,
      stageSteps,
      routeDecisions,
      finalRoute,
      mock: finalMock,
    };
  },
};
