import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotApiError, telegramBotService } from '../../src/services/telegram-bot.service';

function telegramResponse(result: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify({ ok: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('telegramBotService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns sanitized bot and webhook diagnostics', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(telegramResponse({
        id: 407920985,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: true,
      }))
      .mockResolvedValueOnce(telegramResponse({
        url: 'https://example.com/telegram/webhook',
        has_custom_certificate: false,
        pending_update_count: 2,
        last_error_date: 1_700_000_000,
        last_error_message: 'Bad gateway',
        max_connections: 40,
        allowed_updates: ['message', 'callback_query'],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await telegramBotService.diagnose('123456:abcdefghijklmnopqrstuvwxyz_ABCDE');

    expect(result).toEqual({
      bot: {
        id: 407920985,
        firstName: 'Test Bot',
        username: 'test_bot',
        canJoinGroups: true,
        canReadAllGroupMessages: false,
        supportsInlineQueries: true,
      },
      webhook: {
        configured: true,
        url: 'https://example.com/telegram/webhook',
        host: 'example.com',
        pendingUpdateCount: 2,
        lastErrorAt: '2023-11-14T22:13:20.000Z',
        lastErrorMessage: 'Bad gateway',
        maxConnections: 40,
        allowedUpdates: ['message', 'callback_query'],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a safe invalid-token error without exposing the token', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      ok: false,
      error_code: 401,
      description: 'Unauthorized',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(telegramBotService.diagnose('123456:abcdefghijklmnopqrstuvwxyz_ABCDE'))
      .rejects.toMatchObject<TelegramBotApiError>({
        status: 400,
        code: 'INVALID_TELEGRAM_BOT_TOKEN',
        message: 'Токен Telegram-бота недействителен',
      });
  });
});
