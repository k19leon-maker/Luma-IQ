export const INSTAGRAM_PACKAGING_LIMITS = {
  version: 1,
  verifiedAt: '2026-07-30',
  characterCounting: 'unicode_code_points',
  fields: {
    username: {
      label: 'Username',
      max: 30,
      required: false,
      pattern: '^[A-Za-z0-9._]+$',
      patternHint: 'Используйте латинские буквы, цифры, точки и нижние подчёркивания',
    },
    displayName: {
      label: 'Имя профиля',
      max: 64,
      required: true,
    },
    category: {
      label: 'Категория',
      max: 100,
      required: false,
    },
    bio: {
      label: 'Bio',
      max: 150,
      required: true,
    },
    callToAction: {
      label: 'Призыв к действию',
      max: 150,
      required: false,
    },
    link: {
      label: 'Ссылка',
      max: 2048,
      required: false,
      format: 'http_url',
    },
    logicExplanation: {
      label: 'Логика шапки',
      max: 4000,
      required: false,
    },
  },
  combined: {
    bioAndCallToAction: {
      label: 'Bio и призыв к действию',
      fields: ['bio', 'callToAction'],
      separator: '\n',
      max: 150,
    },
  },
} as const;

export type InstagramPackagingLimits = typeof INSTAGRAM_PACKAGING_LIMITS;

export function instagramCharacterCount(value: string): number {
  return Array.from(value).length;
}

