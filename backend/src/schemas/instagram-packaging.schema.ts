import { z } from 'zod';
import {
  INSTAGRAM_PACKAGING_LIMITS,
  instagramCharacterCount,
} from '../config/instagram-packaging';

export const INSTAGRAM_PACKAGING_VERSION = 1 as const;

const storageText = (max: number) => z.string().trim().max(max);

function validateHttpUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function addFieldIssue(
  context: z.RefinementCtx,
  field: keyof typeof INSTAGRAM_PACKAGING_LIMITS.fields,
  message: string,
): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    message,
  });
}

export const instagramProfileHeaderSchema = z.object({
  username: storageText(200).default(''),
  displayName: storageText(300).default(''),
  category: storageText(300).default(''),
  bio: storageText(4000).default(''),
  callToAction: storageText(2000).default(''),
  link: storageText(3000).default(''),
  logicExplanation: storageText(6000).default(''),
}).strict().superRefine((value, context) => {
  for (const [field, rules] of Object.entries(INSTAGRAM_PACKAGING_LIMITS.fields)) {
    const key = field as keyof typeof INSTAGRAM_PACKAGING_LIMITS.fields;
    const text = value[key];
    if (rules.required && !text) {
      addFieldIssue(context, key, `${rules.label}: обязательное поле`);
    }
    if (instagramCharacterCount(text) > rules.max) {
      addFieldIssue(context, key, `${rules.label}: не более ${rules.max} символов`);
    }
  }

  const usernameRules = INSTAGRAM_PACKAGING_LIMITS.fields.username;
  if (value.username && !new RegExp(usernameRules.pattern).test(value.username)) {
    addFieldIssue(context, 'username', usernameRules.patternHint);
  }
  if (!validateHttpUrl(value.link)) {
    addFieldIssue(context, 'link', 'Ссылка должна начинаться с http:// или https://');
  }

  const combined = INSTAGRAM_PACKAGING_LIMITS.combined.bioAndCallToAction;
  const combinedText = [value.bio, value.callToAction].filter(Boolean).join(combined.separator);
  if (instagramCharacterCount(combinedText) > combined.max) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['callToAction'],
      message: `${combined.label}: вместе не более ${combined.max} символов`,
    });
  }
});

export const instagramProfileAiResultSchema = instagramProfileHeaderSchema;

const instagramStoryFormatSchema = z.enum([
  'talking_head',
  'text',
  'screen_recording',
  'b_roll',
  'poll',
  'quiz',
  'question',
  'custom',
]);

export const instagramStorySchema = z.object({
  id: z.string().uuid(),
  title: storageText(300).min(1, 'Название сторис: обязательное поле'),
  role: storageText(300).default(''),
  goal: storageText(2000).default(''),
  format: instagramStoryFormatSchema.default('talking_head'),
  customFormat: storageText(300).default(''),
  frame: storageText(4000).default(''),
  screenText: storageText(4000).default(''),
  speech: storageText(8000).default(''),
  interactive: storageText(2000).default(''),
  callToAction: storageText(2000).default(''),
  transition: storageText(2000).default(''),
  position: z.number().int().min(0),
}).strict().superRefine((value, context) => {
  if (value.format === 'custom' && !value.customFormat) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customFormat'],
      message: 'Укажите собственный формат сторис',
    });
  }
});

export const instagramStoryAiDraftSchema = z.object({
  title: storageText(300).min(1),
  role: storageText(300),
  goal: storageText(2000),
  format: instagramStoryFormatSchema,
  customFormat: storageText(300),
  frame: storageText(4000),
  screenText: storageText(4000),
  speech: storageText(8000),
  interactive: storageText(2000),
  callToAction: storageText(2000),
  transition: storageText(2000),
}).strict().superRefine((value, context) => {
  if (value.format === 'custom' && !value.customFormat) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customFormat'],
      message: 'Укажите собственный формат сторис',
    });
  }
});

export const instagramHighlightAiDraftSchema = z.object({
  title: storageText(300).min(1),
  goal: storageText(2000),
  description: storageText(4000),
  icon: storageText(100),
  stories: z.array(instagramStoryAiDraftSchema).min(3).max(12),
}).strict();

const missingFactsSchema = z.array(storageText(500).min(1)).max(20);

export const instagramHighlightsAiResultSchema = z.object({
  highlights: z.array(instagramHighlightAiDraftSchema).min(5).max(8),
  missingFacts: missingFactsSchema,
}).strict().superRefine((value, context) => {
  const storiesCount = value.highlights.reduce((sum, highlight) => sum + highlight.stories.length, 0);
  if (storiesCount < 25 || storiesCount > 45) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['highlights'],
      message: 'В полном наборе должно быть от 25 до 45 полезных сторис',
    });
  }
});

export const instagramHighlightScenarioAiResultSchema = z.object({
  stories: z.array(instagramStoryAiDraftSchema).min(3).max(12),
  missingFacts: missingFactsSchema,
}).strict();

export const instagramHighlightImproveAiResultSchema = z.object({
  highlight: instagramHighlightAiDraftSchema,
  missingFacts: missingFactsSchema,
}).strict();

export const instagramStoryImproveAiResultSchema = z.object({
  story: instagramStoryAiDraftSchema,
  missingFacts: missingFactsSchema,
}).strict();

export const instagramHighlightSchema = z.object({
  id: z.string().uuid(),
  title: storageText(300).min(1, 'Название Highlight: обязательное поле'),
  goal: storageText(2000).default(''),
  description: storageText(4000).default(''),
  icon: storageText(100).default(''),
  position: z.number().int().min(0),
  stories: z.array(instagramStorySchema).max(100).default([]),
}).strict().superRefine((value, context) => {
  const storyIds = new Set<string>();
  value.stories.forEach((story, index) => {
    if (storyIds.has(story.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stories', index, 'id'],
        message: 'У каждой сторис должен быть уникальный ID',
      });
    }
    storyIds.add(story.id);
  });
});

const instagramPackagingObjectSchema = z.object({
  version: z.literal(INSTAGRAM_PACKAGING_VERSION),
  profileHeader: instagramProfileHeaderSchema,
  highlights: z.array(instagramHighlightSchema).max(100).default([]),
  updatedAt: z.string().datetime(),
  metadata: z.object({
    importedFrom: z.literal('generatedData.social.instagram').optional(),
    legacyInstagramText: storageText(20_000).optional(),
    migratedFromVersion: z.number().int().min(0).optional(),
  }).strict().optional(),
}).strict();

function validateUniqueHighlightIds(
  value: { highlights: Array<{ id: string }> },
  context: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  value.highlights.forEach((highlight, index) => {
    if (ids.has(highlight.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['highlights', index, 'id'],
        message: 'У каждого Highlight должен быть уникальный ID',
      });
    }
    ids.add(highlight.id);
  });
}

export const instagramPackagingSchema = instagramPackagingObjectSchema
  .superRefine(validateUniqueHighlightIds);

export const saveInstagramPackagingSchema = instagramPackagingObjectSchema
  .omit({ updatedAt: true, metadata: true })
  .extend({
    version: z.literal(INSTAGRAM_PACKAGING_VERSION).default(INSTAGRAM_PACKAGING_VERSION),
  })
  .strict()
  .superRefine(validateUniqueHighlightIds);

export type InstagramPackaging = z.infer<typeof instagramPackagingSchema>;
export type SaveInstagramPackagingInput = z.infer<typeof saveInstagramPackagingSchema>;

export function emptyInstagramPackaging(updatedAt = new Date().toISOString()): InstagramPackaging {
  return {
    version: INSTAGRAM_PACKAGING_VERSION,
    profileHeader: {
      username: '',
      displayName: '',
      category: '',
      bio: '',
      callToAction: '',
      link: '',
      logicExplanation: '',
    },
    highlights: [],
    updatedAt,
  };
}
