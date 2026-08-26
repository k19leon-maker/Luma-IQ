export type TgChannelTab = 'description' | 'content-plan';

const TG_CHANNEL_TABS: TgChannelTab[] = ['description', 'content-plan'];

export function getNextTgChannelTab(
  current: TgChannelTab,
  key: string,
): TgChannelTab | null {
  const currentIndex = TG_CHANNEL_TABS.indexOf(current);
  if (key === 'Home') return TG_CHANNEL_TABS[0];
  if (key === 'End') return TG_CHANNEL_TABS[TG_CHANNEL_TABS.length - 1];
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return TG_CHANNEL_TABS[(currentIndex + 1) % TG_CHANNEL_TABS.length];
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return TG_CHANNEL_TABS[(currentIndex - 1 + TG_CHANNEL_TABS.length) % TG_CHANNEL_TABS.length];
  }
  return null;
}

export function readTgChannelTab(searchParams: URLSearchParams): TgChannelTab {
  return searchParams.get('tab') === 'content-plan' ? 'content-plan' : 'description';
}

export function writeTgChannelTab(
  searchParams: URLSearchParams,
  tab: TgChannelTab,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (tab === 'description') next.delete('tab');
  else next.set('tab', tab);
  return next;
}
