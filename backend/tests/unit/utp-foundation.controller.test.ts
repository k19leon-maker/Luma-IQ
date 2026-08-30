import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/utp-foundation.service', () => {
  class UtpFoundationNotFoundError extends Error {}
  return {
    UtpFoundationNotFoundError,
    utpFoundationService: { buildOwned: vi.fn() },
  };
});

import { projectController } from '../../src/controllers/project.controller';
import {
  UtpFoundationNotFoundError,
  utpFoundationService,
} from '../../src/services/utp-foundation.service';

const mockedService = vi.mocked(utpFoundationService, true);

function responseMock() {
  const response = {
    set: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.set.mockReturnValue(response);
  response.status.mockReturnValue(response);
  return response;
}

describe('projectController.getUtpFoundation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the owner-checked foundation with a private no-store policy', async () => {
    const foundation = { version: 1, projectId: 'project-1' };
    mockedService.buildOwned.mockResolvedValue({ foundation, projectName: 'Проект' } as never);
    const req = { userId: 'user-1', params: { id: 'project-1' } };
    const res = responseMock();

    await projectController.getUtpFoundation(req as never, res as never);

    expect(mockedService.buildOwned).toHaveBeenCalledWith('user-1', 'project-1');
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.json).toHaveBeenCalledWith({ foundation });
  });

  it('returns 404 without exposing a project owned by another user', async () => {
    mockedService.buildOwned.mockRejectedValue(new UtpFoundationNotFoundError());
    const req = { userId: 'user-2', params: { id: 'project-1' } };
    const res = responseMock();

    await projectController.getUtpFoundation(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Проект не найден' });
  });
});

