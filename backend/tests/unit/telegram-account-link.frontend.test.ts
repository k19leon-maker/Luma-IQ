import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../');

describe('Telegram account link frontend contract', () => {
  it('scrubs a link token before authenticated exchange and does not persist it in localStorage', () => {
    const page = readFileSync(resolve(root, 'frontend/src/pages/TelegramLink/TelegramLink.tsx'), 'utf8');
    expect(page).toContain("window.location.hash.slice(1)");
    expect(page).toContain("window.history.replaceState({}, '', '/auth/telegram/link')");
    expect(page.indexOf('window.history.replaceState')).toBeLessThan(page.indexOf('telegramAccountApi.link(token)'));
    expect(page).toContain('sessionStorage.setItem(STORED_LINK_TOKEN, token)');
    expect(page).not.toContain('localStorage');
  });

  it('preserves the link flow through authentication and registers a public route', () => {
    const page = readFileSync(resolve(root, 'frontend/src/pages/TelegramLink/TelegramLink.tsx'), 'utf8');
    const app = readFileSync(resolve(root, 'frontend/src/App.tsx'), 'utf8');
    expect(page).toContain("navigate('/auth?next=%2Fauth%2Ftelegram%2Flink'");
    expect(app).toContain('path="/auth/telegram/link"');
  });
});
