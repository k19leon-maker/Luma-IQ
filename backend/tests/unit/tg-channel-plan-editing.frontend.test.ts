import { describe, expect, it } from 'vitest';
import {
  appendTgPlanItem,
  createManualTgPlanItem,
  deleteTgPlanItem,
  replaceTgPlanItem,
} from '../../../frontend/src/pages/TgChannel/tgChannelPlanEditing';
import { TgChannelResult, TgPlanItem } from '../../../frontend/src/pages/TgChannel/tgChannelWorkspace';

const settings = {
  channelName: 'Канал',
  channelFor: '',
  conversionPoint: '',
  conversionDetails: '',
};

function item(id: string, number: number): TgPlanItem {
  return {
    id,
    number,
    role: `Роль ${number}`,
    clientTask: `Задача ${number}`,
    topic: `Тема ${number}`,
    keyMessage: `Мысль ${number}`,
    callToAction: `CTA ${number}`,
    status: 'idea',
  };
}

function result(): TgChannelResult {
  return {
    title: 'План',
    strategySummary: '',
    items: [item('one', 1), item('two', 2), item('three', 3)],
    settings,
  };
}

describe('TG channel manual plan editing', () => {
  it('keeps an edit when another item becomes selected', () => {
    const source = result();
    const edited = { ...source.items[0]!, keyMessage: 'Обновлённая ключевая мысль' };
    const next = replaceTgPlanItem(source, edited);

    expect(next.items[0]?.keyMessage).toBe('Обновлённая ключевая мысль');
    expect(next.items[1]?.topic).toBe('Тема 2');
    expect(source.items[0]?.keyMessage).toBe('Мысль 1');
  });

  it('adds a stable manual idea after the existing sequence', () => {
    const source = result();
    const created = createManualTgPlanItem(source.items, 'manual-id');
    const next = appendTgPlanItem(source, created);

    expect(created).toMatchObject({ id: 'manual-id', number: 4, status: 'idea' });
    expect(next.items).toHaveLength(4);
  });

  it('deletes the selected item, renumbers the list and selects its neighbour', () => {
    const next = deleteTgPlanItem(result(), 'two');

    expect(next.result.items.map((entry) => [entry.id, entry.number])).toEqual([
      ['one', 1],
      ['three', 2],
    ]);
    expect(next.selectedId).toBe('three');
  });
});
