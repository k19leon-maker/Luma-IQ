import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_PREFIX = 'tg1';
const AAD = Buffer.from('lumaiq:telegram-bot-token:v1', 'utf8');
const TOKEN_PATTERN = /\d{5,20}:[A-Za-z0-9_-]{20,}/g;

export class TelegramSecretError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TelegramSecretError';
    this.code = code;
  }
}

export interface EncryptedTelegramSecret {
  ciphertext: string;
  keyVersion: number;
}

interface TelegramSecretConfig {
  keyringJson: string;
  activeKeyVersion: number;
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function redactTelegramSecrets(value: string): string {
  return value.replace(TOKEN_PATTERN, (token) => `[TELEGRAM_TOKEN_REDACTED:…${token.slice(-4)}]`);
}

export function safeTelegramErrorMessage(error: unknown): string {
  return redactTelegramSecrets(error instanceof Error ? error.message : String(error));
}

export function telegramTokenLast4(token: string): string {
  return token.slice(-4);
}

export class TelegramSecretService {
  constructor(private readonly configProvider: () => TelegramSecretConfig) {}

  private readKeyring(): { activeVersion: number; keys: Map<number, Buffer> } {
    const config = this.configProvider();
    if (!config.keyringJson.trim()) {
      throw new TelegramSecretError(
        'Telegram token encryption is not configured',
        'TELEGRAM_TOKEN_ENCRYPTION_NOT_CONFIGURED',
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(config.keyringJson);
    } catch {
      throw new TelegramSecretError(
        'Telegram token encryption keyring is invalid',
        'TELEGRAM_TOKEN_KEYRING_INVALID',
      );
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TelegramSecretError(
        'Telegram token encryption keyring is invalid',
        'TELEGRAM_TOKEN_KEYRING_INVALID',
      );
    }

    const keys = new Map<number, Buffer>();
    for (const [rawVersion, rawKey] of Object.entries(raw)) {
      const version = Number(rawVersion);
      if (!Number.isInteger(version) || version < 1 || typeof rawKey !== 'string') {
        throw new TelegramSecretError(
          'Telegram token encryption keyring is invalid',
          'TELEGRAM_TOKEN_KEYRING_INVALID',
        );
      }
      const key = Buffer.from(rawKey, 'base64');
      if (key.length !== 32) {
        throw new TelegramSecretError(
          'Telegram token encryption keys must contain exactly 32 bytes',
          'TELEGRAM_TOKEN_KEY_INVALID',
        );
      }
      keys.set(version, key);
    }

    if (!keys.has(config.activeKeyVersion)) {
      throw new TelegramSecretError(
        'Active Telegram token encryption key is missing',
        'TELEGRAM_TOKEN_ACTIVE_KEY_MISSING',
      );
    }

    return { activeVersion: config.activeKeyVersion, keys };
  }

  encrypt(secret: string): EncryptedTelegramSecret {
    if (!secret) {
      throw new TelegramSecretError('Telegram token is empty', 'TELEGRAM_TOKEN_EMPTY');
    }
    const { activeVersion, keys } = this.readKeyring();
    const key = keys.get(activeVersion)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(AAD);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: [ENVELOPE_PREFIX, String(activeVersion), encode(iv), encode(authTag), encode(encrypted)].join('.'),
      keyVersion: activeVersion,
    };
  }

  decrypt(envelope: string): string {
    const parts = envelope.split('.');
    if (parts.length !== 5 || parts[0] !== ENVELOPE_PREFIX) {
      throw new TelegramSecretError('Telegram token envelope is invalid', 'TELEGRAM_TOKEN_ENVELOPE_INVALID');
    }

    const version = Number(parts[1]);
    const { keys } = this.readKeyring();
    const key = keys.get(version);
    if (!key) {
      throw new TelegramSecretError('Telegram token encryption key is unavailable', 'TELEGRAM_TOKEN_KEY_UNAVAILABLE');
    }

    try {
      const iv = decode(parts[2]);
      const authTag = decode(parts[3]);
      const encrypted = decode(parts[4]);
      if (iv.length !== 12 || authTag.length !== 16 || encrypted.length === 0) throw new Error('invalid envelope');
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(AAD);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      throw new TelegramSecretError('Telegram token could not be decrypted', 'TELEGRAM_TOKEN_DECRYPTION_FAILED');
    }
  }

  rotate(envelope: string): EncryptedTelegramSecret {
    return this.encrypt(this.decrypt(envelope));
  }
}

export const telegramSecretService = new TelegramSecretService(() => ({
  keyringJson: env.TELEGRAM_TOKEN_ENCRYPTION_KEYS,
  activeKeyVersion: env.TELEGRAM_TOKEN_ACTIVE_KEY_VERSION,
}));
