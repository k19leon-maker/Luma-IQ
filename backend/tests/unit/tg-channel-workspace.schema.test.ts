import { describe, expect, it } from 'vitest';
import {
  adaptLegacyTgChannelWorkspace,
  parseTgChannelWorkspace,
  serializeTgChannelWorkspaceV2,
  tgChannelRollbackEnvelopeV2Schema,
  tgChannelWorkspaceV2CoreSchema,
} from '../../src/schemas/tg-channel-workspace.schema';
import {
  currentTgChannelWorkspaceV2,
  emptyTgChannelWorkspaceV2,
  legacyTgChannelWorkspaceV1,
} from '../fixtures/tg-channel-workspaces';

describe('TG channel workspace compatibility contract', () => {
  it('accepts empty and populated v2 workspaces', () => {
    expect(tgChannelWorkspaceV2CoreSchema.safeParse(emptyTgChannelWorkspaceV2).success).toBe(true);
    expect(tgChannelWorkspaceV2CoreSchema.safeParse(currentTgChannelWorkspaceV2).success).toBe(true);
  });

  it('adapts legacy fields without treating channelFor as channel description', () => {
    const adapted = adaptLegacyTgChannelWorkspace(legacyTgChannelWorkspaceV1);

    expect(adapted.channel).toEqual({
      name: 'Тестовый канал',
      description: '',
    });
    expect(adapted.legacyContext?.channelFor).toBe('Для тестовой аудитории');
    expect(adapted.plan?.items[0]).toMatchObject({
      id: 'tg-1',
      position: 1,
      readerTask: 'Понять, подходит ли эксперт',
      keyMessage: '',
      cta: 'Продолжить чтение',
    });
  });

  it('preserves ready posts, planned dates and legacy context', () => {
    const adapted = adaptLegacyTgChannelWorkspace(legacyTgChannelWorkspaceV1);
    const planned = adapted.plan?.items[1];

    expect(adapted.plan?.items).toHaveLength(2);
    expect(planned).toMatchObject({
      id: 'tg-2',
      status: 'planned',
      plannedDate: '2026-08-28',
      post: {
        title: 'Почему советы не работают',
        content: 'Тестовый готовый пост fixture.',
        cta: 'Записаться на встречу.',
        authorComment: 'Закрывает ключевое сомнение.',
      },
    });
    expect(adapted.legacyContext).toMatchObject({
      conversionPoint: 'консультация',
      aiPromptVersion: 'tg-channel.plan.v1',
      sourceSnapshot: { fixture: true },
    });
  });

  it('does not mutate or truncate a legacy workspace while reading it', () => {
    const manyItems = Array.from({ length: 24 }, (_, index) => ({
      ...legacyTgChannelWorkspaceV1.items[0],
      id: `tg-${index + 1}`,
      number: index + 1,
    }));
    const legacy = { ...legacyTgChannelWorkspaceV1, items: manyItems };
    const before = JSON.stringify(legacy);
    const adapted = parseTgChannelWorkspace(legacy);

    expect(adapted.plan?.items).toHaveLength(24);
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it('serializes v2 as a rollback-readable dual-write envelope', () => {
    const envelope = serializeTgChannelWorkspaceV2(currentTgChannelWorkspaceV2);

    expect(tgChannelRollbackEnvelopeV2Schema.safeParse(envelope).success).toBe(true);
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.items[0]).toMatchObject({
      id: 'tg-1',
      number: 1,
      clientTask: 'Понять подход автора',
      callToAction: 'Сохранить канал',
      post: {
        text: 'Тестовый текст fixture без production-данных.',
      },
    });
    expect(envelope.settings).toMatchObject({
      channelName: 'Практика без мифов',
      channelFor: 'Для специалистов частной практики',
    });
  });

  it('rejects a schemaVersion 2 payload without its rollback mirror', () => {
    expect(() => parseTgChannelWorkspace(currentTgChannelWorkspaceV2)).toThrow();
  });
});
