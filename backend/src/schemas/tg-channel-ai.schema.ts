import { z } from 'zod';

const requiredText = z.string().trim().min(1);

export const tgChannelPlanAiItemSchema = z.object({
  id: z.string().trim().min(1).max(240),
  position: z.number().int().positive(),
  role: requiredText,
  readerTask: requiredText,
  topic: requiredText,
  keyMessage: requiredText,
  cta: z.string().trim(),
  status: z.literal('idea'),
}).strict();

export const tgChannelPlanAiResultSchema = z.object({
  title: requiredText,
  strategySummary: requiredText,
  items: z.array(tgChannelPlanAiItemSchema).min(12).max(15),
}).strict().superRefine((value, context) => {
  const positions = value.items.map((item) => item.position);
  const expected = value.items.map((_, index) => index + 1);
  if (positions.some((position, index) => position !== expected[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'positions must be sequential from 1',
    });
  }
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'item ids must be unique',
    });
  }
});

export const tgChannelIdeaImproveAiResultSchema = z.object({
  role: requiredText,
  readerTask: requiredText,
  topic: requiredText,
  keyMessage: requiredText,
  cta: z.string().trim(),
}).strict();

export const tgChannelPostAiResultSchema = z.object({
  title: requiredText,
  text: requiredText,
  callToAction: z.string().trim(),
  authorComment: z.string().trim(),
  status: z.enum(['draft', 'ready']),
}).strict();

