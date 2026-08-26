import { describe, expect, it } from 'vitest';
import { buildTgContentPlanSourceId } from '../../../frontend/src/pages/TgChannel/tgChannelContentPlan';

describe('TG channel Content Plan source ID', () => {
  it('is stable for the same plan item and different for another item', () => {
    const first = buildTgContentPlanSourceId('plan-1', 'post-1');

    expect(buildTgContentPlanSourceId('plan-1', 'post-1')).toBe(first);
    expect(buildTgContentPlanSourceId('plan-1', 'post-2')).not.toBe(first);
    expect(buildTgContentPlanSourceId('plan-2', 'post-1')).not.toBe(first);
    expect(first).toMatch(/^tg-channel:/);
    expect(first.length).toBeLessThanOrEqual(600);
  });

  it('keeps non-latin IDs deterministic without collapsing them into one source', () => {
    expect(buildTgContentPlanSourceId('План', 'Пост 1'))
      .not.toBe(buildTgContentPlanSourceId('План', 'Пост 2'));
  });
});
