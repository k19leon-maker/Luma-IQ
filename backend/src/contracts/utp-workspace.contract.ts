import { z } from 'zod';

export const UTP_WORKSPACE_VERSION = 1 as const;

export const UTP_FOUNDATION_KEYS = [
  'niche',
  'audience',
  'jtbd',
  'pains',
  'desiredOutcome',
  'product',
  'mechanism',
  'differentiation',
  'proofs',
  'constraints',
] as const;

export const utpFoundationKeySchema = z.enum(UTP_FOUNDATION_KEYS);

export const utpEvidenceSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  source: z.string().trim().min(1),
}).passthrough();

export const utpMissingDataSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  editPath: z.string().trim().min(1).nullable(),
}).passthrough();

export const utpMetaSchema = z.object({
  version: z.literal(UTP_WORKSPACE_VERSION),
  usedEvidence: z.array(utpEvidenceSchema).default([]),
  missingData: z.array(utpMissingDataSchema).default([]),
  updatedAt: z.string().datetime().optional(),
}).passthrough();

export type UtpMeta = z.infer<typeof utpMetaSchema>;

export const utpHistoryEntrySchema = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  createdAt: z.string().datetime(),
  source: z.enum(['ai', 'manual', 'restore']),
  workflowRunId: z.string().trim().max(200).optional(),
  workflowStepId: z.string().trim().max(200).optional(),
  artifactId: z.string().trim().max(200).optional(),
  generationId: z.string().trim().max(200).optional(),
  value: z.string().max(10_000),
}).passthrough();

export const saveUtpWorkspaceSchema = z.object({
  text: z.string().max(10_000),
  history: z.array(utpHistoryEntrySchema).max(20),
  meta: utpMetaSchema.nullable(),
  expectedRevision: z.number().int().min(0),
  reason: z.enum(['manual', 'ai', 'restore']),
}).strict();

export type UtpHistoryEntry = z.infer<typeof utpHistoryEntrySchema>;
export type SaveUtpWorkspaceInput = z.infer<typeof saveUtpWorkspaceSchema>;

export interface UtpWorkspaceState {
  version: typeof UTP_WORKSPACE_VERSION;
  projectId: string;
  text: string;
  history: UtpHistoryEntry[];
  meta: UtpMeta | null;
  source: PersistedUtpSource;
  revision: number;
  savedAt: string;
}

export const utpAiEvidenceSchema = z.object({
  key: utpFoundationKeySchema,
  label: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(300),
}).strict();

export const utpAiMissingDataSchema = z.object({
  key: utpFoundationKeySchema,
  label: z.string().trim().min(1).max(120),
  editPath: z.string().trim().min(1).max(300).nullable(),
}).strict();

export const utpAiResultSchema = z.object({
  usp: z.string().trim().min(500).max(1200),
  usedEvidence: z.array(utpAiEvidenceSchema).min(1).max(20),
  missingData: z.array(utpAiMissingDataSchema).max(UTP_FOUNDATION_KEYS.length),
}).strict();

export type UtpFoundationKey = z.infer<typeof utpFoundationKeySchema>;
export type UtpAiResult = z.infer<typeof utpAiResultSchema>;

export type PersistedUtpSource =
  | 'generatedData.utp'
  | 'materialsData.utp.md'
  | 'legacy.utpData'
  | 'none';

export interface PersistedUtpResolution {
  text: string;
  source: PersistedUtpSource;
  history: unknown[];
  meta: UtpMeta | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstString(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) return '';
  for (const key of keys) {
    const value = nonEmptyString(source[key]);
    if (value) return value;
  }
  return '';
}

export function normalizeUtpMaterialText(value: unknown): string {
  const text = nonEmptyString(value);
  if (!text) return '';
  return text.replace(/^#\s*УТП\s*(?:\r?\n)+/i, '').trim();
}

function legacyUtpText(value: unknown): string {
  const legacy = asRecord(value);
  if (!legacy) return '';

  const direct = firstString(legacy, ['finalUtp', 'utp', 'statement', 'formula']);
  if (direct) return direct;

  const formats = asRecord(legacy.formats);
  const formatted = firstString(formats, ['finalUtp', 'utp', 'statement', 'formula', 'content', 'text']);
  if (formatted) return formatted;

  if (!Array.isArray(legacy.messages)) return '';
  for (const item of [...legacy.messages].reverse()) {
    const message = asRecord(item);
    if (!message) continue;
    const role = nonEmptyString(message.role).toLowerCase();
    if (role && !['assistant', 'ai'].includes(role)) continue;
    const content = firstString(message, ['content', 'text', 'message']);
    if (content) return content;
  }
  return '';
}

export function resolvePersistedUtp(input: {
  strategyData: unknown;
  utpData: unknown;
}): PersistedUtpResolution {
  const strategy = asRecord(input.strategyData) ?? {};
  const generated = asRecord(strategy.generatedData) ?? {};
  const history = Array.isArray(generated.utpHistory) ? generated.utpHistory : [];
  const parsedMeta = utpMetaSchema.safeParse(generated.utpMeta);

  const generatedText = nonEmptyString(generated.utp);
  if (generatedText) {
    return {
      text: generatedText,
      source: 'generatedData.utp',
      history,
      meta: parsedMeta.success ? parsedMeta.data : null,
    };
  }

  const materials = Array.isArray(strategy.materialsData) ? strategy.materialsData : [];
  const material = materials
    .map(asRecord)
    .find((item) => item?.id === 'utp.md' || item?.kind === 'utp');
  const materialText = normalizeUtpMaterialText(material?.content ?? material?.summary);
  if (materialText) {
    return {
      text: materialText,
      source: 'materialsData.utp.md',
      history,
      meta: parsedMeta.success ? parsedMeta.data : null,
    };
  }

  const legacyText = legacyUtpText(input.utpData);
  return {
    text: legacyText,
    source: legacyText ? 'legacy.utpData' : 'none',
    history,
    meta: parsedMeta.success ? parsedMeta.data : null,
  };
}
