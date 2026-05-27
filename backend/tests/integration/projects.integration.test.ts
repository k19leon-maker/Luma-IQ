import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

vi.mock('../../src/services/project.service', () => ({
  projectService: {
    list: vi.fn(),
    create: vi.fn(),
    getOwned: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ensureDevUser: vi.fn(),
  },
}));

vi.mock('../../src/services/event.service', () => ({
  eventService: { track: vi.fn(() => Promise.resolve()) },
}));

import { createApp } from '../../src/app';
import { projectService } from '../../src/services/project.service';

const mockedProjects = vi.mocked(projectService, true);

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('projects integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates project for authenticated user', async () => {
    mockedProjects.create.mockResolvedValue({ id: 'project-1', name: 'IT-школа', userId: 'user-1' } as never);

    const res = await request(createApp())
      .post('/api/v1/projects')
      .set('Authorization', authHeader())
      .send({ name: 'IT-школа' })
      .expect(201);

    expect(res.body.project.id).toBe('project-1');
    expect(mockedProjects.create).toHaveBeenCalledWith('user-1', { name: 'IT-школа' });
  });
});
