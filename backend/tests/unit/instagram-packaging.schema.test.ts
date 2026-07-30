import { describe, expect, it } from 'vitest';
import {
  INSTAGRAM_PACKAGING_LIMITS,
  instagramCharacterCount,
} from '../../src/config/instagram-packaging';
import { saveInstagramPackagingSchema } from '../../src/schemas/instagram-packaging.schema';

function profile(overrides: Record<string, string> = {}) {
  return {
    username: 'expert.name',
    displayName: 'Имя эксперта',
    category: 'Маркетинг',
    bio: 'Помогаю экспертам собирать маркетинг.',
    callToAction: 'Запишитесь на разбор',
    link: 'https://example.com',
    logicExplanation: 'Шапка объясняет специализацию и ведёт к следующему шагу.',
    ...overrides,
  };
}

function parseProfile(overrides: Record<string, string> = {}) {
  return saveInstagramPackagingSchema.safeParse({
    version: 1,
    profileHeader: profile(overrides),
    highlights: [],
  });
}

function messages(result: ReturnType<typeof parseProfile>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('Instagram packaging limits', () => {
  it('keeps platform limits in one versioned backend config', () => {
    expect(INSTAGRAM_PACKAGING_LIMITS).toMatchObject({
      version: 1,
      verifiedAt: '2026-07-30',
      characterCounting: 'unicode_code_points',
      fields: {
        username: { max: 30 },
        displayName: { max: 64 },
        bio: { max: 150 },
      },
      combined: {
        bioAndCallToAction: { max: 150 },
      },
    });
  });

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect('😀'.length).toBe(2);
    expect(instagramCharacterCount('😀')).toBe(1);
    expect(instagramCharacterCount('Текст 😀')).toBe(7);
  });

  it('accepts exact field limits and rejects the next character', () => {
    expect(parseProfile({
      username: 'a'.repeat(30),
      displayName: 'И'.repeat(64),
      bio: 'Б'.repeat(150),
      callToAction: '',
    }).success).toBe(true);

    const usernameResult = parseProfile({ username: 'a'.repeat(31) });
    expect(usernameResult.success).toBe(false);
    expect(messages(usernameResult)).toContain('Username: не более 30 символов');
  });

  it('requires a display name and bio', () => {
    const result = parseProfile({ displayName: '   ', bio: '' });

    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(expect.arrayContaining([
      'Имя профиля: обязательное поле',
      'Bio: обязательное поле',
    ]));
  });

  it('validates the combined Instagram bio and call-to-action limit', () => {
    expect(parseProfile({
      bio: 'Б'.repeat(100),
      callToAction: 'П'.repeat(49),
    }).success).toBe(true);

    const result = parseProfile({
      bio: 'Б'.repeat(100),
      callToAction: 'П'.repeat(50),
    });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('Bio и призыв к действию: вместе не более 150 символов');
  });

  it('returns readable username and link format errors', () => {
    const usernameResult = parseProfile({ username: 'имя профиля' });
    expect(messages(usernameResult)).toContain(
      'Используйте латинские буквы, цифры, точки и нижние подчёркивания',
    );

    const linkResult = parseProfile({ link: 'example.com' });
    expect(messages(linkResult)).toContain('Ссылка должна начинаться с http:// или https://');
  });

  it('rejects oversized text without truncating the submitted value', () => {
    const oversizedBio = `Начало-${'а'.repeat(151)}-конец`;
    const result = parseProfile({ bio: oversizedBio, callToAction: '' });

    expect(result.success).toBe(false);
    expect(oversizedBio.endsWith('-конец')).toBe(true);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'profileHeader.bio'))
        .toBe(true);
    }
  });
});
