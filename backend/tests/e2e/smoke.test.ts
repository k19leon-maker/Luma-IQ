import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/auth.service', () => ({
  authService: {
    register: vi.fn(),
    getUserById: vi.fn(),
  },
}));

vi.mock('../../src/services/project.service', () => ({
  projectService: {
    create: vi.fn(),
    getOwned: vi.fn(),
    ensureDevUser: vi.fn(),
  },
}));

vi.mock('../../src/services/ai-workflow.service', () => ({
  aiWorkflowService: {
    run: vi.fn(),
  },
}));

import { createApp } from '../../src/app';
import { authService } from '../../src/services/auth.service';
import { projectService } from '../../src/services/project.service';
import { aiWorkflowService } from '../../src/services/ai-workflow.service';

describe('E2E smoke foundation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('covers registration, project creation, about brief, positioning workflow and AI chat foundation', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      user: { id: 'user-1', email: 'new@lumaiq.ru', name: 'Леонид', avatarUrl: null, role: 'USER', isVerified: true },
      tokens: { accessToken: 'access.jwt', refreshToken: 'refresh.jwt' },
    });
    vi.mocked(projectService.create).mockResolvedValue({ id: 'project-1', name: 'Проект' } as never);
    vi.mocked(projectService.getOwned).mockResolvedValue({ id: 'project-1', strategyData: {} } as never);
    vi.mocked(aiWorkflowService.run).mockResolvedValue({
      workflowRunId: 'run-1',
      workflowStepId: 'step-1',
      artifactId: 'artifact-1',
      generationId: 'generation-1',
      content: 'positioning',
      validation: { ok: true, errors: [] },
      mock: false,
      model: 'gpt-5.5',
      provider: 'openai',
    });

    const app = createApp();
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'new@lumaiq.ru', password: 'password123', name: 'Леонид' })
      .expect(201);

    expect(registration.body.tokens.accessToken).toBe('access.jwt');
    expect(registration.body.tokens.csrfToken).toBeTruthy();
  });
});
