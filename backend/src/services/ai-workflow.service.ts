import { AIProvider as DbAIProvider, Prisma } from '@prisma/client';
import { withGlobalAiBehaviorPrompt } from '../config/system-prompt';
import { prisma } from '../lib/prisma';
import { promptRegistry } from '../prompts/registry';
import { AIProvider, chat } from './ai.service';
import { aiGenerationService } from './ai-generation.service';
import { aiValidationService } from './ai-validation.service';
import { projectContextService } from './project-context.service';

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

function buildRepairPrompt(content: string, errors: string[]): string {
  return `Исправь результат под ожидаемый формат.

Ошибки валидации:
${errors.map((error) => `- ${error}`).join('\n')}

Текущий результат:
${content}

Верни только исправленную финальную версию без комментариев.`;
}

export const aiWorkflowService = {
  async run(input: RunWorkflowInput) {
    const config = promptRegistry.get(input.workflow, input.step);
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: { id: true },
    });
    if (!project) throw new Error('Проект не найден');

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
          },
        },
      });

    if (!workflowRun) throw new Error('Workflow run не найден');

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
    const model = provider === 'anthropic'
      ? input.claudeModel ?? 'claude-haiku-4-5-20251001'
      : input.openaiModel ?? config.model;
    const systemPrompt = withGlobalAiBehaviorPrompt(config.systemPrompt(context));
    const userPrompt = config.userPromptBuilder({ inputs: input.inputs, context });
    const accountingStartedAt = Date.now();
    let generationId: string | null = null;

    try {
      const accounting = await aiGenerationService.startAccounting({
        userId: input.userId,
        projectId: input.projectId,
        workflowRunId: workflowRun.id,
        workflowStepId: workflowStep.id,
        featureCode: config.feature,
        provider: dbProvider,
        model,
        promptVersion: config.version,
        contextVersion: context.contextVersion,
        metadata: {
          workflow: input.workflow,
          step: input.step,
          promptId: config.id,
          contextBlocks: context.blocks.map((block) => block.key),
          contextApproxTokens: context.approxTokens,
        },
      });
      generationId = accounting.generation.id;

      let response = await chat({
        provider,
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        section: workflowGroup(input.workflow),
        openaiModel: provider === 'openai' ? model : undefined,
        claudeModel: provider === 'anthropic' ? model : undefined,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      });

      let validation = aiValidationService.validate(response.content, config.validationRules);
      let retryCount = 0;

      if (!validation.ok) {
        retryCount = 1;
        response = await chat({
          provider,
          messages: [{ role: 'user', content: buildRepairPrompt(response.content, validation.errors) }],
          systemPrompt,
          section: workflowGroup(input.workflow),
          openaiModel: provider === 'openai' ? model : undefined,
          claudeModel: provider === 'anthropic' ? model : undefined,
          maxTokens: config.maxTokens,
          temperature: Math.max(0.2, config.temperature - 0.2),
        });
        validation = aiValidationService.validate(response.content, config.validationRules);
      }

      await aiGenerationService.markSucceeded({
        generationId,
        userId: input.userId,
        projectId: input.projectId,
        featureCode: config.feature,
        provider: toDbProvider(response.provider),
        model: response.model,
        startedAtMs: accountingStartedAt,
        isMock: response.mock,
        usage: response.usage,
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
          metadata: {
            promptId: config.id,
            promptVersion: config.version,
            validation,
            retryCount,
            provider: response.provider,
            model: response.model,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await prisma.aIWorkflowStep.update({
        where: { id: workflowStep.id },
        data: {
          status: validation.ok ? 'SUCCEEDED' : 'SUCCEEDED_WITH_WARNINGS',
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
          status: 'RUNNING',
          output: {
            lastArtifactId: artifact.id,
            lastStep: input.step,
          },
        },
      });

      return {
        workflowRunId: workflowRun.id,
        workflowStepId: workflowStep.id,
        artifactId: artifact.id,
        generationId,
        content: response.content,
        validation,
        mock: response.mock,
        model: response.model,
        provider: response.provider,
      };
    } catch (err) {
      if (generationId) {
        await aiGenerationService.markFailed({
          generationId,
          userId: input.userId,
          projectId: input.projectId,
          featureCode: config.feature,
          provider: dbProvider,
          model,
          startedAtMs: accountingStartedAt,
          error: err,
        }).catch(() => {});
      }

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
};
