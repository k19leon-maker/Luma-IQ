import { z } from 'zod';

export const CASE_STUDY_STATUSES = ['draft', 'ready'] as const;
export const CASE_STUDY_SOURCE_TYPES = ['manual', 'voice', 'screenshot', 'document'] as const;

const titleSchema = z.string().trim().min(1, 'Укажите название кейса').max(240, 'Название не должно превышать 240 символов');
const coreTextSchema = z.string().max(20_000, 'Текст не должен превышать 20 000 символов');
const insightTextSchema = z.string().max(8_000, 'Текст тезиса не должен превышать 8 000 символов').nullable();
const extractedTextSchema = z.string().trim().min(40, 'Добавьте больше информации о клиентской истории').max(
  50_000,
  'Текст не должен превышать 50 000 символов',
);
const extractedCaseTextSchema = z.string().trim().max(20_000, 'Текст не должен превышать 20 000 символов');
const extractedInsightSchema = z.string().trim().max(8_000, 'Текст тезиса не должен превышать 8 000 символов');

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

export const caseExtractionCandidateSchema = z.object({
  title: titleSchema,
  beforeText: extractedCaseTextSchema,
  actionsText: extractedCaseTextSchema,
  afterText: extractedCaseTextSchema,
  clientTask: extractedInsightSchema,
  clientProblem: extractedInsightSchema,
  desiredResult: extractedInsightSchema,
  marketingInsight: extractedInsightSchema,
}).strict();

export const caseExtractionResultSchema = z.object({
  cases: z.array(caseExtractionCandidateSchema).max(10, 'За один раз можно создать не более 10 кейсов'),
}).strict();

export const caseInsightsResultSchema = z.object({
  clientTask: extractedInsightSchema,
  clientProblem: extractedInsightSchema,
  desiredResult: extractedInsightSchema,
  marketingInsight: extractedInsightSchema,
}).strict();

export const extractCasesSchema = z.object({
  sourceText: extractedTextSchema,
  sourceType: z.enum(CASE_STUDY_SOURCE_TYPES).optional().default('document'),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();

export const batchCreateCasesSchema = z.object({
  candidates: z.array(caseExtractionCandidateSchema).min(1, 'Выберите хотя бы один кейс').max(10),
  sourceText: extractedTextSchema,
  sourceType: z.enum(CASE_STUDY_SOURCE_TYPES).optional().default('document'),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

export const generateCaseInsightsSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict();

export type CreateCaseStudyInput = z.infer<typeof createCaseStudySchema>;
export type UpdateCaseStudyInput = z.infer<typeof updateCaseStudySchema>;
export type CaseStudyStatus = typeof CASE_STUDY_STATUSES[number];
export type CaseStudySourceType = typeof CASE_STUDY_SOURCE_TYPES[number];
export type CaseExtractionCandidate = z.infer<typeof caseExtractionCandidateSchema>;
export type BatchCreateCasesInput = z.infer<typeof batchCreateCasesSchema>;
