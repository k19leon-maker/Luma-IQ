import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:5174',
    SEMEYNO_AI_RELAY_SECRET: 'relay-test-secret',
    OPENAI_B2C_PSYCHOLOGY_API_KEY: 'test-openai-key',
    OPENAI_B2C_PSYCHOLOGY_MODEL: 'gpt-test',
  },
}));

import { createApp } from '../src/app';

describe('Semeyno AI relay', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests without the relay secret', async () => {
    const response = await request(createApp())
      .post('/api/v1/internal/semeyno-ai-relay/responses')
      .send({
        model: 'gpt-test',
        input: [{ role: 'user', content: 'test' }],
        max_output_tokens: 16,
      });

    expect(response.status).toBe(401);
  });

  it('proxies an allowed request without persistence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_text: 'ok',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const response = await request(createApp())
      .post('/api/v1/internal/semeyno-ai-relay/responses')
      .set('Authorization', 'Bearer relay-test-secret')
      .send({
        model: 'gpt-test',
        input: [{ role: 'user', content: 'test' }],
        max_output_tokens: 16,
      });

    expect(response.status).toBe(200);
    expect(response.body.output_text).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
