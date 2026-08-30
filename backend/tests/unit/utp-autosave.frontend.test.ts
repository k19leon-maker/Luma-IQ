import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UtpWorkspaceState } from '../../../frontend/src/api/projects.api';
import {
  UtpAutosaveCoordinator,
  type UtpSaveStatus,
  type UtpWorkspaceDraft,
} from '../../../frontend/src/pages/UTP/utpAutosave';

function draft(projectId: string, text: string): UtpWorkspaceDraft {
  return { projectId, text, history: [], meta: null, reason: 'manual' };
}

function workspace(projectId: string, text: string, revision: number): UtpWorkspaceState {
  return {
    version: 1,
    projectId,
    text,
    history: [],
    meta: null,
    source: 'generatedData.utp',
    revision,
    savedAt: '2026-08-29T10:00:00.000Z',
  };
}

describe('UtpAutosaveCoordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces keystrokes into one manual save without losing the latest text', async () => {
    const save = vi.fn(async (value: UtpWorkspaceDraft, revision: number) => (
      workspace(value.projectId, value.text, revision + 1)
    ));
    const statuses: UtpSaveStatus[] = [];
    const coordinator = new UtpAutosaveCoordinator({
      delayMs: 700,
      save,
      onStatus: (_projectId, status) => statuses.push(status),
      onSaved: vi.fn(),
    });
    coordinator.activate('project-a');
    coordinator.schedule(draft('project-a', 'П'));
    coordinator.schedule(draft('project-a', 'Полное УТП'));

    await vi.advanceTimersByTimeAsync(699);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-a',
      text: 'Полное УТП',
      reason: 'manual',
    }), 0);
    expect(statuses).toContain('pending');
    expect(statuses.at(-1)).toBe('saved');
  });

  it('keeps a failed snapshot and retries it with the same project revision', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (value: UtpWorkspaceDraft, revision: number) => (
        workspace(value.projectId, value.text, revision + 1)
      ));
    const statuses: UtpSaveStatus[] = [];
    const coordinator = new UtpAutosaveCoordinator({
      save,
      onStatus: (_projectId, status) => statuses.push(status),
      onSaved: vi.fn(),
    });
    coordinator.activate('project-a');
    coordinator.schedule(draft('project-a', 'Сохранить после ошибки'));
    await vi.advanceTimersByTimeAsync(700);

    expect(statuses.at(-1)).toBe('error');
    const result = await coordinator.retry('project-a');

    expect(result?.text).toBe('Сохранить после ошибки');
    expect(save).toHaveBeenNthCalledWith(1, expect.anything(), 0);
    expect(save).toHaveBeenNthCalledWith(2, expect.anything(), 0);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flushes the old project with its own id before saving the newly active project', async () => {
    const save = vi.fn(async (value: UtpWorkspaceDraft, revision: number) => (
      workspace(value.projectId, value.text, revision + 1)
    ));
    const coordinator = new UtpAutosaveCoordinator({
      save,
      onStatus: vi.fn(),
      onSaved: vi.fn(),
    });
    coordinator.activate('project-a');
    coordinator.schedule(draft('project-a', 'Текст проекта A'));
    coordinator.activate('project-b');
    coordinator.schedule(draft('project-b', 'Текст проекта B'));

    await coordinator.flush('project-a');
    await coordinator.flush('project-b');

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.map(([value]) => [value.projectId, value.text])).toEqual([
      ['project-a', 'Текст проекта A'],
      ['project-b', 'Текст проекта B'],
    ]);
  });

  it('serializes a newer snapshot behind an in-flight save and advances the revision', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const save = vi.fn(async (value: UtpWorkspaceDraft, revision: number) => {
      if (value.text === 'Первая версия') await firstPending;
      return workspace(value.projectId, value.text, revision + 1);
    });
    const coordinator = new UtpAutosaveCoordinator({
      save,
      onStatus: vi.fn(),
      onSaved: vi.fn(),
    });
    coordinator.activate('project-a');
    coordinator.schedule(draft('project-a', 'Первая версия'));
    const firstFlush = coordinator.flush('project-a');
    coordinator.schedule(draft('project-a', 'Вторая версия'));
    releaseFirst?.();

    await firstFlush;
    await coordinator.flush('project-a');

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: 'Первая версия' }), 0);
    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'Вторая версия' }), 1);
  });

  it('ignores a draft whose project is not active', () => {
    const save = vi.fn();
    const coordinator = new UtpAutosaveCoordinator({
      save,
      onStatus: vi.fn(),
      onSaved: vi.fn(),
    });
    coordinator.activate('project-b');
    coordinator.schedule(draft('project-a', 'Не должно сохраниться'));

    expect(save).not.toHaveBeenCalled();
  });
});
