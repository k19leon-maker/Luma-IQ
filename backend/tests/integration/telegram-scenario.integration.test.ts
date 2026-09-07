import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  updateMetadata: vi.fn(),
  updateDraft: vi.fn(),
  createDraftVersion: vi.fn(),
  publish: vi.fn(),
  pause: vi.fn(),
  rollback: vi.fn(),
  archive: vi.fn(),
  testRun: vi.fn(),
  createVerification: vi.fn(),
  recipientStatus: vi.fn(),
}));

vi.mock('../../src/services/telegram-scenario.service', () => {
  class TelegramScenarioError extends Error {
    status: number;
    code: string;

    constructor(message: string, options: { status: number; code: string }) {
      super(message);
      this.status = options.status;
      this.code = options.code;
    }
  }
  return {
    TelegramScenarioError,
    telegramScenarioService: {
      list: mocks.list,
      create: mocks.create,
      get: mocks.get,
      updateMetadata: mocks.updateMetadata,
      updateDraft: mocks.updateDraft,
      createDraftVersion: mocks.createDraftVersion,
      publish: mocks.publish,
      pause: mocks.pause,
      rollback: mocks.rollback,
      archive: mocks.archive,
      testRun: mocks.testRun,
    },
  };
});

vi.mock('../../src/services/telegram-test-recipient.service', () => ({
  TelegramTestRecipientError: class TelegramTestRecipientError extends Error {
    status = 409;
    code = 'TELEGRAM_TEST_RECIPIENT_NOT_VERIFIED';
  },
  telegramTestRecipientService: {
    createVerification: mocks.createVerification,
    status: mocks.recipientStatus,
  },
}));

import { createApp } from '../../src/app';
import { TelegramScenarioError } from '../../src/services/telegram-scenario.service';

const botId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const scenarioId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';

function authHeader(userId: string): string {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

describe('Telegram scenario API isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication and scopes list to the authenticated owner', async () => {
    await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/scenarios?projectId=${projectId}`)
      .expect(401);

    mocks.list.mockResolvedValue([]);
    await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/scenarios?projectId=${projectId}`)
      .set('Authorization', authHeader('user-a'))
      .expect(200, { scenarios: [] });

    expect(mocks.list).toHaveBeenCalledWith('user-a', botId, projectId);
  });

  it('rejects a client-supplied owner when creating a scenario', async () => {
    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/scenarios`)
      .set('Authorization', authHeader('user-a'))
      .send({ projectId, name: 'Воронка', userId: 'user-b' })
      .expect(400);

    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not reveal a scenario guessed across tenants', async () => {
    mocks.get.mockRejectedValue(new TelegramScenarioError('Сценарий не найден', {
      status: 404,
      code: 'TELEGRAM_SCENARIO_NOT_FOUND',
    }));

    const response = await request(createApp())
      .get(`/api/v1/telegram-bots/${botId}/scenarios/${scenarioId}`)
      .set('Authorization', authHeader('user-b'))
      .expect(404);

    expect(response.body).toMatchObject({ error: 'TELEGRAM_SCENARIO_NOT_FOUND' });
    expect(mocks.get).toHaveBeenCalledWith('user-b', botId, scenarioId);
  });

  it('requires explicit confirmation for publish and passes the authenticated owner', async () => {
    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/scenarios/${scenarioId}/publish`)
      .set('Authorization', authHeader('user-a'))
      .send({ expectedDraftVersionId: versionId })
      .expect(400, { error: 'TELEGRAM_SCENARIO_CONFIRMATION_REQUIRED' });
    expect(mocks.publish).not.toHaveBeenCalled();

    mocks.publish.mockResolvedValue({ id: scenarioId, status: 'PUBLISHED' });
    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/scenarios/${scenarioId}/publish`)
      .set('Authorization', authHeader('user-a'))
      .send({ confirmed: true, expectedDraftVersionId: versionId })
      .expect(200);

    expect(mocks.publish).toHaveBeenCalledWith('user-a', botId, scenarioId, {
      confirmed: true,
      expectedDraftVersionId: versionId,
    });
  });

  it('requires confirmation for a test run and never accepts a recipient id from the client', async () => {
    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/scenarios/${scenarioId}/test-runs`)
      .set('Authorization', authHeader('user-a'))
      .send({ confirmed: true, subscriberId: 'attacker-controlled' })
      .expect(400);
    expect(mocks.testRun).not.toHaveBeenCalled();

    mocks.testRun.mockResolvedValue({ enrollmentId: 'run-a' });
    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/scenarios/${scenarioId}/test-runs`)
      .set('Authorization', authHeader('user-a'))
      .send({ confirmed: true, versionId })
      .expect(202);

    expect(mocks.testRun).toHaveBeenCalledWith('user-a', botId, scenarioId, {
      confirmed: true,
      versionId,
    });
  });

  it('creates a test-recipient link only for the authenticated bot owner', async () => {
    const expiresAt = new Date('2026-09-07T12:00:00.000Z');
    mocks.createVerification.mockResolvedValue({
      deepLink: 'https://t.me/lumaiq_dev_bot?start=luma_test_token',
      expiresAt,
    });

    await request(createApp())
      .post(`/api/v1/telegram-bots/${botId}/test-recipient-verifications`)
      .set('Authorization', authHeader('user-a'))
      .expect(201);

    expect(mocks.createVerification).toHaveBeenCalledWith('user-a', botId);
  });
});
