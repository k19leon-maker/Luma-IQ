import { timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';

const relayMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(20_000),
});

const relaySchema = z.object({
  model: z.string().min(1).max(100),
  input: z.array(relayMessageSchema).min(1).max(12),
  max_output_tokens: z.number().int().min(1).max(2_000),
});

function secretsMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export const semeynoAiRelayController = {
  async responses(req: Request, res: Response): Promise<void> {
    const configuredSecret = env.SEMEYNO_AI_RELAY_SECRET;
    const authorization = req.get('authorization') ?? '';
    const suppliedSecret = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';

    if (!configuredSecret || !secretsMatch(suppliedSecret, configuredSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = relaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid relay request' });
      return;
    }

    if (parsed.data.model !== env.OPENAI_B2C_PSYCHOLOGY_MODEL) {
      res.status(400).json({ error: 'Model is not allowed' });
      return;
    }

    if (!env.OPENAI_B2C_PSYCHOLOGY_API_KEY) {
      res.status(503).json({ error: 'B2C OpenAI key is not configured' });
      return;
    }

    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_B2C_PSYCHOLOGY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parsed.data),
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'OpenAI request failed' });
      return;
    }

    res.status(200).json(payload);
  },
};
