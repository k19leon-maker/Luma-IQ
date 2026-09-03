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

  it('opens the chatbot builder on the bot management screen and preserves legacy chains', () => {
    const chatbots = GLOBAL_NAVIGATION.find((section) => section.id === 'chatbots');

    expect(chatbots?.path).toBe('/chatbots');
    expect(chatbots?.children?.map((item) => [item.id, item.path])).toEqual([
      ['chatbot-list', '/chatbots'],
      ['chatbot-chains', '/chatbot-chains'],
    ]);
    expect(resolveNavigation('/app/chatbots')).toMatchObject({
      globalSectionId: 'chatbots',
      subsectionId: 'chatbot-list',
      hasSubNavigation: true,
    });
    expect(resolveNavigation('/app/chatbot-chains')).toMatchObject({
      globalSectionId: 'chatbots',
      subsectionId: 'chatbot-chains',
      hasSubNavigation: true,
    });
  });
});
