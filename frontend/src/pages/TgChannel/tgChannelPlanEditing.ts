import { TgChannelResult, TgPlanItem } from './tgChannelWorkspace';

export function createManualTgPlanItem(items: TgPlanItem[], id: string): TgPlanItem {
  return {
    id,
    number: items.reduce((max, current) => Math.max(max, current.number), 0) + 1,
    role: 'Новая идея',
    clientTask: '',
    topic: '',
    keyMessage: '',
    callToAction: '',
    status: 'idea',
  };
}

export function replaceTgPlanItem(result: TgChannelResult, nextItem: TgPlanItem): TgChannelResult {
  return {
    ...result,
    items: result.items.map((item) => item.id === nextItem.id ? nextItem : item),
  };
}

export function appendTgPlanItem(result: TgChannelResult, item: TgPlanItem): TgChannelResult {
  return { ...result, items: [...result.items, item] };
}

export function deleteTgPlanItem(
  result: TgChannelResult,
  id: string,
): { result: TgChannelResult; selectedId: string | null } {
  const currentIndex = result.items.findIndex((item) => item.id === id);
  const items = result.items
    .filter((item) => item.id !== id)
    .map((item, index) => ({ ...item, number: index + 1 }));
  const selectedId = items[Math.min(Math.max(currentIndex, 0), items.length - 1)]?.id ?? null;
  return { result: { ...result, items }, selectedId };
}
