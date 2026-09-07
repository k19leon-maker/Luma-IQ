import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../src/services/telegram-bot-asset.service', () => {
  class TelegramBotAssetError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    TELEGRAM_ASSET_MAX_BYTES: 20 * 1024 * 1024,
    TelegramBotAssetError,
    telegramBotAssetService: {
      list: mocks.list,
      upload: mocks.upload,
      download: mocks.download,
      remove: mocks.remove,
    },
  };
});

import { createApp } from '../../src/app';
import { TelegramBotAssetError } from '../../src/services/telegram-bot-asset.service';

const botId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';

function authHeader(userId: string): string {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('Telegram bot asset API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication for private assets', async () => {
    await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/assets`)
      .query({ projectId })
      .expect(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('uploads bytes with server-owned user identity', async () => {
    mocks.upload.mockResolvedValue({ id: assetId, projectId, mediaType: 'image' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/assets`)
      .set('Authorization', authHeader('user-a'))
      .field('projectId', projectId)
      .field('mediaType', 'image')
      .attach('file', png, { filename: 'cover.png', contentType: 'image/png' })
      .expect(201);

    expect(mocks.upload).toHaveBeenCalledWith(
      'user-a',
      botId,
      projectId,
      'IMAGE',
      expect.objectContaining({ originalname: 'cover.png', mimetype: 'image/png', buffer: png }),
    );
  });

  it('does not reveal a guessed asset id from another tenant', async () => {
    mocks.download.mockRejectedValue(new TelegramBotAssetError('Файл не найден', 404, 'TELEGRAM_ASSET_NOT_FOUND'));

    const response = await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/assets/${assetId}`)
      .set('Authorization', authHeader('user-b'))
      .expect(404);

    expect(response.body).toMatchObject({ error: 'TELEGRAM_ASSET_NOT_FOUND' });
    expect(mocks.download).toHaveBeenCalledWith('user-b', botId, assetId);
  });
});
