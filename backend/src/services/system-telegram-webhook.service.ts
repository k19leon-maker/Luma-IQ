import { createHash, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export interface SystemTelegramUpdate extends Record<string, unknown> {
  update_id: number;
}

export class SystemTelegramWebhookError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SystemTelegramWebhookError';
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numericId(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

export function systemTelegramUpdateKind(update: SystemTelegramUpdate): string {
  return [
    'message',
    'edited_message',
    'callback_query',
    'my_chat_member',
  ].find((key) => key in update) ?? 'unknown';
}

export function systemTelegramActorId(update: SystemTelegramUpdate): string | null {
  const message = objectValue(update.message);
  const editedMessage = objectValue(update.edited_message);
  const callback = objectValue(update.callback_query);
  const membership = objectValue(update.my_chat_member);
  return numericId(objectValue(message?.from)?.id)
    ?? numericId(objectValue(editedMessage?.from)?.id)
    ?? numericId(objectValue(callback?.from)?.id)
    ?? numericId(objectValue(membership?.chat)?.id);
}

export function allowedSystemTelegramUserIds(raw: string): string[] | null {
  const values = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
  return values.includes('*') ? null : values;
}

function secretMatches(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export const systemTelegramWebhookService = {
  async ingest(input: {
    receivedSecret: string;
    update: SystemTelegramUpdate;
  }): Promise<{ queued: boolean; duplicate: boolean; ignored: boolean; disabled?: boolean }> {
    if (!env.SYSTEM_TELEGRAM_ENABLED) {
      return { queued: false, duplicate: false, ignored: true, disabled: true };
    }
    if (!env.SYSTEM_TELEGRAM_WEBHOOK_SECRET || !env.SYSTEM_TELEGRAM_BOT_TOKEN) {
      throw new SystemTelegramWebhookError(
        503,
        'SYSTEM_TELEGRAM_NOT_CONFIGURED',
        'Системный Telegram-бот не настроен',
      );
    }
    if (!secretMatches(input.receivedSecret, env.SYSTEM_TELEGRAM_WEBHOOK_SECRET)) {
      throw new SystemTelegramWebhookError(
        401,
        'INVALID_SYSTEM_TELEGRAM_WEBHOOK_SECRET',
        'Некорректная авторизация Telegram webhook',
      );
    }

    const actorId = systemTelegramActorId(input.update);
    const allowed = allowedSystemTelegramUserIds(env.SYSTEM_TELEGRAM_ALLOWED_USER_IDS);
    const unrestricted = allowed === null && env.SYSTEM_TELEGRAM_ALLOW_ALL;
    if (!actorId || (!unrestricted && (allowed === null || !allowed.includes(actorId)))) {
      return { queued: false, duplicate: false, ignored: true };
    }

    try {
      await prisma.systemTelegramUpdate.create({
        data: {
          telegramUpdateId: String(input.update.update_id),
          kind: systemTelegramUpdateKind(input.update),
          payload: input.update as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });
      return { queued: true, duplicate: false, ignored: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { queued: false, duplicate: true, ignored: false };
      }
      throw error;
    }
  },
};
