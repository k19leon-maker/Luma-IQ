import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  telegramBotFindFirst: vi.fn(),
  subscriberFindFirst: vi.fn(),
  subscriberCreate: vi.fn(),
  subscriberUpdateMany: vi.fn(),
  scenarioFindMany: vi.fn(),
  enrollmentFindMany: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  enrollmentCreate: vi.fn(),
  enrollmentUpdateMany: vi.fn(),
  deliveryCreateMany: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  botEventCreateMany: vi.fn(),
  answerCallbackQuery: vi.fn(),
  sendMessage: vi.fn(),
  sendMedia: vi.fn(),
  getAssetForDelivery: vi.fn(),
  isVerificationStartParameter: vi.fn(),
  consumeVerification: vi.fn(),
  decryptToken: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../src/services/telegram-bot.service', () => ({
  telegramBotService: {
    answerCallbackQuery: mocks.answerCallbackQuery,
    sendMessage: mocks.sendMessage,
    sendMedia: mocks.sendMedia,
  },
}));

vi.mock('../../src/services/telegram-bot-asset.service', () => ({
  telegramBotAssetService: { getForDelivery: mocks.getAssetForDelivery },
}));

vi.mock('../../src/services/telegram-secret.service', () => ({
  telegramSecretService: { decrypt: mocks.decryptToken },
}));

vi.mock('../../src/services/telegram-test-recipient.service', () => ({
  telegramTestRecipientService: {
    isVerificationStartParameter: mocks.isVerificationStartParameter,
    consumeVerification: mocks.consumeVerification,
  },
}));

vi.mock('../../src/lib/prisma', () => {
  const tx = {
    botSubscriber: { updateMany: mocks.subscriberUpdateMany },
    botScenarioEnrollment: {
      findFirst: mocks.enrollmentFindFirst,
      create: mocks.enrollmentCreate,
      updateMany: mocks.enrollmentUpdateMany,
    },
    botMessageDelivery: {
      createMany: mocks.deliveryCreateMany,
      updateMany: mocks.deliveryUpdateMany,
    },
    botEvent: { createMany: mocks.botEventCreateMany },
  };
  return {
    prisma: {
      telegramBot: { findFirst: mocks.telegramBotFindFirst },
      botSubscriber: {
        findFirst: mocks.subscriberFindFirst,
        create: mocks.subscriberCreate,
        updateMany: mocks.subscriberUpdateMany,
      },
      botScenario: { findMany: mocks.scenarioFindMany },
      botScenarioEnrollment: {
        findFirst: mocks.enrollmentFindFirst,
        findMany: mocks.enrollmentFindMany,
      },
      botEvent: { createMany: mocks.botEventCreateMany },
      $transaction: mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

import { telegramRuntimeV2Service } from '../../src/services/telegram-runtime-v2.service';

const validDefinition = {
  schemaVersion: '1.0',
  name: 'Welcome',
  timezone: 'Europe/Moscow',
  entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'welcome' }],
  variables: [],
  nodes: [
    { id: 'welcome', type: 'send_message', text: 'Привет, {{first_name}}!', parseMode: 'plain', disableWebPreview: false },
    { id: 'end', type: 'end' },
  ],
  edges: [{ id: 'to_end', fromNodeId: 'welcome', toNodeId: 'end' }],
  goals: [],
  metadata: { locale: 'ru', source: 'manual' },
};

const update = {
  id: 'update-row-a',
  userId: 'user-a',
  botId: 'bot-a',
  telegramUpdateId: '700',
  payload: {
    update_id: 700,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      text: '/start',
      chat: { id: 42, type: 'private' },
      from: { id: 42, first_name: 'Анна', username: 'anna' },
    },
  },
};

describe('telegramRuntimeV2Service ownership isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptToken.mockReturnValue('decrypted-token');
    mocks.answerCallbackQuery.mockResolvedValue(undefined);
    mocks.sendMessage.mockResolvedValue({ messageId: '101' });
    mocks.sendMedia.mockResolvedValue({ messageId: '202' });
    mocks.isVerificationStartParameter.mockImplementation((value: string | null) => Boolean(value?.startsWith('luma_test_')));
    mocks.consumeVerification.mockResolvedValue(false);
    mocks.transaction.mockImplementation(async (callback) => callback({
      botSubscriber: { updateMany: mocks.subscriberUpdateMany },
      botScenarioEnrollment: {
        findFirst: mocks.enrollmentFindFirst,
        create: mocks.enrollmentCreate,
        updateMany: mocks.enrollmentUpdateMany,
      },
      botMessageDelivery: {
        createMany: mocks.deliveryCreateMany,
        updateMany: mocks.deliveryUpdateMany,
      },
      botEvent: { createMany: mocks.botEventCreateMany },
    }));
  });

  it('ignores a queued update when bot ownership no longer matches', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue(null);

    await expect(telegramRuntimeV2Service.processInboundUpdate(update)).resolves.toEqual({ outcome: 'ignored' });

    expect(mocks.telegramBotFindFirst).toHaveBeenCalledWith({
      where: { id: 'bot-a', userId: 'user-a', status: 'ACTIVE', deletedAt: null },
      select: { id: true, encryptedToken: true },
    });
    expect(mocks.subscriberFindFirst).not.toHaveBeenCalled();
  });

  it('creates an owner-scoped subscriber, enrollment and idempotent first delivery', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue(null);
    mocks.subscriberCreate.mockResolvedValue({ id: 'subscriber-a' });
    mocks.scenarioFindMany.mockResolvedValue([{
      id: 'scenario-a',
      publishedVersionId: 'version-a',
      publishedVersion: { id: 'version-a', definition: validDefinition },
    }]);
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    mocks.enrollmentCreate.mockResolvedValue({ id: 'enrollment-a' });
    mocks.deliveryCreateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });

    const result = await telegramRuntimeV2Service.processInboundUpdate(update);

    expect(result).toMatchObject({
      outcome: 'enrolled',
      subscriberId: 'subscriber-a',
      enrollmentId: 'enrollment-a',
    });
    expect(mocks.subscriberCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', telegramUserId: '42' }),
    });
    expect(mocks.scenarioFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', status: 'PUBLISHED' }),
    }));
    expect(mocks.deliveryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        subscriberId: 'subscriber-a',
        enrollmentId: 'enrollment-a',
        idempotencyKey: 'enrollment-a:welcome',
      })],
      skipDuplicates: true,
    });
    expect(mocks.botEventCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        eventType: 'ENROLLMENT_STARTED',
        idempotencyKey: 'enrollment-a:started',
      })],
      skipDuplicates: true,
    });
  });

  it('consumes an owner test deep link before matching published scenarios', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue(null);
    mocks.subscriberCreate.mockResolvedValue({ id: 'subscriber-a' });
    mocks.consumeVerification.mockResolvedValue(true);

    const result = await telegramRuntimeV2Service.processInboundUpdate({
      ...update,
      telegramUpdateId: '704',
      payload: {
        ...update.payload,
        update_id: 704,
        message: { ...update.payload.message, text: '/start luma_test_abcdefghijklmnopqrstuvwxyz123456' },
      },
    });

    expect(result).toEqual({ outcome: 'test_recipient_verified', subscriberId: 'subscriber-a' });
    expect(mocks.consumeVerification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      startParameter: 'luma_test_abcdefghijklmnopqrstuvwxyz123456',
    }));
    expect(mocks.scenarioFindMany).not.toHaveBeenCalled();
  });

  it('never falls through a rejected verification link into a generic start scenario', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue(null);
    mocks.subscriberCreate.mockResolvedValue({ id: 'subscriber-a' });
    mocks.consumeVerification.mockResolvedValue(false);
    mocks.scenarioFindMany.mockResolvedValue([{
      id: 'scenario-generic',
      publishedVersionId: 'version-generic',
      publishedVersion: { id: 'version-generic', definition: validDefinition },
    }]);

    const result = await telegramRuntimeV2Service.processInboundUpdate({
      ...update,
      telegramUpdateId: '7041',
      payload: {
        ...update.payload,
        update_id: 7041,
        message: { ...update.payload.message, text: '/start luma_test_expiredtoken12345678901234567890' },
      },
    });

    expect(result).toEqual({ outcome: 'subscriber_updated', subscriberId: 'subscriber-a' });
    expect(mocks.scenarioFindMany).not.toHaveBeenCalled();
    expect(mocks.enrollmentCreate).not.toHaveBeenCalled();
  });

  it('prefers an exact deep-link scenario over a newer generic start scenario', async () => {
    const deepLinkDefinition = {
      ...validDefinition,
      name: 'Campaign',
      entrypoints: [{ id: 'campaign', type: 'start_parameter', value: 'campaign', targetNodeId: 'welcome' }],
    };
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue(null);
    mocks.subscriberCreate.mockResolvedValue({ id: 'subscriber-a' });
    mocks.scenarioFindMany.mockResolvedValue([
      {
        id: 'scenario-generic',
        publishedVersionId: 'version-generic',
        publishedVersion: { id: 'version-generic', definition: validDefinition },
      },
      {
        id: 'scenario-campaign',
        publishedVersionId: 'version-campaign',
        publishedVersion: { id: 'version-campaign', definition: deepLinkDefinition },
      },
    ]);
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    mocks.enrollmentCreate.mockResolvedValue({ id: 'enrollment-a' });
    mocks.deliveryCreateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });

    await telegramRuntimeV2Service.processInboundUpdate({
      ...update,
      telegramUpdateId: '705',
      payload: {
        ...update.payload,
        update_id: 705,
        message: { ...update.payload.message, text: '/start campaign' },
      },
    });

    expect(mocks.enrollmentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenarioId: 'scenario-campaign',
        scenarioVersionId: 'version-campaign',
        entrypointId: 'campaign',
        source: 'telegram_deep_link',
      }),
    });
  });

  it('schedules a media node using only its private asset reference', async () => {
    const mediaDefinition = {
      ...validDefinition,
      entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'bonus' }],
      nodes: [
        {
          id: 'bonus',
          type: 'send_media',
          mediaType: 'document',
          assetId: 'asset-a',
          caption: 'Бонус для {{first_name}}',
          parseMode: 'plain',
        },
        { id: 'end', type: 'end' },
      ],
      edges: [{ id: 'to_end', fromNodeId: 'bonus', toNodeId: 'end' }],
    };
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue(null);
    mocks.subscriberCreate.mockResolvedValue({ id: 'subscriber-a' });
    mocks.scenarioFindMany.mockResolvedValue([{
      id: 'scenario-a',
      publishedVersionId: 'version-a',
      publishedVersion: { id: 'version-a', definition: mediaDefinition },
    }]);
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    mocks.enrollmentCreate.mockResolvedValue({ id: 'enrollment-a' });
    mocks.deliveryCreateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });

    await telegramRuntimeV2Service.processInboundUpdate(update);

    expect(mocks.deliveryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: 'user-a',
        botId: 'bot-a',
        idempotencyKey: 'enrollment-a:bonus',
        payload: {
          kind: 'send_media',
          chatId: '42',
          mediaType: 'document',
          assetId: 'asset-a',
          caption: 'Бонус для Анна',
          parseMode: 'plain',
          buttons: [],
          nextNodeId: 'end',
          waitsForInteraction: false,
        },
      })],
      skipDuplicates: true,
    });
  });

  it('scopes /stop across subscriber, enrollments and pending deliveries', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.subscriberFindFirst.mockResolvedValue({ id: 'subscriber-a' });
    mocks.subscriberUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 2 });
    mocks.deliveryUpdateMany.mockResolvedValue({ count: 3 });

    const stopUpdate = {
      ...update,
      telegramUpdateId: '701',
      payload: {
        ...update.payload,
        update_id: 701,
        message: { ...update.payload.message, text: '/stop' },
      },
    };
    const result = await telegramRuntimeV2Service.processInboundUpdate(stopUpdate);

    expect(result).toMatchObject({ outcome: 'stopped', subscriberId: 'subscriber-a' });
    expect(mocks.enrollmentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', subscriberId: 'subscriber-a' }),
    }));
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-a', botId: 'bot-a', subscriberId: 'subscriber-a', status: 'PENDING' }),
    }));
  });

  it('does not reactivate a stopped subscriber from an ordinary message', async () => {
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a', encryptedToken: 'ciphertext' });
    mocks.subscriberFindFirst.mockResolvedValue({ id: 'subscriber-a', status: 'STOPPED' });
    mocks.subscriberUpdateMany.mockResolvedValue({ count: 1 });

    const result = await telegramRuntimeV2Service.processInboundUpdate({
      ...update,
      telegramUpdateId: '7011',
      payload: {
        ...update.payload,
        update_id: 7011,
        message: { ...update.payload.message, text: 'бонус' },
      },
    });

    expect(result).toEqual({ outcome: 'subscriber_updated', subscriberId: 'subscriber-a' });
    expect(mocks.subscriberUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ status: 'ACTIVE' }),
    }));
    expect(mocks.scenarioFindMany).not.toHaveBeenCalled();
    expect(mocks.enrollmentFindMany).not.toHaveBeenCalled();
  });

  it('continues a waiting scenario through an owner-scoped callback and acknowledges it', async () => {
    const callbackDefinition = {
      ...validDefinition,
      nodes: [
        {
          id: 'welcome',
          type: 'send_message',
          text: 'Продолжить?',
          parseMode: 'plain',
          disableWebPreview: false,
          buttons: [{ type: 'callback', label: 'Да', callbackData: 'continue:yes' }],
        },
        { id: 'end', type: 'end' },
      ],
      edges: [{
        id: 'to_end',
        fromNodeId: 'welcome',
        toNodeId: 'end',
        condition: { type: 'button_callback', callbackData: 'continue:yes' },
      }],
    };
    const waiting = {
      id: 'enrollment-a',
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      scenarioId: 'scenario-a',
      scenarioVersionId: 'version-a',
      currentNodeId: 'welcome',
      state: { variables: {} },
      subscriber: { telegramChatId: '42' },
      scenarioVersion: { definition: callbackDefinition },
    };
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a', encryptedToken: 'ciphertext' });
    mocks.subscriberFindFirst.mockResolvedValue({ id: 'subscriber-a' });
    mocks.subscriberUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentFindMany.mockResolvedValue([waiting]);
    mocks.enrollmentFindFirst.mockResolvedValue(waiting);
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });

    const result = await telegramRuntimeV2Service.processInboundUpdate({
      ...update,
      telegramUpdateId: '702',
      payload: {
        update_id: 702,
        callback_query: {
          id: 'callback-702',
          from: { id: 42, first_name: 'Анна', username: 'anna' },
          data: 'continue:yes',
          message: {
            message_id: 10,
            date: 1_700_000_010,
            chat: { id: 42, type: 'private' },
          },
        },
      },
    });

    expect(result).toMatchObject({
      outcome: 'interaction_processed',
      subscriberId: 'subscriber-a',
      enrollmentId: 'enrollment-a',
    });
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith({
      token: 'decrypted-token',
      callbackQueryId: 'callback-702',
    });
    expect(mocks.botEventCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        eventType: 'BUTTON_CLICKED',
        sourceId: '702',
      })],
      skipDuplicates: true,
    });
    expect(mocks.enrollmentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'enrollment-a',
        userId: 'user-a',
        botId: 'bot-a',
        subscriberId: 'subscriber-a',
      }),
    }));
  });

  it('stores a validated collect_input answer and schedules the next node', async () => {
    const collectDefinition = {
      ...validDefinition,
      entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'email' }],
      variables: [{ name: 'contact_email', type: 'string', required: false }],
      nodes: [
        {
          id: 'email',
          type: 'collect_input',
          field: 'contact_email',
          inputType: 'email',
          prompt: 'Укажите email',
          required: true,
        },
        { id: 'thanks', type: 'send_message', text: 'Спасибо', parseMode: 'plain', disableWebPreview: false },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { id: 'to_thanks', fromNodeId: 'email', toNodeId: 'thanks' },
        { id: 'to_end', fromNodeId: 'thanks', toNodeId: 'end' },
      ],
    };
    const waiting = {
      id: 'enrollment-a',
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      scenarioId: 'scenario-a',
      scenarioVersionId: 'version-a',
      currentNodeId: 'email',
      state: { variables: {} },
      subscriber: { telegramChatId: '42' },
      scenarioVersion: { definition: collectDefinition },
    };
    mocks.telegramBotFindFirst.mockResolvedValue({ id: 'bot-a', encryptedToken: 'ciphertext' });
    mocks.subscriberFindFirst.mockResolvedValue({ id: 'subscriber-a' });
    mocks.subscriberUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentFindMany.mockResolvedValue([waiting]);
    mocks.enrollmentFindFirst.mockResolvedValue(waiting);
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.deliveryCreateMany.mockResolvedValue({ count: 1 });

    const result = await telegramRuntimeV2Service.processInboundUpdate({
      ...update,
      telegramUpdateId: '703',
      payload: {
        ...update.payload,
        update_id: 703,
        message: { ...update.payload.message, text: 'Owner@Example.com' },
      },
    });

    expect(result).toMatchObject({ outcome: 'interaction_processed', enrollmentId: 'enrollment-a' });
    expect(mocks.deliveryCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        idempotencyKey: 'enrollment-a:thanks',
        payload: expect.objectContaining({ kind: 'send_message', text: 'Спасибо' }),
      })],
      skipDuplicates: true,
    });
    expect(mocks.enrollmentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        state: expect.objectContaining({
          variables: expect.objectContaining({ contact_email: 'owner@example.com' }),
        }),
      }),
    }));
    expect(mocks.botEventCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        eventType: 'INPUT_COLLECTED',
        sourceId: '703',
        metadata: { field: 'contact_email', inputType: 'email' },
      })],
      skipDuplicates: true,
    });
  });

  it('delivers media only from the enrollment owner and project', async () => {
    const mediaDefinition = {
      ...validDefinition,
      entrypoints: [{ id: 'start', type: 'start', targetNodeId: 'bonus' }],
      nodes: [
        {
          id: 'bonus',
          type: 'send_media',
          mediaType: 'document',
          assetId: 'asset-a',
          caption: 'Ваш бонус, {{first_name}}',
          parseMode: 'plain',
        },
        { id: 'end', type: 'end' },
      ],
      edges: [{ id: 'to_end', fromNodeId: 'bonus', toNodeId: 'end' }],
    };
    mocks.enrollmentFindFirst.mockResolvedValue({
      id: 'enrollment-a',
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      scenarioId: 'scenario-a',
      scenarioVersionId: 'version-a',
      state: { variables: { first_name: 'Анна' } },
      subscriber: { telegramChatId: '42' },
      scenario: { projectId: 'project-a' },
      scenarioVersion: { definition: mediaDefinition },
    });
    mocks.telegramBotFindFirst.mockResolvedValue({ encryptedToken: 'ciphertext' });
    mocks.getAssetForDelivery.mockResolvedValue({
      content: Buffer.from('%PDF-test'),
      originalName: 'bonus.pdf',
      mimeType: 'application/pdf',
    });
    mocks.deliveryUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enrollmentUpdateMany.mockResolvedValue({ count: 1 });

    const result = await telegramRuntimeV2Service.processDelivery({
      id: 'delivery-a',
      userId: 'user-a',
      botId: 'bot-a',
      subscriberId: 'subscriber-a',
      enrollmentId: 'enrollment-a',
      nodeId: 'bonus',
      payload: {
        kind: 'send_media',
        chatId: '42',
        mediaType: 'document',
        assetId: 'asset-a',
        caption: 'Ваш бонус, Анна',
        parseMode: 'plain',
        buttons: [],
        nextNodeId: 'end',
        waitsForInteraction: false,
      },
    });

    expect(result).toEqual({ telegramMessageId: '202' });
    expect(mocks.getAssetForDelivery).toHaveBeenCalledWith('user-a', 'project-a', 'asset-a', 'DOCUMENT');
    expect(mocks.sendMedia).toHaveBeenCalledWith(expect.objectContaining({
      token: 'decrypted-token',
      chatId: '42',
      mediaType: 'document',
      fileName: 'bonus.pdf',
    }));
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'delivery-a', userId: 'user-a', botId: 'bot-a' }),
      data: expect.objectContaining({ status: 'SENT', telegramMessageId: '202' }),
    }));
  });
});
