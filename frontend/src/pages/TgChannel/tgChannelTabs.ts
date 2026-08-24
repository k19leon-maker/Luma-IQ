export type TgChannelTab = 'description' | 'content-plan';

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
