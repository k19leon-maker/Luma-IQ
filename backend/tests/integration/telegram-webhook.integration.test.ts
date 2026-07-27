import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Telegram webhook', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.NODE_ENV = 'test';
  });

  async function app() {
    const { createApp } = await import('../../src/app');
    return createApp();
  }

  it('rejects a request without the Telegram secret header', async () => {
    const response = await request(await app())
      .post('/api/v1/telegram-bots/webhook')
      .send({ update_id: 1, message: { text: '/start' } });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'INVALID_TELEGRAM_WEBHOOK_SECRET' });
  });

  it('accepts a valid Telegram update', async () => {
    const response = await request(await app())
      .post('/api/v1/telegram-bots/webhook')
      .set('x-telegram-bot-api-secret-token', 'test-webhook-secret')
      .send({ update_id: 2, message: { text: '/start' } });

    expect(response.status).toBe(200);
  });

  it('rejects a malformed update', async () => {
    const response = await request(await app())
      .post('/api/v1/telegram-bots/webhook')
      .set('x-telegram-bot-api-secret-token', 'test-webhook-secret')
      .send({ message: { text: '/start' } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_TELEGRAM_UPDATE' });
  });
});
