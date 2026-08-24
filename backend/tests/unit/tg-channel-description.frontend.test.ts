import { describe, expect, it } from 'vitest';
import { parseTgChannelDescriptionProposal } from '../../../frontend/src/pages/TgChannel/tgChannelDescriptionAi';

describe('Telegram channel description frontend parser', () => {
  it('parses a fenced workflow response', () => {
    expect(parseTgChannelDescriptionProposal({
      structured: null,
      content: '```json\n{"channelName":"Канал эксперта","channelDescription":"Практические разборы для экспертов."}\n```',
    })).toEqual({
      channelName: 'Канал эксперта',
      channelDescription: 'Практические разборы для экспертов.',
    });
  });

  it('rejects empty and oversized proposals before applying them', () => {
    expect(() => parseTgChannelDescriptionProposal({
      structured: { channelName: '', channelDescription: 'Описание' },
      content: '',
    })).toThrow('некорректное название');
    expect(() => parseTgChannelDescriptionProposal({
      structured: { channelName: 'Название', channelDescription: 'а'.repeat(251) },
      content: '',
    })).toThrow('длиннее 250');
  });
});
