import { beforeEach, describe, expect, it, vi } from 'vitest';

const legacyRun = vi.hoisted(() => vi.fn());
const orchestratorRun = vi.hoisted(() => vi.fn());
const flagEnabled = vi.hoisted(() => vi.fn());
const promptGet = vi.hoisted(() => vi.fn());
const promptResolve = vi.hoisted(() => vi.fn());

vi.mock('../../src/config/env', () => ({
  env: {
    AI_ORCHESTRATION_V2_ACTIONS: 'content_post',
    AI_ORCHESTRATION_V2_USERS: '*',
  },
}));
vi.mock('../../src/services/ai-workflow.service', () => ({
  aiWorkflowService: { run: legacyRun },
}));
vi.mock('../../src/services/ai-orchestrator.service', () => ({
  aiOrchestratorService: { run: orchestratorRun },
}));
vi.mock('../../src/services/ai-feature-flags.service', () => ({
  aiFeatureFlagsService: { isEnabled: flagEnabled },
}));
vi.mock('../../src/services/prompt-cms.service', () => ({
  promptCmsService: { resolve: promptResolve },
}));
vi.mock('../../src/prompts/registry', () => ({
  promptRegistry: { get: promptGet },
}));

import { aiRuntimeService } from '../../src/services/ai-runtime.service';

describe('aiRuntimeService', () => {
  const input = {
    userId: 'user-1',
    projectId: 'project-1',
    workflow: 'posts',
    step: 'generate',
    inputs: { topic: 'Test' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    promptGet.mockReturnValue({
      feature: 'post',
      version: 'v1',
      artifactType: 'post',
      step: 'generate',
      systemPrompt: vi.fn(),
      userPromptBuilder: vi.fn(),
      validationRules: { requiredIncludes: ['## Result'] },
    });
    promptResolve.mockResolvedValue({
      systemPrompt: 'SECRET FULL PROJECT HISTORY',
      userPrompt: 'SECRET FULL PROJECT HISTORY',
      temperature: 0.5,
    });
    legacyRun.mockResolvedValue({ runtime: 'legacy' });
    orchestratorRun.mockResolvedValue({ runtime: 'v2' });
  });

  it('keeps legacy runtime when the rollback flag is disabled', async () => {
    flagEnabled.mockResolvedValue(false);
    await expect(aiRuntimeService.runWorkflow(input)).resolves.toEqual({ runtime: 'legacy' });
    expect(legacyRun).toHaveBeenCalledWith(input);
    expect(orchestratorRun).not.toHaveBeenCalled();
  });

  it('uses V2 only for an action present in the server allowlist', async () => {
    flagEnabled.mockResolvedValue(true);
    await expect(aiRuntimeService.runWorkflow(input)).resolves.toEqual({ runtime: 'v2' });
    expect(orchestratorRun).toHaveBeenCalledWith(expect.objectContaining({
      actionKey: 'content_post',
      featureCode: 'post',
    }));
    expect(legacyRun).not.toHaveBeenCalled();
  });

  it('keeps legacy runtime until AI points V2 is enabled too', async () => {
    flagEnabled.mockImplementation(async (key: string) => key === 'AI_ORCHESTRATION_V2');
    await expect(aiRuntimeService.runWorkflow(input)).resolves.toEqual({ runtime: 'legacy' });
    expect(orchestratorRun).not.toHaveBeenCalled();
  });

  it('gives SOL only the structured previous-stage analysis', async () => {
    flagEnabled.mockResolvedValue(true);
    await aiRuntimeService.runWorkflow(input);
    const orchestratorInput = orchestratorRun.mock.calls[0][0];
    const stagePrompt = await orchestratorInput.buildStagePrompt({
      actionKey: 'content_post',
      stage: { stage: 'decision', modelAlias: 'SOL', reasoning: 'medium' },
      context: { base: 'SECRET FULL PROJECT HISTORY' },
      payload: { previousStage: 'analysis', result: { recommendation: 'A' } },
      inputs: input.inputs,
    });

    expect(stagePrompt.systemPrompt).not.toContain('SECRET FULL PROJECT HISTORY');
    expect(stagePrompt.userPrompt).not.toContain('SECRET FULL PROJECT HISTORY');
    expect(stagePrompt.userPrompt).toContain('"recommendation":"A"');
    expect(stagePrompt.userPrompt).toContain('компактный JSON');
  });

  it('does not pass the raw CustDev transcript from LUNA to TERRA', async () => {
    flagEnabled.mockResolvedValue(true);
    promptGet.mockReturnValue({
      feature: 'castdev_analysis',
      version: 'v1',
      artifactType: 'castdev_analysis',
      step: 'analysis',
      systemPrompt: vi.fn(),
      userPromptBuilder: vi.fn(),
      validationRules: { requiredIncludes: ['"customerTasks"'] },
    });
    const castdevInput = {
      ...input,
      workflow: 'castdev',
      step: 'analysis',
      inputs: { transcriptText: 'RAW SECRET TRANSCRIPT' },
    };
    const envModule = await import('../../src/config/env');
    envModule.env.AI_ORCHESTRATION_V2_ACTIONS = 'content_post,castdev_analysis';
    await aiRuntimeService.runWorkflow(castdevInput);
    const orchestratorInput = orchestratorRun.mock.calls[0][0];
    const stagePrompt = await orchestratorInput.buildStagePrompt({
      actionKey: 'castdev_analysis',
      stage: { stage: 'analysis', modelAlias: 'TERRA', reasoning: 'medium' },
      context: {},
      payload: {
        previousStage: 'normalize',
        result: { customerTasks: [{ quote: 'Нужно больше клиентов' }] },
      },
      inputs: castdevInput.inputs,
    });

    expect(stagePrompt.userPrompt).not.toContain('RAW SECRET TRANSCRIPT');
    expect(stagePrompt.userPrompt).toContain('Нужно больше клиентов');
    expect(stagePrompt.userPrompt).toContain('summaryForContext');
  });
});
