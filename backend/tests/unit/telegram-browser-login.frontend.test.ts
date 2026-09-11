import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../');

describe('Telegram browser login frontend contract', () => {
  it('scrubs the one-time ticket before exchange and restores the selected project', () => {
    const page = readFileSync(resolve(root, 'frontend/src/pages/TelegramLogin/TelegramLogin.tsx'), 'utf8');
    expect(page).toContain("window.history.replaceState({}, '', '/auth/telegram')");
    expect(page).toContain('window.location.hash.slice(1)');
    expect(page.indexOf('window.history.replaceState')).toBeLessThan(page.indexOf('authApi.telegramSession(token)'));
    expect(page).toContain('lumaiq:last-active-project:');
    expect(page).toContain('setTokens(response.tokens.accessToken, response.tokens.csrfToken)');
    expect(page).not.toContain('localStorage.setItem(\'telegram');
  });

  it('registers a public callback route and excludes its 401 from refresh recursion', () => {
    const app = readFileSync(resolve(root, 'frontend/src/App.tsx'), 'utf8');
    const client = readFileSync(resolve(root, 'frontend/src/api/client.ts'), 'utf8');
    expect(app).toContain('path="/auth/telegram"');
    expect(client).toContain("'/auth/telegram/session'");
  });
});
