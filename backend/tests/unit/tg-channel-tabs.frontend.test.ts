import { describe, expect, it } from 'vitest';
import {
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
});
