import { z } from 'zod';

export const UTP_FOUNDATION_VERSION = 1 as const;

export const utpFoundationOptionSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export const utpFoundationSectionSchema = z.object({
  status: z.enum(['ready', 'missing']),
  value: z.string(),
  source: z.string().trim().min(1).nullable(),
  editPath: z.string().trim().min(1).nullable(),
  missingReason: z.enum(['not_provided', 'ambiguous']).optional(),
  options: z.array(utpFoundationOptionSchema).optional(),
});

export const utpFoundationListItemSchema = z.object({
  value: z.string().trim().min(1),
  source: z.string().trim().min(1),
});

export const utpFoundationListSectionSchema = z.object({
  status: z.enum(['ready', 'missing']),
  values: z.array(utpFoundationListItemSchema),
  editPath: z.string().trim().min(1).nullable(),
  missingReason: z.enum(['not_provided', 'ambiguous']).optional(),
});

export const utpFoundationSchema = z.object({
  version: z.literal(UTP_FOUNDATION_VERSION),
  projectId: z.string().trim().min(1),
  niche: utpFoundationSectionSchema,
  audience: utpFoundationSectionSchema,
  jtbd: utpFoundationSectionSchema,
  pains: utpFoundationListSectionSchema,
  desiredOutcome: utpFoundationSectionSchema,
  product: utpFoundationSectionSchema,
  mechanism: utpFoundationSectionSchema,
  differentiation: utpFoundationSectionSchema,
  proofs: utpFoundationListSectionSchema,
  constraints: utpFoundationListSectionSchema,
});

export type UtpFoundation = z.infer<typeof utpFoundationSchema>;
export type UtpFoundationSection = z.infer<typeof utpFoundationSectionSchema>;
export type UtpFoundationListSection = z.infer<typeof utpFoundationListSectionSchema>;

