import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  botFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
  assetCreate: vi.fn(),
  assetFindMany: vi.fn(),
  assetFindFirst: vi.fn(),
  assetUpdateMany: vi.fn(),
  versionFindMany: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    telegramBot: { findFirst: mocks.botFindFirst },
    project: { findFirst: mocks.projectFindFirst },
    botAsset: {
      create: mocks.assetCreate,
      findMany: mocks.assetFindMany,
      findFirst: mocks.assetFindFirst,
      updateMany: mocks.assetUpdateMany,
    },
    botScenarioVersion: { findMany: mocks.versionFindMany },
  },
}));

import {
  TelegramBotAssetError,
  telegramBotAssetInternals,
  telegramBotAssetService,
} from '../../src/services/telegram-bot-asset.service';

describe('telegramBotAssetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.botFindFirst.mockResolvedValue({ id: 'bot-a' });
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-a' });
  });

  it('rejects an image whose bytes do not match its extension', () => {
    expect(() => telegramBotAssetInternals.validateUpload({
      mediaType: 'IMAGE',
      originalName: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not-a-png'),
    })).toThrowError(expect.objectContaining<TelegramBotAssetError>({
      code: 'TELEGRAM_ASSET_SIGNATURE_MISMATCH',
    }));
  });

  it('does not list assets when the bot belongs to another owner', async () => {
    mocks.botFindFirst.mockResolvedValue(null);

    await expect(telegramBotAssetService.list('user-a', 'bot-b', 'project-a'))
      .rejects.toMatchObject({ code: 'TELEGRAM_BOT_NOT_FOUND' });

    expect(mocks.botFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'bot-b', userId: 'user-a', deletedAt: null },
    }));
    expect(mocks.assetFindMany).not.toHaveBeenCalled();
  });

  it('loads a delivery asset with owner, project and media type in one query', async () => {
    const content = Buffer.from('%PDF-test');
    const crypto = await import('crypto');
    mocks.assetFindFirst.mockResolvedValue({
      id: 'asset-a',
      projectId: 'project-a',
      originalName: 'bonus.pdf',
      mediaType: 'DOCUMENT',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(telegramBotAssetService.getForDelivery('user-a', 'project-a', 'asset-a', 'DOCUMENT'))
      .resolves.toMatchObject({ originalName: 'bonus.pdf', content });
    expect(mocks.assetFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'asset-a',
        userId: 'user-a',
        projectId: 'project-a',
        mediaType: 'DOCUMENT',
        deletedAt: null,
      },
    }));
  });

  it('blocks deletion while any scenario version references the asset', async () => {
    mocks.assetFindFirst.mockResolvedValue({ id: 'asset-a', projectId: 'project-a' });
    mocks.versionFindMany.mockResolvedValue([{
      definition: { nodes: [{ id: 'media', type: 'send_media', assetId: 'asset-a' }] },
    }]);

    await expect(telegramBotAssetService.remove('user-a', 'bot-a', 'asset-a'))
      .rejects.toMatchObject({ code: 'TELEGRAM_ASSET_IN_USE' });
    expect(mocks.assetUpdateMany).not.toHaveBeenCalled();
  });
});
