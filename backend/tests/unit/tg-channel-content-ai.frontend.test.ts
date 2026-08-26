import { describe, expect, it } from 'vitest';
import {
  applyTgChannelIdeaProposal,
  applyTgChannelPostProposal,
  buildTgChannelGenerationContext,
  parseTgChannelIdeaProposal,
  parseTgChannelPostProposal,
} from '../../../frontend/src/pages/TgChannel/tgChannelContentAi';
import type { TgChannelResult, TgPlanItem } from '../../../frontend/src/pages/TgChannel/tgChannelWorkspace';

const selected: TgPlanItem = {
  id: 'tg-2', number: 2, role: 'Проблема', clientTask: 'Узнать себя', topic: 'Почему советы не работают',
  keyMessage: 'Нужна система', callToAction: 'Посмотреть следующий шаг', status: 'idea',
};

const result: TgChannelResult = {
  title: 'План', strategySummary: 'Цепочка', settings: {
    channelName: 'Канал', channelFor: 'Эксперты', conversionPoint: 'Диагностика', conversionDetails: '',
  },
  items: [
    { ...selected, id: 'tg-1', number: 1, topic: 'Знакомство', post: {
      title: 'Кто я', text: 'Полный текст '.repeat(100), callToAction: '', authorComment: 'Познакомить', status: 'ready',
    }, status: 'ready' },
    selected,
    { ...selected, id: 'tg-3', number: 3, topic: 'Метод' },
    { ...selected, id: 'tg-4', number: 4, topic: 'Кейс' },
  ],
};

describe('Telegram content AI frontend contract', () => {
  it('parses strict idea and post proposals', () => {
    expect(parseTgChannelIdeaProposal(JSON.stringify({
      role: 'Возражение', readerTask: 'Снять сомнение', topic: 'Цена без риска', keyMessage: 'Считать нужно ценность', cta: 'Узнать больше',
    })).topic).toBe('Цена без риска');
    expect(parseTgChannelPostProposal(JSON.stringify({
      title: 'Заголовок', text: 'Текст', callToAction: 'Ответить', authorComment: 'Снимает сомнение', status: 'ready',
    })).status).toBe('ready');
  });

  it('applies an idea proposal without changing identity, position or status', () => {
    const next = applyTgChannelIdeaProposal(selected, {
      role: 'Возражение', readerTask: 'Снять сомнение', topic: 'Новая тема', keyMessage: 'Новая мысль', cta: 'Ответить',
    });
    expect(next).toMatchObject({ id: 'tg-2', number: 2, status: 'idea', topic: 'Новая тема' });
  });

  it('applies a post proposal only when requested and keeps the previous AI version', () => {
    const current = {
      title: 'Текущий заголовок', text: 'Текущий текст', callToAction: 'Старый CTA', authorComment: 'Комментарий', status: 'ready' as const,
    };
    const proposed = {
      title: 'Новый заголовок', text: 'Новый текст', callToAction: 'Новый CTA', authorComment: '', status: 'ready' as const,
    };
    const next = applyTgChannelPostProposal(current, proposed, '2026-08-24T10:00:00.000Z');

    expect(current.text).toBe('Текущий текст');
    expect(next.text).toBe('Новый текст');
    expect(next.previousAiVersion).toEqual({
      title: 'Текущий заголовок',
      text: 'Текущий текст',
      callToAction: 'Старый CTA',
      authorComment: 'Комментарий',
      createdAt: '2026-08-24T10:00:00.000Z',
    });
  });

  it('passes the whole plan compactly and never sends full completed posts', () => {
    const context = buildTgChannelGenerationContext(result, selected);
    expect(JSON.parse(context.planSummary)).toHaveLength(4);
    expect(JSON.parse(context.neighboringIdeas).map((item: { position: number }) => item.position)).toEqual([1, 3, 4]);
    expect(context.completedPostsSummary).toContain('Кто я');
    expect(context.completedPostsSummary.length).toBeLessThan(700);
    expect(context.completedPostsSummary).not.toContain('Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст Полный текст');
  });
});
