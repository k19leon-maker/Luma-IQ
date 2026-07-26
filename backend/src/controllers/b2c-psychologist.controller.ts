import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { b2cPsychologistSystemPrompt } from '../prompts/b2c-psychologist.prompt';
import { prisma } from '../lib/prisma';
import { ensureB2CSession, replaceB2CMessages } from '../services/b2c-session.service';

type PsychologyProfile = {
  name?: string | null;
  mainConcern?: string | null;
  specificSituation?: string | null;
  desiredChange?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  mainProblem?: string | null;
  duration?: string | null;
  intensity?: string | null;
  supportGoal?: string | null;
  previousHelp?: string[];
  focusAreas?: string[];
  riskNotes?: string[];
  summary?: string;
};

type ChatMessage = {
  role: 'psychologist' | 'client';
  text: string;
};

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  messages: z.array(z.object({
    role: z.enum(['psychologist', 'client']),
    text: z.string().min(1).max(7000),
  })).default([]),
  profile: z.object({
    name: z.string().nullable().optional(),
    mainConcern: z.string().nullable().optional(),
    specificSituation: z.string().nullable().optional(),
    desiredChange: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    mainProblem: z.string().nullable().optional(),
    duration: z.string().nullable().optional(),
    intensity: z.string().nullable().optional(),
    supportGoal: z.string().nullable().optional(),
    previousHelp: z.array(z.string()).optional(),
    focusAreas: z.array(z.string()).optional(),
    riskNotes: z.array(z.string()).optional(),
    summary: z.string().optional(),
  }),
  messagesUsed: z.number().int().min(1).max(50).optional(),
});

const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const dialogueBuckets = new Map<string, number>();
const ANONYMOUS_MESSAGE_LIMIT = 10;

function getClientIp(req: Request) {
  return (
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.ip ||
    'unknown'
  );
}

function rateLimit(req: Request) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 20;
}

function extractOutputText(data: unknown) {
  if (
    data &&
    typeof data === 'object' &&
    'output_text' in data &&
    typeof (data as { output_text: unknown }).output_text === 'string'
  ) {
    return (data as { output_text: string }).output_text;
  }

  const output = data && typeof data === 'object' && 'output' in data ? (data as { output: unknown }).output : null;
  if (!Array.isArray(output)) return '';

  return output
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || !('content' in item)) return [];
      const content = (item as { content: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.map((part) => {
        if (!part || typeof part !== 'object' || !('text' in part)) return '';
        return String((part as { text: unknown }).text ?? '');
      });
    })
    .join('\n')
    .trim();
}

function profileContext(profile: PsychologyProfile) {
  return JSON.stringify({
    name: profile.name ?? null,
    mainConcern: profile.mainConcern ?? null,
    specificSituation: profile.specificSituation ?? null,
    desiredChange: profile.desiredChange ?? null,
    role: profile.role ?? null,
    mainProblem: profile.mainProblem ?? null,
    duration: profile.duration ?? null,
    intensity: profile.intensity ?? null,
    supportGoal: profile.supportGoal ?? null,
    previousHelp: profile.previousHelp ?? [],
    focusAreas: profile.focusAreas ?? [],
    riskNotes: profile.riskNotes ?? [],
    summary: profile.summary ?? '',
  }, null, 2);
}

function recentMessages(messages: ChatMessage[]) {
  return messages.slice(-8).map((message) => ({
    role: message.role === 'client' ? 'user' : 'assistant',
    content: message.text,
  }));
}

export const b2cPsychologistController = {
  async chat(req: Request, res: Response): Promise<void> {
    if (rateLimit(req)) {
      res.status(429).json({ error: 'Слишком много запросов. Подождите минуту и попробуйте снова.' });
      return;
    }

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const apiKey = env.OPENAI_B2C_PSYCHOLOGY_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'OPENAI_B2C_PSYCHOLOGY_API_KEY is not configured' });
      return;
    }

    const { message, messages, profile, messagesUsed } = parsed.data;
    const session = await ensureB2CSession(req, res);
    const dialogueKey = session.id;
    const usedByRequest = messagesUsed ?? messages.filter((item) => item.role === 'client').length;
    const usedByServer = (dialogueBuckets.get(dialogueKey) ?? 0) + 1;
    dialogueBuckets.set(dialogueKey, Math.max(usedByServer, usedByRequest));

    if (usedByRequest > ANONYMOUS_MESSAGE_LIMIT || usedByServer > ANONYMOUS_MESSAGE_LIMIT + 3) {
      res.status(402).json({
        error: 'Message limit reached',
        nextStep: 'b2c_signup',
      });
      return;
    }

    const model = env.OPENAI_B2C_PSYCHOLOGY_MODEL;
    const shouldOfferSignup = usedByRequest >= ANONYMOUS_MESSAGE_LIMIT;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: `${b2cPsychologistSystemPrompt}\n\nПрофиль пользователя из квиза:\n${profileContext(profile)}\n\nСообщений пользователя в этом анонимном диалоге: ${usedByRequest}/${ANONYMOUS_MESSAGE_LIMIT}.\n${shouldOfferSignup ? 'В этом ответе предложи сохранить историю в кабинете «Семейно».' : ''}`,
          },
          ...recentMessages(messages),
          {
            role: 'user',
            content: message,
          },
        ],
        max_output_tokens: 1400,
      }),
    });

    const data = await response.json() as { error?: { message?: string } };
    if (!response.ok) {
      res.status(response.status).json({
        error: 'OpenAI request failed',
        details: data?.error?.message ?? 'Unknown error',
      });
      return;
    }

    const text = extractOutputText(data);
    const reply = text || 'Я рядом. Можете рассказать чуть подробнее, что сейчас ощущается самым сложным?';
    const updatedProfile = {
      ...profile,
      summary: `${profile.summary ?? ''}\nПоследнее сообщение: ${message.slice(0, 300)}`,
    };
    await prisma.b2CSession.update({
      where: { id: session.id },
      data: {
        email: profile.email ?? undefined,
        phone: profile.phone ?? undefined,
        profile: updatedProfile,
      },
    });
    await replaceB2CMessages(session.id, [
      ...messages,
      { role: 'psychologist', text: reply },
    ]);
    res.json({
      reply,
      updatedProfile,
      shouldOfferSignup,
    });
  },
};
