import { describe, expect, it } from 'vitest';
import { TelegramBotApiError } from '../../src/services/telegram-bot.service';
import { telegramRuntimeWorkerInternals } from '../../src/services/telegram-runtime-worker.service';

describe('Telegram runtime worker retry policy', () => {
  it('retries explicit Telegram rejections but not an ambiguous network outcome', () => {
    expect(telegramRuntimeWorkerInternals.deliveryMayRetry(new TelegramBotApiError('rate', {
      code: 'TELEGRAM_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 20,
    }))).toBe(true);
    expect(telegramRuntimeWorkerInternals.deliveryMayRetry(new TelegramBotApiError('server', {
      code: 'TELEGRAM_API_ERROR',
      status: 502,
    }))).toBe(true);
    expect(telegramRuntimeWorkerInternals.deliveryMayRetry(new TelegramBotApiError('timeout', {
      code: 'TELEGRAM_API_TIMEOUT',
      status: 504,
    }))).toBe(false);
  });

  it('uses bounded exponential backoff with deterministic jitter', () => {
    const first = telegramRuntimeWorkerInternals.retryDelayMs(1, 'job-a');
    const fourth = telegramRuntimeWorkerInternals.retryDelayMs(4, 'job-a');
    const capped = telegramRuntimeWorkerInternals.retryDelayMs(30, 'job-a');

    expect(first).toBeGreaterThanOrEqual(5_000);
    expect(fourth).toBeGreaterThanOrEqual(40_000);
    expect(capped).toBeLessThan(3_601_000);
  });

  it('calculates one coordinated slot for global, bot and chat limits', () => {
    expect(telegramRuntimeWorkerInternals.rateLimitIntervalMs(25)).toBe(40);
    expect(telegramRuntimeWorkerInternals.rateLimitIntervalMs(1)).toBe(1_000);
    expect(telegramRuntimeWorkerInternals.latestRateLimitSlot(
      new Date('2026-09-05T08:00:00.000Z'),
      [
        new Date('2026-09-05T08:00:00.040Z'),
        new Date('2026-09-05T08:00:00.020Z'),
        new Date('2026-09-05T08:00:01.000Z'),
      ],
    ).toISOString()).toBe('2026-09-05T08:00:01.000Z');
  });

  it('uses an explicit bot allowlist and requires * for unrestricted runtime', () => {
    expect(telegramRuntimeWorkerInternals.allowedBotIds('')).toEqual([]);
    expect(telegramRuntimeWorkerInternals.allowedBotIds(' bot-a,bot-b,bot-a ')).toEqual(['bot-a', 'bot-b']);
    expect(telegramRuntimeWorkerInternals.allowedBotIds('bot-a,*')).toBeNull();
  });
});
