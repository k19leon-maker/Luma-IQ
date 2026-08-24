import { z } from 'zod';

const optionalText = z.string().optional();
const workspaceId = z.string().min(1).max(240);

export const tgChannelItemStatusSchema = z.enum(['idea', 'draft', 'ready', 'planned']);

export const tgChannelPostV2Schema = z.object({
  title: z.string().default(''),
  content: z.string().default(''),
  cta: z.string().default(''),
  authorComment: z.string().default(''),
  status: z.enum(['draft', 'ready']).default('ready'),
  updatedAt: optionalText,
  previousAiVersion: z.object({
    content: z.string(),
    cta: optionalText,
    createdAt: z.string(),
  }).passthrough().optional(),
}).passthrough();

export const tgChannelPlanItemV2Schema = z.object({
  id: workspaceId,
  position: z.number().int().positive(),
  role: z.string(),
  readerTask: z.string(),
  topic: z.string(),
  keyMessage: z.string(),
  cta: z.string(),
  status: tgChannelItemStatusSchema,
  post: tgChannelPostV2Schema.optional(),
  plannedDate: optionalText,
  contentPlanItemId: optionalText,
  contentPlanSourceId: optionalText,
}).passthrough();

export const tgChannelWorkspaceV2CoreSchema = z.object({
  schemaVersion: z.literal(2),
  channel: z.object({
    name: z.string(),
    description: z.string(),
    updatedAt: optionalText,
  }).passthrough(),
  legacyContext: z.object({
    channelFor: optionalText,
    conversionPoint: optionalText,
    conversionDetails: optionalText,
    planTitle: optionalText,
    strategySummary: optionalText,
    sourceSnapshot: z.unknown().optional(),
    aiPromptVersion: optionalText,
    generatedAt: optionalText,
  }).passthrough().optional(),
  plan: z.object({
    id: workspaceId,
    version: z.number().int().positive(),
    activeBatchJobId: optionalText,
    previousAiPlan: z.record(z.unknown()).optional(),
    items: z.array(tgChannelPlanItemV2Schema),
  }).passthrough().optional(),
}).passthrough();

const legacySettingsSchema = z.object({
  channelName: z.string().default(''),
  channelFor: z.string().default(''),
  conversionPoint: z.string().default(''),
  conversionDetails: z.string().default(''),
}).passthrough();

const legacyPostSchema = z.object({
  title: z.string().default(''),
  text: z.string().default(''),
  callToAction: z.string().default(''),
  authorComment: z.string().default(''),
  status: z.string().optional(),
}).passthrough();

const legacyPlanItemSchema = z.object({
  id: workspaceId,
  number: z.number().int().positive().optional(),
  role: z.string().default(''),
  clientTask: z.string().default(''),
  topic: z.string().default(''),
  keyMessage: z.string().default(''),
  callToAction: z.string().default(''),
  status: z.string().optional(),
  post: legacyPostSchema.optional(),
  plannedDate: optionalText,
}).passthrough();

export const legacyTgChannelWorkspaceSchema = z.object({
  title: z.string().default('План ТГ-канала'),
  strategySummary: z.string().default(''),
  items: z.array(legacyPlanItemSchema).default([]),
  settings: legacySettingsSchema.default({
    channelName: '',
    channelFor: '',
    conversionPoint: '',
    conversionDetails: '',
  }),
  sourceSnapshot: z.unknown().optional(),
  aiPromptVersion: optionalText,
  generatedAt: optionalText,
}).passthrough();

// A v2 write remains readable by the pre-v2 frontend during an emergency rollback.
export const tgChannelRollbackEnvelopeV2Schema = tgChannelWorkspaceV2CoreSchema.extend({
  title: z.string(),
  strategySummary: z.string(),
  items: z.array(legacyPlanItemSchema),
  settings: legacySettingsSchema,
  sourceSnapshot: z.unknown().optional(),
  aiPromptVersion: optionalText,
  generatedAt: optionalText,
}).passthrough();

export type TgChannelWorkspaceV2 = z.infer<typeof tgChannelWorkspaceV2CoreSchema>;
export type TgChannelRollbackEnvelopeV2 = z.infer<typeof tgChannelRollbackEnvelopeV2Schema>;
export type LegacyTgChannelWorkspace = z.infer<typeof legacyTgChannelWorkspaceSchema>;

function statusFromLegacy(
  rawStatus: string | undefined,
  hasPost: boolean,
  plannedDate: string | undefined,
): z.infer<typeof tgChannelItemStatusSchema> {
  if (plannedDate) return 'planned';
  if (rawStatus === 'draft') return 'draft';
  if (hasPost || rawStatus === 'ready') return 'ready';
  return 'idea';
}

function legacyPlanId(items: LegacyTgChannelWorkspace['items']): string {
  const firstId = items[0]?.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
  return firstId ? `legacy-${firstId}` : 'legacy-empty-plan';
}

export function adaptLegacyTgChannelWorkspace(input: unknown): TgChannelRollbackEnvelopeV2 {
  const legacy = legacyTgChannelWorkspaceSchema.parse(input);
  const items = legacy.items.map((item, index) => ({
    id: item.id,
    position: item.number ?? index + 1,
    role: item.role,
    readerTask: item.clientTask,
    topic: item.topic,
    keyMessage: item.keyMessage,
    cta: item.callToAction,
    status: statusFromLegacy(item.status, Boolean(item.post), item.plannedDate),
    ...(item.post ? {
      post: {
        title: item.post.title,
        content: item.post.text,
        cta: item.post.callToAction,
        authorComment: item.post.authorComment,
        status: item.post.status === 'draft' ? 'draft' as const : 'ready' as const,
        ...(legacy.generatedAt ? { updatedAt: legacy.generatedAt } : {}),
      },
    } : {}),
    ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}),
  }));

  return tgChannelRollbackEnvelopeV2Schema.parse({
    schemaVersion: 2,
    channel: {
      name: legacy.settings.channelName,
      // channelFor is an audience description, not a Telegram channel description.
      description: '',
    },
    legacyContext: {
      channelFor: legacy.settings.channelFor,
      conversionPoint: legacy.settings.conversionPoint,
      conversionDetails: legacy.settings.conversionDetails,
      planTitle: legacy.title,
      strategySummary: legacy.strategySummary,
      sourceSnapshot: legacy.sourceSnapshot,
      aiPromptVersion: legacy.aiPromptVersion,
      generatedAt: legacy.generatedAt,
    },
    plan: {
      id: legacyPlanId(legacy.items),
      version: 1,
      items,
    },
    // Root-level mirror is intentionally retained for pre-v2 rollback readers.
    title: legacy.title,
    strategySummary: legacy.strategySummary,
    items: legacy.items,
    settings: legacy.settings,
    sourceSnapshot: legacy.sourceSnapshot,
    aiPromptVersion: legacy.aiPromptVersion,
    generatedAt: legacy.generatedAt,
  });
}

export function parseTgChannelWorkspace(input: unknown): TgChannelRollbackEnvelopeV2 {
  if (input && typeof input === 'object' && !Array.isArray(input) && input !== null
    && (input as { schemaVersion?: unknown }).schemaVersion === 2) {
    return tgChannelRollbackEnvelopeV2Schema.parse(input);
  }
  return adaptLegacyTgChannelWorkspace(input);
}

export function serializeTgChannelWorkspaceV2(
  input: TgChannelWorkspaceV2,
): TgChannelRollbackEnvelopeV2 {
  const workspace = tgChannelWorkspaceV2CoreSchema.parse(input);
  const legacyContext = workspace.legacyContext;
  const legacyItems: LegacyTgChannelWorkspace['items'] = (workspace.plan?.items ?? []).map((item) => ({
    id: item.id,
    number: item.position,
    role: item.role,
    clientTask: item.readerTask,
    topic: item.topic,
    keyMessage: item.keyMessage,
    callToAction: item.cta,
    status: item.status,
    ...(item.post ? {
      post: {
        title: item.post.title,
        text: item.post.content,
        callToAction: item.post.cta,
        authorComment: item.post.authorComment,
        status: item.post.status,
      },
    } : {}),
    ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}),
  }));

  return tgChannelRollbackEnvelopeV2Schema.parse({
    ...workspace,
    title: legacyContext?.planTitle ?? 'План ТГ-канала',
    strategySummary: legacyContext?.strategySummary ?? '',
    items: legacyItems,
    settings: {
      channelName: workspace.channel.name,
      channelFor: legacyContext?.channelFor ?? '',
      conversionPoint: legacyContext?.conversionPoint ?? '',
      conversionDetails: legacyContext?.conversionDetails ?? '',
    },
    sourceSnapshot: legacyContext?.sourceSnapshot,
    aiPromptVersion: legacyContext?.aiPromptVersion,
    generatedAt: legacyContext?.generatedAt,
  });
}
