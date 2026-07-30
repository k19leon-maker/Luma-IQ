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

export const instagramStorySchema = z.object({
  id: z.string().uuid(),
  title: storageText(300),
  position: z.number().int().min(0),
}).strict();

export const instagramHighlightSchema = z.object({
  id: z.string().uuid(),
  title: storageText(300),
  goal: storageText(2000).default(''),
  description: storageText(4000).default(''),
  icon: storageText(100).default(''),
  position: z.number().int().min(0),
  stories: z.array(instagramStorySchema).max(100).default([]),
}).strict();

export const instagramPackagingSchema = z.object({
  version: z.literal(INSTAGRAM_PACKAGING_VERSION),
  profileHeader: instagramProfileHeaderSchema,
  highlights: z.array(instagramHighlightSchema).max(100).default([]),
  updatedAt: z.string().datetime(),
  metadata: z.object({
    importedFrom: z.literal('generatedData.social.instagram').optional(),
    legacyInstagramText: storageText(20_000).optional(),
  }).strict().optional(),
}).strict();

export const saveInstagramPackagingSchema = instagramPackagingSchema
  .omit({ updatedAt: true, metadata: true })
  .extend({
    version: z.literal(INSTAGRAM_PACKAGING_VERSION).default(INSTAGRAM_PACKAGING_VERSION),
  })
  .strict();

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
