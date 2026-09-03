import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(__dirname, '../../../frontend/src');

describe('Telegram bot management frontend', () => {
  it('registers the protected bot management route', () => {
    const appSource = readFileSync(resolve(frontendRoot, 'App.tsx'), 'utf8');

    expect(appSource).toContain("const Chatbots = lazy(() => import('./pages/Chatbots/Chatbots'))");
    expect(appSource).toContain('<Route path="chatbots" element={page(<Chatbots />)} />');
  });

  it('keeps bot tokens masked and requires explicit webhook replacement', () => {
    const pageSource = readFileSync(resolve(frontendRoot, 'pages/Chatbots/Chatbots.tsx'), 'utf8');
    const apiSource = readFileSync(resolve(frontendRoot, 'api/telegram-bots.api.ts'), 'utf8');

    expect(pageSource.match(/type="password"/g)).toHaveLength(2);
    expect(pageSource).not.toContain('localStorage');
    expect(pageSource).toContain("details.code === 'TELEGRAM_WEBHOOK_CONFLICT'");
    expect(pageSource).toContain('replaceExistingWebhook: true');
    expect(pageSource).toContain('Отключить прежний сервис и подключить Luma IQ');
    expect(apiSource).toContain('`/telegram-bots/${botId}/token`');
    expect(apiSource).toContain('replaceExistingWebhook');
    expect(apiSource).not.toContain('console.');
  });
});
