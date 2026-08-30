import { describe, expect, it } from 'vitest';
import { GLOBAL_NAVIGATION } from '../../../frontend/src/config/app-navigation';
import { resolveNavigation } from '../../../frontend/src/components/Layout/navigation-resolver';

describe('application navigation structure', () => {
  it('places UTP in Strategy immediately after Cases', () => {
    const strategy = GLOBAL_NAVIGATION.find((section) => section.id === 'strategy');
    const packaging = GLOBAL_NAVIGATION.find((section) => section.id === 'packaging');
    const strategyIds = strategy?.children?.map((item) => item.id) ?? [];

    expect(strategyIds.slice(-2)).toEqual(['cases', 'utp']);
    expect(packaging?.children?.some((item) => item.id === 'utp')).toBe(false);
    expect(packaging?.path).toBe('/strategy/social');
  });

  it('resolves the UTP route to the Strategy sidebar', () => {
    expect(resolveNavigation('/app/strategy/utp')).toMatchObject({
      globalSectionId: 'strategy',
      subsectionId: 'utp',
      hasSubNavigation: true,
    });
  });
});
