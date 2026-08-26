import { describe, expect, it } from 'vitest';
import {
  getNextTgChannelTab,
  readTgChannelTab,
  writeTgChannelTab,
} from '../../../frontend/src/pages/TgChannel/tgChannelTabs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('TG channel tabs URL contract', () => {
  it('opens description for an empty or unknown tab', () => {
    expect(readTgChannelTab(new URLSearchParams())).toBe('description');
    expect(readTgChannelTab(new URLSearchParams('tab=unknown'))).toBe('description');
  });

  it('opens content plan from its direct URL', () => {
    expect(readTgChannelTab(new URLSearchParams('tab=content-plan'))).toBe('content-plan');
  });

  it('preserves unrelated params when selecting content plan', () => {
    const current = new URLSearchParams('source=sidebar');
    const next = writeTgChannelTab(current, 'content-plan');

    expect(next.get('tab')).toBe('content-plan');
    expect(next.get('source')).toBe('sidebar');
    expect(current.has('tab')).toBe(false);
  });

  it('uses the canonical URL without tab for description', () => {
    const next = writeTgChannelTab(
      new URLSearchParams('tab=content-plan&source=sidebar'),
      'description',
    );

    expect(next.has('tab')).toBe(false);
    expect(next.get('source')).toBe('sidebar');
  });

  it('supports roving keyboard navigation between tabs', () => {
    expect(getNextTgChannelTab('description', 'ArrowRight')).toBe('content-plan');
    expect(getNextTgChannelTab('content-plan', 'ArrowRight')).toBe('description');
    expect(getNextTgChannelTab('description', 'ArrowLeft')).toBe('content-plan');
    expect(getNextTgChannelTab('content-plan', 'Home')).toBe('description');
    expect(getNextTgChannelTab('description', 'End')).toBe('content-plan');
    expect(getNextTgChannelTab('description', 'Enter')).toBeNull();
  });

  it('renders content plan as list/detail without the legacy table', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../frontend/src/pages/TgChannel/TgChannelContentPlanTab.tsx'),
      'utf8',
    );

    expect(source).toContain('planWorkspace');
    expect(source).toContain('К плану');
    expect(source).toContain('Ключевая мысль');
    expect(source).toContain('Текст поста');
    expect(source).not.toContain('<table');
    expect(source).not.toContain('EDIT_ACTIONS');
  });

  it('keeps the content plan keyboard accessible and announces background work', () => {
    const contentSource = readFileSync(
      resolve(process.cwd(), '../frontend/src/pages/TgChannel/TgChannelContentPlanTab.tsx'),
      'utf8',
    );
    const pageSource = readFileSync(
      resolve(process.cwd(), '../frontend/src/pages/TgChannel/TgChannel.tsx'),
      'utf8',
    );

    expect(contentSource).toContain('aria-haspopup="menu"');
    expect(contentSource).toContain('role="alertdialog"');
    expect(contentSource).toContain('aria-live="polite"');
    expect(contentSource).toContain("event.key === 'Escape'");
    expect(contentSource).toContain("event.key === 'Home'");
    expect(contentSource).toContain("event.key === 'End'");
    expect(pageSource).toContain('aria-busy');
    expect(pageSource).toContain('role="alert"');
  });
});
