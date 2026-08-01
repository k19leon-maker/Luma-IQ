import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/project-context.service', () => ({
  projectContextService: { build: vi.fn() },
}));

import { instagramProfileReadinessService } from '../../src/services/instagram-profile-readiness.service';
import { projectContextService } from '../../src/services/project-context.service';

const mockedContext = vi.mocked(projectContextService, true);

describe('Instagram profile readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scores only meaningful project context blocks', async () => {
    mockedContext.build.mockResolvedValue({
      blocks: [
        { key: 'expert_profile', content: '- Имя: Анна' },
        { key: 'positioning_summary', content: 'Не заполнено.' },
        { key: 'audience_summary', content: '- Сегмент: предприниматели' },
        { key: 'utp_summary', content: '- УТП: системный маркетинг' },
        { key: 'products_summary', content: 'Не заполнено.' },
      ],
    } as never);

    const result = await instagramProfileReadinessService.get('user-1', 'project-1');

    expect(mockedContext.build).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      workflow: 'instagram.profile',
    }));
    expect(result.score).toBe(65);
    expect(result.sufficient).toBe(true);
    expect(result.items.filter((item) => !item.ready).map((item) => item.key))
      .toEqual(['positioning', 'products']);
  });
});
