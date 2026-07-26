import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: { aIContextSummary: store },
}));

import { dialogSummaryService } from '../../src/services/dialog-summary.service';

describe('dialogSummaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.findFirst.mockResolvedValue({
      id: 'summary-1',
      version: 1,
      content: 'Пользователь: Старый контекст',
      sourceHash: 'old-hash',
    });
    store.create.mockImplementation(async ({ data }) => ({ id: 'summary-2', ...data }));
  });

  it('creates the next immutable rolling-summary version', async () => {
    const result = await dialogSummaryService.append({
      userId: 'user-1',
      projectId: 'project-1',
      conversationKey: 'main',
      messages: [
        { role: 'user', content: 'Новый вопрос' },
        { role: 'assistant', content: 'Новый ответ' },
      ],
      maxTokens: 500,
    });

    expect(result.cacheHit).toBe(false);
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scope: 'dialog:main',
        version: 2,
        contextVersion: 'dialog-summary-v1',
      }),
    }));
  });
});
