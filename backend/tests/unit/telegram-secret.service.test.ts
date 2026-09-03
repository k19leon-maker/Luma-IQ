import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  redactTelegramSecrets,
  TelegramSecretError,
  TelegramSecretService,
} from '../../src/services/telegram-secret.service';

const token = '123456789:abcdefghijklmnopqrstuvwxyz_ABCDE12345';

describe('TelegramSecretService', () => {
  it('encrypts with AES-GCM without storing plaintext and decrypts the envelope', () => {
    const keyringJson = JSON.stringify({ 1: randomBytes(32).toString('base64') });
    const service = new TelegramSecretService(() => ({ keyringJson, activeKeyVersion: 1 }));

    const first = service.encrypt(token);
    const second = service.encrypt(token);

    expect(first.keyVersion).toBe(1);
    expect(first.ciphertext).not.toContain(token);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(service.decrypt(first.ciphertext)).toBe(token);
    expect(service.decrypt(second.ciphertext)).toBe(token);
  });

  it('keeps old keys readable while rotating to the active version', () => {
    const keys = {
      1: randomBytes(32).toString('base64'),
      2: randomBytes(32).toString('base64'),
    };
    let activeKeyVersion = 1;
    const service = new TelegramSecretService(() => ({
      keyringJson: JSON.stringify(keys),
      activeKeyVersion,
    }));
    const oldEnvelope = service.encrypt(token);

    activeKeyVersion = 2;
    const rotated = service.rotate(oldEnvelope.ciphertext);

    expect(rotated.keyVersion).toBe(2);
    expect(service.decrypt(oldEnvelope.ciphertext)).toBe(token);
    expect(service.decrypt(rotated.ciphertext)).toBe(token);
  });

  it('rejects tampered ciphertext without exposing plaintext', () => {
    const keyringJson = JSON.stringify({ 1: randomBytes(32).toString('base64') });
    const service = new TelegramSecretService(() => ({ keyringJson, activeKeyVersion: 1 }));
    const encrypted = service.encrypt(token);
    const tampered = `${encrypted.ciphertext.slice(0, -2)}aa`;

    expect(() => service.decrypt(tampered)).toThrowError(
      expect.objectContaining<TelegramSecretError>({ code: 'TELEGRAM_TOKEN_DECRYPTION_FAILED' }),
    );
  });

  it('fails closed when no keyring is configured', () => {
    const service = new TelegramSecretService(() => ({ keyringJson: '', activeKeyVersion: 1 }));

    expect(() => service.encrypt(token)).toThrowError(
      expect.objectContaining<TelegramSecretError>({ code: 'TELEGRAM_TOKEN_ENCRYPTION_NOT_CONFIGURED' }),
    );
  });

  it('redacts tokens embedded in URLs and error messages', () => {
    const message = `Request to https://api.telegram.org/bot${token}/getMe failed`;
    const redacted = redactTelegramSecrets(message);

    expect(redacted).not.toContain(token);
    expect(redacted).toContain('[TELEGRAM_TOKEN_REDACTED:…2345]');
  });
});
