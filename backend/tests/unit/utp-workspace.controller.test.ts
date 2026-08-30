import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/utp-workspace.service', () => {
  class UtpWorkspaceNotFoundError extends Error {}
  class UtpWorkspaceConflictError extends Error {}
  return {
    UtpWorkspaceNotFoundError,
    UtpWorkspaceConflictError,
    utpWorkspaceService: { getOwned: vi.fn(), saveOwned: vi.fn() },
  };
});

vi.mock('../../src/services/event.service', () => ({
  eventService: { track: vi.fn().mockResolvedValue(undefined) },
}));

import { projectController } from '../../src/controllers/project.controller';
import {
  UtpWorkspaceConflictError,
  UtpWorkspaceNotFoundError,
  utpWorkspaceService,
} from '../../src/services/utp-workspace.service';

const mockedService = vi.mocked(utpWorkspaceService, true);

function responseMock() {
  const response = { set: vi.fn(), status: vi.fn(), json: vi.fn() };
  response.set.mockReturnValue(response);
  response.status.mockReturnValue(response);
  return response;
}

const workspace = {
  version: 1,
  projectId: 'project-1',
  text: 'УТП',
  history: [],
  meta: null,
  source: 'generatedData.utp',
  revision: 2,
  savedAt: '2026-08-29T10:00:00.000Z',
};

describe('UTP workspace controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only the authenticated user workspace with no-store caching', async () => {
    mockedService.getOwned.mockResolvedValue(workspace as never);
    const req = { userId: 'user-1', params: { id: 'project-1' } };
    const res = responseMock();

    await projectController.getUtpWorkspace(req as never, res as never);

    expect(mockedService.getOwned).toHaveBeenCalledWith('user-1', 'project-1');
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.json).toHaveBeenCalledWith({ workspace });
  });

  it('rejects an invalid or oversized autosave before touching persistence', async () => {
    const req = {
      userId: 'user-1',
      params: { id: 'project-1' },
      body: { text: 'x'.repeat(10_001), history: [], meta: null, expectedRevision: 0, reason: 'manual' },
    };
    const res = responseMock();

    await projectController.saveUtpWorkspace(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedService.saveOwned).not.toHaveBeenCalled();
  });

  it('passes manual save data to the owner-checked service', async () => {
    mockedService.saveOwned.mockResolvedValue(workspace as never);
    const body = { text: 'УТП', history: [], meta: null, expectedRevision: 1, reason: 'manual' };
    const req = { userId: 'user-1', params: { id: 'project-1' }, body };
    const res = responseMock();

    await projectController.saveUtpWorkspace(req as never, res as never);

    expect(mockedService.saveOwned).toHaveBeenCalledWith('user-1', 'project-1', body);
    expect(res.json).toHaveBeenCalledWith({ workspace });
  });

  it('returns 404 for a foreign project and 409 for a stale revision', async () => {
    const body = { text: 'УТП', history: [], meta: null, expectedRevision: 1, reason: 'manual' };
    const req = { userId: 'user-2', params: { id: 'project-1' }, body };

    mockedService.saveOwned.mockRejectedValueOnce(new UtpWorkspaceNotFoundError());
    const notFound = responseMock();
    await projectController.saveUtpWorkspace(req as never, notFound as never);
    expect(notFound.status).toHaveBeenCalledWith(404);

    mockedService.saveOwned.mockRejectedValueOnce(new UtpWorkspaceConflictError());
    const conflict = responseMock();
    await projectController.saveUtpWorkspace(req as never, conflict as never);
    expect(conflict.status).toHaveBeenCalledWith(409);
    expect(conflict.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'UTP_WORKSPACE_CONFLICT' }));
  });
});
