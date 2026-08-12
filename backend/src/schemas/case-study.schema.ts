import { z } from 'zod';

export const CASE_STUDY_STATUSES = ['draft', 'ready'] as const;
export const CASE_STUDY_SOURCE_TYPES = ['manual', 'voice', 'screenshot', 'document'] as const;

const titleSchema = z.string().trim().min(1, 'Укажите название кейса').max(240, 'Название не должно превышать 240 символов');
const coreTextSchema = z.string().max(20_000, 'Текст не должен превышать 20 000 символов');
const insightTextSchema = z.string().max(8_000, 'Текст тезиса не должен превышать 8 000 символов').nullable();

export const caseProjectParamsSchema = z.object({
  projectId: z.string().uuid('Некорректный ID проекта'),
}).strict();

export const caseParamsSchema = caseProjectParamsSchema.extend({
  caseId: z.string().uuid('Некорректный ID кейса'),
}).strict();

export const caseListQuerySchema = z.object({
  status: z.enum(CASE_STUDY_STATUSES).optional(),
}).strict();

export const createCaseStudySchema = z.object({
  title: titleSchema,
  beforeText: coreTextSchema.optional().default(''),
  actionsText: coreTextSchema.optional().default(''),
  afterText: coreTextSchema.optional().default(''),
  clientTask: insightTextSchema.optional().default(null),
  clientProblem: insightTextSchema.optional().default(null),
  desiredResult: insightTextSchema.optional().default(null),
  marketingInsight: insightTextSchema.optional().default(null),
  status: z.enum(CASE_STUDY_STATUSES).optional().default('draft'),
}).strict();

export const updateCaseStudySchema = z.object({
  title: titleSchema.optional(),
  beforeText: coreTextSchema.optional(),
  actionsText: coreTextSchema.optional(),
  afterText: coreTextSchema.optional(),
  clientTask: insightTextSchema.optional(),
  clientProblem: insightTextSchema.optional(),
  desiredResult: insightTextSchema.optional(),
  marketingInsight: insightTextSchema.optional(),
  status: z.enum(CASE_STUDY_STATUSES).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Нет полей для обновления',
});

export type CreateCaseStudyInput = z.infer<typeof createCaseStudySchema>;
export type UpdateCaseStudyInput = z.infer<typeof updateCaseStudySchema>;
export type CaseStudyStatus = typeof CASE_STUDY_STATUSES[number];
