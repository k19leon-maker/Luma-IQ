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

  it('configures and removes a webhook with Telegram POST methods', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(telegramResponse(true))
      .mockResolvedValueOnce(telegramResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    const token = '123456:abcdefghijklmnopqrstuvwxyz_ABCDE';

    await telegramBotService.setWebhook({
      token,
      url: 'https://api.lumaiq.ru/api/v1/telegram-bots/webhooks/public-key',
      secretToken: 'per-bot-secret',
      allowedUpdates: ['message', 'callback_query'],
      dropPendingUpdates: false,
    });
    await telegramBotService.deleteWebhook({ token, dropPendingUpdates: true });

    expect(fetchMock.mock.calls[0][0]).toContain('/setWebhook');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: 'https://api.lumaiq.ru/api/v1/telegram-bots/webhooks/public-key',
      secret_token: 'per-bot-secret',
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
    expect(fetchMock.mock.calls[1][0]).toContain('/deleteWebhook');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      drop_pending_updates: true,
    });
  });

  it('sends a message with supported formatting and inline buttons', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(telegramResponse({ message_id: 777 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await telegramBotService.sendMessage({
      token: '123456:abcdefghijklmnopqrstuvwxyz_ABCDE',
      chatId: '987654321',
      text: '<b>Бонус</b>',
      parseMode: 'HTML',
      disableWebPreview: true,
      buttons: [
        { type: 'url', label: 'Открыть', url: 'https://lumaiq.ru/bonus' },
        { type: 'callback', label: 'Готово', callbackData: 'bonus:done' },
      ],
    });

    expect(result).toEqual({ messageId: '777' });
    expect(fetchMock.mock.calls[0][0]).toContain('/sendMessage');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      chat_id: '987654321',
      text: '<b>Бонус</b>',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Открыть', url: 'https://lumaiq.ru/bonus' },
          { text: 'Готово', callback_data: 'bonus:done' },
        ]],
      },
    });
  });

  it('preserves Telegram retry_after for rate-limit scheduling', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: 23 },
    }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(telegramBotService.sendMessage({
      token: '123456:abcdefghijklmnopqrstuvwxyz_ABCDE',
      chatId: '987654321',
      text: 'Тест',
    })).rejects.toMatchObject<TelegramBotApiError>({
      status: 429,
      code: 'TELEGRAM_RATE_LIMITED',
      retryAfterSeconds: 23,
    });
  });

  it('classifies a Telegram 403 response as a blocked subscriber', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(telegramBotService.sendMessage({
      token: '123456:abcdefghijklmnopqrstuvwxyz_ABCDE',
      chatId: '987654321',
      text: 'Тест',
    })).rejects.toMatchObject<TelegramBotApiError>({
      status: 403,
      code: 'TELEGRAM_BOT_BLOCKED',
    });
  });
});
