import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beginLinkFlow: vi.fn(),
  resolveLinkedUser: vi.fn(),
  markBlocked: vi.fn(),
  issueBrowserLogin: vi.fn(),
  sendMessage: vi.fn(),
  answerCallbackQuery: vi.fn(),
}));

vi.mock('../../src/config/env', () => ({
  env: {
    FRONTEND_URL: 'https://www.lumaiq.ru',
    NODE_ENV: 'production',
    SYSTEM_TELEGRAM_BOT_TOKEN: 'secret-system-token',
  },
}));
vi.mock('../../src/services/telegram-account.service', () => ({
  telegramAccountService: {
    beginLinkFlow: mocks.beginLinkFlow,
    resolveLinkedUser: mocks.resolveLinkedUser,
    markBlocked: mocks.markBlocked,
  },
}));
vi.mock('../../src/services/telegram-login.service', () => ({
  telegramLoginService: { issueBrowserLogin: mocks.issueBrowserLogin },
}));
vi.mock('../../src/services/telegram-bot.service', () => ({
  telegramBotService: {
    sendMessage: mocks.sendMessage,
    answerCallbackQuery: mocks.answerCallbackQuery,
  },
}));

import { systemTelegramHandlerService } from '../../src/services/system-telegram-handler.service';

const identityMessage = {
  from: { id: 101, username: 'owner', first_name: 'Owner' },
  chat: { id: 101, type: 'private' },
};

describe('system Telegram update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.answerCallbackQuery.mockResolvedValue(undefined);
    mocks.issueBrowserLogin.mockResolvedValue({ token: 'browser-ticket', expiresAt: new Date() });
  });

  it('creates a pending account link for an unlinked /start', async () => {
    mocks.resolveLinkedUser.mockResolvedValue(null);
    mocks.beginLinkFlow.mockResolvedValue({
      state: 'PENDING',
      accountId: 'account-1',
      token: 'link-ticket',
      expiresAt: new Date(),
    });

    await expect(systemTelegramHandlerService.process({
      message: { ...identityMessage, text: '/start payload' },
    })).resolves.toEqual({ outcome: 'LINK_REQUIRED', telegramAccountId: 'account-1' });
    expect(mocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '101',
      buttons: [expect.objectContaining({
        url: 'https://www.lumaiq.ru/auth/telegram/link#token=link-ticket',
      })],
    }));
  });

  it('opens the shared workspace for a linked text, voice and document', async () => {
    mocks.resolveLinkedUser.mockResolvedValue({ telegramAccountId: 'account-1', userId: 'user-1' });

    for (const message of [
      { ...identityMessage, text: 'Идея для поста' },
      { ...identityMessage, voice: { file_id: 'voice-1' } },
      { ...identityMessage, document: { file_id: 'doc-1' } },
    ]) {
      await systemTelegramHandlerService.process({ message });
    }

    expect(mocks.issueBrowserLogin).toHaveBeenCalledTimes(3);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(mocks.sendMessage.mock.calls)).not.toContain('следующим этапом');
  });

  it('processes edited messages and callback queries', async () => {
    mocks.resolveLinkedUser.mockResolvedValue({ telegramAccountId: 'account-1', userId: 'user-1' });
    await systemTelegramHandlerService.process({
      edited_message: { ...identityMessage, text: 'Исправленный текст' },
    });
    await systemTelegramHandlerService.process({
      callback_query: {
        id: 'callback-1',
        from: identityMessage.from,
        message: { chat: identityMessage.chat },
      },
    });

    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({
      callbackQueryId: 'callback-1',
    }));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects group messages and records a block event without customer subscribers', async () => {
    await expect(systemTelegramHandlerService.process({
      message: { ...identityMessage, chat: { id: -1001, type: 'group' }, text: 'group text' },
    })).resolves.toEqual({ outcome: 'NON_PRIVATE_MESSAGE_IGNORED', telegramAccountId: null });

    await systemTelegramHandlerService.process({
      my_chat_member: { chat: { id: 101 }, new_chat_member: { status: 'kicked' } },
    });
    expect(mocks.markBlocked).toHaveBeenCalledWith('101');
  });
});
