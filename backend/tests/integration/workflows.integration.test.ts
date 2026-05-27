import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

vi.mock('../../src/services/ai-workflow.service', () => ({
  aiWorkflowService: {
    run: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../../src/prompts/registry', () => ({
  promptRegistry: {
    list: vi.fn(() => []),
    get: vi.fn(),
  },
}));

import { createApp } from '../../src/app';
import { aiWorkflowService } from '../../src/services/ai-workflow.service';

const mockedWorkflow = vi.mocked(aiWorkflowService, true);

describe('workflow integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts workflow through workflow API', async () => {
    mockedWorkflow.run.mockResolvedValue({
      workflowRunId: 'run-1',
      workflowStepId: 'step-1',
      artifactId: 'artifact-1',
      generationId: 'generation-1',
      content: 'ok',
      validation: { ok: true, errors: [] },
      mock: false,
      model: 'gpt-5.4',
      provider: 'openai',
    });

    const token = jwt.sign({ sub: 'user-1' }, env.JWT_SECRET);
    const res = await request(createApp())
      .post('/api/v1/ai/workflows/posts.topic.generate/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: '11111111-1111-4111-8111-111111111111', inputs: { goal: 'lead' } })
      .expect(200);

    expect(res.body.artifactId).toBe('artifact-1');
    expect(mockedWorkflow.run).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      workflow: 'posts.topic',
      step: 'generate',
    }));
  });
});
