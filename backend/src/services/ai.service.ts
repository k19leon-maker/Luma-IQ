import { env } from '../config/env';
import { SYSTEM_PROMPT } from '../config/system-prompt';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'grok';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIRequest {
  provider?: AIProvider;
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  mock: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockDelay(): Promise<void> {
  const ms = 1000 + Math.random() * 1000; // 1–2 sec
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Определяем шаг JTBD-диалога по количеству сообщений от пользователя.
 * 1 — первое сообщение  → сегмент
 * 2 — второе сообщение  → боли
 * 3 — третье сообщение  → JTBD-формула
 * 4+ — дальше           → дефолтный ответ
 */
function jtbdStep(messages: Message[]): 1 | 2 | 3 | 4 {
  const userCount = messages.filter((m) => m.role === 'user').length;
  if (userCount <= 1) return 1;
  if (userCount === 2) return 2;
  if (userCount === 3) return 3;
  return 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock responses
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_OPENAI: Record<1 | 2 | 3 | 4, string> = {
  1: 'Отлично! Давайте определим ваш сегмент ЦА. Опишите вашего идеального клиента: кто он, какая у него ситуация, что его беспокоит прямо сейчас?',
  2: 'Хорошо. Теперь углубимся в боли. Что ваш клиент уже пробовал? Почему это не помогло? Какой результат он хочет получить?',
  3: "На основе ваших данных формирую JTBD-формулу: «Когда я [ситуация] → я хочу [решение] → чтобы [результат]»",
  4: 'Понял. Продолжаем упаковку по JTBD-фреймворку. Что расскажете дальше о вашем клиенте?',
};

const MOCK_ANTHROPIC: Record<1 | 2 | 3 | 4, string> = {
  1: [
    '## Шаг 1 — Сегмент целевой аудитории',
    '',
    'Отлично, начинаем упаковку. Чтобы выстроить чёткое позиционирование, мне нужно понять вашего идеального клиента.',
    '',
    '**Ответьте на три вопроса:**',
    '1. Кто этот человек — возраст, пол, жизненная ситуация?',
    '2. С какой проблемой он сталкивается прямо сейчас?',
    '3. Почему эта проблема для него критична?',
  ].join('\n'),

  2: [
    '## Шаг 2 — Глубинные боли клиента',
    '',
    'Хорошо, сегмент понятен. Теперь разберём боли детально.',
    '',
    '**Мне важно знать:**',
    '- Что клиент уже пробовал для решения этой проблемы?',
    '- Почему предыдущие попытки не дали результата?',
    '- Какой конкретный результат он хочет получить через работу с вами?',
    '',
    'Чем точнее вы ответите — тем сильнее получится офер.',
  ].join('\n'),

  3: [
    '## Шаг 3 — JTBD-формула',
    '',
    'На основе ваших данных составляю Jobs To Be Done:',
    '',
    '> **«Когда я** [ситуация/триггер]',
    '> **я хочу** [желаемое действие/решение]',
    '> **чтобы** [конечный результат/трансформация]»',
    '',
    'Это ядро вашего позиционирования. На следующем шаге сформируем из этого продуктовую линейку.',
  ].join('\n'),

  4: [
    '## Продолжаем упаковку',
    '',
    'Понял вас. Фиксирую информацию и продолжаем работу по JTBD-фреймворку.',
    '',
    'Что ещё важно учесть о вашем клиенте или вашем подходе к работе?',
  ].join('\n'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock providers
// ─────────────────────────────────────────────────────────────────────────────

async function mockOpenAI(messages: Message[]): Promise<AIResponse> {
  await mockDelay();
  const step = jtbdStep(messages);
  return { content: MOCK_OPENAI[step], provider: 'openai', mock: true };
}

async function mockAnthropic(messages: Message[]): Promise<AIResponse> {
  await mockDelay();
  const step = jtbdStep(messages);
  return { content: MOCK_ANTHROPIC[step], provider: 'anthropic', mock: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real providers (подключаются по мере появления ключей)
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenAI(req: AIRequest): Promise<AIResponse> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const systemContent = req.systemPrompt ?? SYSTEM_PROMPT;
  const messages = [
    { role: 'system' as const, content: systemContent },
    ...req.messages.filter((m) => m.role !== 'system'),
  ];

  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages,
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature ?? 0.7,
  });

  return {
    content: completion.choices[0]?.message?.content ?? '',
    provider: 'openai',
    mock: false,
  };
}

async function callAnthropic(req: AIRequest): Promise<AIResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: req.maxTokens ?? 1024,
    system: req.systemPrompt ?? SYSTEM_PROMPT,
    messages: req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });

  const block = response.content[0];
  const content = block.type === 'text' ? block.text : '';

  return { content, provider: 'anthropic', mock: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function chat(req: AIRequest): Promise<AIResponse> {
  const provider = req.provider ?? 'openai';

  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) {
      console.log('[AIService] OPENAI_API_KEY not set — using mock');
      return mockOpenAI(req.messages);
    }
    return callOpenAI(req);
  }

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      console.log('[AIService] ANTHROPIC_API_KEY not set — using mock');
      return mockAnthropic(req.messages);
    }
    return callAnthropic(req);
  }

  // Gemini / Grok — заглушка до появления ключей
  await mockDelay();
  return {
    content: `Mock-ответ от провайдера "${provider}". Ключ не задан в .env.`,
    provider,
    mock: true,
  };
}

/**
 * Проверяет, работает ли сервис в mock-режиме для указанного провайдера.
 */
export function isMock(provider: AIProvider = 'openai'): boolean {
  if (provider === 'openai') return !env.OPENAI_API_KEY;
  if (provider === 'anthropic') return !env.ANTHROPIC_API_KEY;
  if (provider === 'gemini') return !env.GEMINI_API_KEY;
  if (provider === 'grok') return !env.GROK_API_KEY;
  return true;
}
