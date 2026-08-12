import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runtimeMock, caseServiceMock } = vi.hoisted(() => ({
  runtimeMock: { runWorkflow: vi.fn() },
  caseServiceMock: { assertOwnedProject: vi.fn(), get: vi.fn(), update: vi.fn() },
}));

vi.mock('../../src/services/ai-runtime.service', () => ({ aiRuntimeService: runtimeMock }));
vi.mock('../../src/services/case-study.service', () => ({ caseStudyService: caseServiceMock }));

import { caseStudyAiService } from '../../src/services/case-study-ai.service';

const runtimeResult = {
  workflowRunId: 'run-1', workflowStepId: 'step-1', generationId: 'generation-1', artifactId: 'artifact-1',
  structured: null, aiPointsCharged: 20, aiBalanceRemaining: 980, mock: false,
  model: 'gpt-5.6-luna', provider: 'chatgpt' as const, validation: { ok: true, errors: [] },
};

describe('caseStudyAiService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks project ownership before extraction and returns strict candidates', async () => {
    runtimeMock.runWorkflow.mockResolvedValue({
      ...runtimeResult,
      content: JSON.stringify({ cases: [{
        title: 'Первые заявки', beforeText: 'Было', actionsText: 'Сделали', afterText: 'Стало',
        clientTask: '', clientProblem: '', desiredResult: '', marketingInsight: '',
      }] }),
    });

    const result = await caseStudyAiService.extract({
      userId: 'user-1', projectId: 'project-1',
      sourceText: 'История клиента с достаточным объёмом исходного текста.',
      sourceType: 'document', idempotencyKey: 'extract-key-123',
    });

    expect(caseServiceMock.assertOwnedProject).toHaveBeenCalledWith('user-1', 'project-1');
    expect(runtimeMock.runWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'cases',
      step: 'extract',
      inputs: {
        sourceText: 'История клиента с достаточным объёмом исходного текста.',
        sourceType: 'document',
        transcriptChars: 55,
      },
      idempotencyKey: 'extract-key-123',
    }));
    expect(result.candidates[0].title).toBe('Первые заявки');
    expect(result.aiPointsCharged).toBe(20);
    expect(result.aiBalanceRemaining).toBe(980);
  });

  it('rejects malformed extraction JSON instead of persisting guesses', async () => {
    runtimeMock.runWorkflow.mockResolvedValue({ ...runtimeResult, content: '{broken' });

    await expect(caseStudyAiService.extract({
      userId: 'user-1', projectId: 'project-1',
      sourceText: 'История клиента с достаточным объёмом исходного текста.',
      sourceType: 'document',
    })).rejects.toBeInstanceOf(SyntaxError);
  });

  it('loads an owned case and updates only generated insight fields', async () => {
    caseServiceMock.get.mockResolvedValue({
      id: 'case-1', title: 'Кейс', beforeText: 'Было', actionsText: 'Сделали', afterText: 'Стало',
    });
    runtimeMock.runWorkflow.mockResolvedValue({
      ...runtimeResult,
      aiPointsCharged: 5,
      content: JSON.stringify({
        clientTask: 'Получить заявки', clientProblem: 'Нет системы',
        desiredResult: 'Стабильность', marketingInsight: 'Нужен следующий шаг',
      }),
    });
    caseServiceMock.update.mockResolvedValue({ id: 'case-1', clientTask: 'Получить заявки' });

    const result = await caseStudyAiService.generateInsights({
      userId: 'user-1', projectId: 'project-1', caseId: 'case-1', idempotencyKey: 'insights-key-123',
    });

    expect(caseServiceMock.get).toHaveBeenCalledWith('user-1', 'project-1', 'case-1');
    expect(runtimeMock.runWorkflow).toHaveBeenCalledWith({
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'cases',
      step: 'insights',
      inputs: {
        title: 'Кейс',
        beforeText: 'Было',
        actionsText: 'Сделали',
        afterText: 'Стало',
      },
      idempotencyKey: 'insights-key-123',
    });
    expect(caseServiceMock.update).toHaveBeenCalledWith('user-1', 'project-1', 'case-1', {
      clientTask: 'Получить заявки', clientProblem: 'Нет системы',
      desiredResult: 'Стабильность', marketingInsight: 'Нужен следующий шаг',
    });
    expect(result.aiPointsCharged).toBe(5);
    expect(result.aiBalanceRemaining).toBe(980);
  });
});
