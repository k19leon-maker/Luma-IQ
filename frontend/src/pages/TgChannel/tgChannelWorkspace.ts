export type TgPostStatus = 'idea' | 'draft' | 'ready' | 'planned';

export const TG_CHANNEL_DESCRIPTION_MAX_LENGTH = 250;

export interface TgChannelDescriptionValidation {
  length: number;
  maxLength: number;
  valid: boolean;
}

export function validateTgChannelDescription(value: string): TgChannelDescriptionValidation {
  const length = value.length;
  return {
    length,
    maxLength: TG_CHANNEL_DESCRIPTION_MAX_LENGTH,
    valid: length <= TG_CHANNEL_DESCRIPTION_MAX_LENGTH,
  };
}

export interface TgChannelSettings {
  channelName: string;
  channelFor: string;
  conversionPoint: string;
  conversionDetails: string;
}

export interface TgPostDraft {
  title: string;
  text: string;
  callToAction: string;
  authorComment: string;
  status: 'draft' | 'ready';
  previousAiVersion?: {
    title: string;
    text: string;
    callToAction: string;
    authorComment: string;
    createdAt: string;
  };
}

export interface TgPlanItem {
  id: string;
  number: number;
  role: string;
  clientTask: string;
  topic: string;
  keyMessage: string;
  callToAction: string;
  status: TgPostStatus;
  post?: TgPostDraft;
  plannedDate?: string;
  contentPlanItemId?: string;
  contentPlanSourceId?: string;
}

export interface TgChannelResult {
  title: string;
  strategySummary: string;
  items: TgPlanItem[];
  settings: TgChannelSettings;
  sourceSnapshot?: Record<string, unknown>;
  aiPromptVersion?: string;
  generatedAt?: string;
}

export interface TgChannelPostV2 extends Record<string, unknown> {
  title: string;
  content: string;
  cta: string;
  authorComment: string;
  status: 'draft' | 'ready';
  updatedAt?: string;
  previousAiVersion?: {
    title?: string;
    content: string;
    cta?: string;
    authorComment?: string;
    createdAt: string;
    [key: string]: unknown;
  };
}

export interface TgChannelPlanItemV2 extends Record<string, unknown> {
  id: string;
  position: number;
  role: string;
  readerTask: string;
  topic: string;
  keyMessage: string;
  cta: string;
  status: TgPostStatus;
  post?: TgChannelPostV2;
  plannedDate?: string;
  contentPlanItemId?: string;
  contentPlanSourceId?: string;
}

export interface TgChannelWorkspaceV2 extends Record<string, unknown> {
  schemaVersion: 2;
  channel: {
    name: string;
    description: string;
    updatedAt?: string;
    [key: string]: unknown;
  };
  legacyContext?: {
    channelFor?: string;
    conversionPoint?: string;
    conversionDetails?: string;
    planTitle?: string;
    strategySummary?: string;
    sourceSnapshot?: unknown;
    aiPromptVersion?: string;
    generatedAt?: string;
    [key: string]: unknown;
  };
  plan?: {
    id: string;
    version: number;
    activeBatchJobId?: string;
    previousAiPlan?: Record<string, unknown>;
    items: TgChannelPlanItemV2[];
    [key: string]: unknown;
  };
}

export interface TgChannelWorkspaceEnvelopeV2 extends TgChannelWorkspaceV2 {
  title: string;
  strategySummary: string;
  items: TgPlanItem[];
  settings: TgChannelSettings;
  sourceSnapshot?: unknown;
  aiPromptVersion?: string;
  generatedAt?: string;
}

export interface TgChannelContentRecord {
  id: string;
  projectId: string;
  type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_SETTINGS: TgChannelSettings = {
  channelName: '',
  channelFor: '',
  conversionPoint: 'бесплатная Zoom-диагностика',
  conversionDetails: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function itemStatus(value: unknown, hasPost: boolean, plannedDate?: string): TgPostStatus {
  if (plannedDate) return 'planned';
  if (value === 'draft') return 'draft';
  if (hasPost || value === 'ready') return 'ready';
  return 'idea';
}

function normalizeLegacyPost(value: unknown): TgPostDraft | undefined {
  if (!isRecord(value)) return undefined;
  return {
    title: text(value.title, 'Пост для ТГ-канала'),
    text: text(value.text),
    callToAction: text(value.callToAction),
    authorComment: text(value.authorComment),
    status: value.status === 'draft' ? 'draft' : 'ready',
  };
}

function normalizeLegacyItem(value: unknown, index: number): TgPlanItem {
  const data = isRecord(value) ? value : {};
  const post = normalizeLegacyPost(data.post);
  const plannedDate = text(data.plannedDate) || undefined;
  return {
    id: text(data.id, `tg-${index + 1}`),
    number: positiveInteger(data.number, index + 1),
    role: text(data.role, 'Пост'),
    clientTask: text(data.clientTask),
    topic: text(data.topic),
    keyMessage: text(data.keyMessage),
    callToAction: text(data.callToAction),
    status: itemStatus(data.status, Boolean(post), plannedDate),
    ...(post ? { post } : {}),
    ...(plannedDate ? { plannedDate } : {}),
    ...(text(data.contentPlanItemId) ? { contentPlanItemId: text(data.contentPlanItemId) } : {}),
    ...(text(data.contentPlanSourceId) ? { contentPlanSourceId: text(data.contentPlanSourceId) } : {}),
  };
}

function normalizeSettings(value: unknown): TgChannelSettings {
  const data = isRecord(value) ? value : {};
  return {
    channelName: text(data.channelName),
    channelFor: text(data.channelFor),
    conversionPoint: text(data.conversionPoint, EMPTY_SETTINGS.conversionPoint),
    conversionDetails: text(data.conversionDetails),
  };
}

function legacyPlanId(items: TgPlanItem[]): string {
  const firstId = items[0]?.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
  return firstId ? `legacy-${firstId}` : 'legacy-empty-plan';
}

function normalizeV2Post(value: unknown): TgChannelPostV2 | undefined {
  if (!isRecord(value)) return undefined;
  return {
    ...value,
    title: text(value.title),
    content: text(value.content),
    cta: text(value.cta),
    authorComment: text(value.authorComment),
    status: value.status === 'draft' ? 'draft' : 'ready',
    ...(text(value.updatedAt) ? { updatedAt: text(value.updatedAt) } : {}),
  };
}

function normalizeV2Item(value: unknown, index: number): TgChannelPlanItemV2 {
  if (!isRecord(value)) throw new Error(`Некорректный item TG_CHANNEL #${index + 1}`);
  const id = text(value.id);
  if (!id) throw new Error(`У item TG_CHANNEL #${index + 1} отсутствует id`);
  const plannedDate = text(value.plannedDate) || undefined;
  const post = normalizeV2Post(value.post);
  return {
    ...value,
    id,
    position: positiveInteger(value.position, index + 1),
    role: text(value.role),
    readerTask: text(value.readerTask),
    topic: text(value.topic),
    keyMessage: text(value.keyMessage),
    cta: text(value.cta),
    status: itemStatus(value.status, Boolean(post), plannedDate),
    ...(post ? { post } : {}),
    ...(plannedDate ? { plannedDate } : {}),
    ...(text(value.contentPlanItemId) ? { contentPlanItemId: text(value.contentPlanItemId) } : {}),
    ...(text(value.contentPlanSourceId) ? { contentPlanSourceId: text(value.contentPlanSourceId) } : {}),
  };
}

function normalizeV2Workspace(value: Record<string, unknown>): TgChannelWorkspaceEnvelopeV2 {
  const channel = isRecord(value.channel) ? value.channel : null;
  const plan = isRecord(value.plan) ? value.plan : undefined;
  if (!channel) throw new Error('В TG_CHANNEL v2 отсутствует channel');
  if (!Array.isArray(value.items) || !isRecord(value.settings)) {
    throw new Error('В TG_CHANNEL v2 отсутствует rollback mirror');
  }
  const legacyContext = isRecord(value.legacyContext) ? value.legacyContext : undefined;
  const planItems = plan && Array.isArray(plan.items)
    ? plan.items.map(normalizeV2Item)
    : undefined;
  const mirrorItems = value.items.map(normalizeLegacyItem);
  const settings = normalizeSettings(value.settings);

  return {
    ...value,
    schemaVersion: 2,
    channel: {
      ...channel,
      name: text(channel.name),
      description: text(channel.description),
      ...(text(channel.updatedAt) ? { updatedAt: text(channel.updatedAt) } : {}),
    },
    ...(legacyContext ? { legacyContext: { ...legacyContext } } : {}),
    ...(plan ? {
      plan: {
        ...plan,
        id: text(plan.id, 'tg-plan'),
        version: positiveInteger(plan.version, 1),
        items: planItems ?? [],
      },
    } : {}),
    title: text(value.title, 'План ТГ-канала'),
    strategySummary: text(value.strategySummary),
    items: mirrorItems,
    settings,
    sourceSnapshot: value.sourceSnapshot,
    aiPromptVersion: text(value.aiPromptVersion) || undefined,
    generatedAt: text(value.generatedAt) || undefined,
  };
}

export function adaptLegacyTgChannelWorkspace(value: unknown): TgChannelWorkspaceEnvelopeV2 {
  if (!isRecord(value)) throw new Error('TG_CHANNEL должен быть JSON-объектом');
  const settings = normalizeSettings(value.settings);
  const items = Array.isArray(value.items) ? value.items.map(normalizeLegacyItem) : [];
  const title = text(value.title, 'План ТГ-канала');
  const strategySummary = text(value.strategySummary);
  const sourceSnapshot = value.sourceSnapshot;
  const aiPromptVersion = text(value.aiPromptVersion) || undefined;
  const generatedAt = text(value.generatedAt) || undefined;
  const planItems: TgChannelPlanItemV2[] = items.map((item) => ({
    id: item.id,
    position: item.number,
    role: item.role,
    readerTask: item.clientTask,
    topic: item.topic,
    keyMessage: item.keyMessage,
    cta: item.callToAction,
    status: item.status,
    ...(item.post ? {
      post: {
        title: item.post.title,
        content: item.post.text,
        cta: item.post.callToAction,
        authorComment: item.post.authorComment,
        status: item.post.status,
        ...(item.post.previousAiVersion ? {
          previousAiVersion: {
            title: item.post.previousAiVersion.title,
            content: item.post.previousAiVersion.text,
            cta: item.post.previousAiVersion.callToAction,
            authorComment: item.post.previousAiVersion.authorComment,
            createdAt: item.post.previousAiVersion.createdAt,
          },
        } : {}),
        ...(generatedAt ? { updatedAt: generatedAt } : {}),
      },
    } : {}),
    ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}),
    ...(item.contentPlanItemId ? { contentPlanItemId: item.contentPlanItemId } : {}),
    ...(item.contentPlanSourceId ? { contentPlanSourceId: item.contentPlanSourceId } : {}),
  }));

  return {
    ...value,
    schemaVersion: 2,
    channel: { name: settings.channelName, description: '' },
    legacyContext: {
      channelFor: settings.channelFor,
      conversionPoint: settings.conversionPoint,
      conversionDetails: settings.conversionDetails,
      planTitle: title,
      strategySummary,
      sourceSnapshot,
      aiPromptVersion,
      generatedAt,
    },
    plan: { id: legacyPlanId(items), version: 1, items: planItems },
    title,
    strategySummary,
    items,
    settings,
    sourceSnapshot,
    aiPromptVersion,
    generatedAt,
  };
}

export function parseTgChannelWorkspaceContent(content: string): TgChannelWorkspaceEnvelopeV2 {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('Сохранённый TG_CHANNEL содержит некорректный JSON');
  }
  if (isRecord(value) && value.schemaVersion === 2) return normalizeV2Workspace(value);
  return adaptLegacyTgChannelWorkspace(value);
}

export function workspaceToLegacyView(workspace: TgChannelWorkspaceV2): {
  settings: TgChannelSettings;
  result: TgChannelResult | null;
} {
  const legacy = workspace.legacyContext;
  const settings: TgChannelSettings = {
    channelName: workspace.channel.name,
    channelFor: text(legacy?.channelFor),
    conversionPoint: text(legacy?.conversionPoint, EMPTY_SETTINGS.conversionPoint),
    conversionDetails: text(legacy?.conversionDetails),
  };
  if (!workspace.plan) return { settings, result: null };

  const items: TgPlanItem[] = workspace.plan.items.map((item) => ({
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
        ...(item.post.previousAiVersion ? {
          previousAiVersion: {
            title: item.post.previousAiVersion.title ?? '',
            text: item.post.previousAiVersion.content,
            callToAction: item.post.previousAiVersion.cta ?? '',
            authorComment: item.post.previousAiVersion.authorComment ?? '',
            createdAt: item.post.previousAiVersion.createdAt,
          },
        } : {}),
      },
    } : {}),
    ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}),
    ...(item.contentPlanItemId ? { contentPlanItemId: item.contentPlanItemId } : {}),
    ...(item.contentPlanSourceId ? { contentPlanSourceId: item.contentPlanSourceId } : {}),
  }));

  return {
    settings,
    result: {
      title: text(legacy?.planTitle, 'План ТГ-канала'),
      strategySummary: text(legacy?.strategySummary),
      items,
      settings,
      sourceSnapshot: isRecord(legacy?.sourceSnapshot) ? legacy.sourceSnapshot : undefined,
      aiPromptVersion: text(legacy?.aiPromptVersion) || undefined,
      generatedAt: text(legacy?.generatedAt) || undefined,
    },
  };
}

export function workspaceFromLegacyView(input: {
  settings: TgChannelSettings;
  result: TgChannelResult | null;
  base?: TgChannelWorkspaceV2 | null;
  channelDescription?: string;
}): TgChannelWorkspaceV2 {
  const { settings, result, base, channelDescription } = input;
  const baseItems = new Map((base?.plan?.items ?? []).map((item) => [item.id, item]));
  const items = result?.items.map((item) => {
    const previous = baseItems.get(item.id);
    return {
      ...previous,
      id: item.id,
      position: item.number,
      role: item.role,
      readerTask: item.clientTask,
      topic: item.topic,
      keyMessage: item.keyMessage,
      cta: item.callToAction,
      status: item.status,
      ...(item.post ? {
        post: {
          ...previous?.post,
          title: item.post.title,
          content: item.post.text,
          cta: item.post.callToAction,
          authorComment: item.post.authorComment,
          status: item.post.status,
        },
      } : { post: undefined }),
      ...(item.plannedDate ? { plannedDate: item.plannedDate } : { plannedDate: undefined }),
      contentPlanItemId: item.contentPlanItemId ?? previous?.contentPlanItemId,
      contentPlanSourceId: item.contentPlanSourceId ?? previous?.contentPlanSourceId,
    } satisfies TgChannelPlanItemV2;
  });

  return {
    ...base,
    schemaVersion: 2,
    channel: {
      ...base?.channel,
      name: settings.channelName,
      description: channelDescription ?? base?.channel.description ?? '',
    },
    legacyContext: {
      ...base?.legacyContext,
      channelFor: settings.channelFor,
      conversionPoint: settings.conversionPoint,
      conversionDetails: settings.conversionDetails,
      planTitle: result?.title ?? base?.legacyContext?.planTitle,
      strategySummary: result?.strategySummary ?? base?.legacyContext?.strategySummary,
      sourceSnapshot: result?.sourceSnapshot ?? base?.legacyContext?.sourceSnapshot,
      aiPromptVersion: result?.aiPromptVersion ?? base?.legacyContext?.aiPromptVersion,
      generatedAt: result?.generatedAt ?? base?.legacyContext?.generatedAt,
    },
    ...(result ? {
      plan: {
        ...base?.plan,
        id: base?.plan?.id ?? `tg-plan-${result.items[0]?.id ?? 'empty'}`,
        version: base?.plan?.version ?? 2,
        items: items ?? [],
      },
    } : base?.plan ? { plan: base.plan } : {}),
  };
}

export function serializeTgChannelWorkspace(
  workspace: TgChannelWorkspaceV2,
): TgChannelWorkspaceEnvelopeV2 {
  const legacy = workspaceToLegacyView(workspace);
  const result = legacy.result;
  return {
    ...workspace,
    title: result?.title ?? text(workspace.legacyContext?.planTitle, 'План ТГ-канала'),
    strategySummary: result?.strategySummary ?? text(workspace.legacyContext?.strategySummary),
    items: result?.items ?? [],
    settings: legacy.settings,
    sourceSnapshot: result?.sourceSnapshot ?? workspace.legacyContext?.sourceSnapshot,
    aiPromptVersion: result?.aiPromptVersion ?? (text(workspace.legacyContext?.aiPromptVersion) || undefined),
    generatedAt: result?.generatedAt ?? (text(workspace.legacyContext?.generatedAt) || undefined),
  };
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectLatestTgChannelRecord<T extends TgChannelContentRecord>(
  records: T[],
  projectId: string,
): T | null {
  return records
    .filter((record) => record.projectId === projectId && record.type === 'TG_CHANNEL')
    .sort((left, right) => {
      const updatedDiff = timestamp(right.updatedAt) - timestamp(left.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;
      const createdDiff = timestamp(right.createdAt) - timestamp(left.createdAt);
      if (createdDiff !== 0) return createdDiff;
      return right.id.localeCompare(left.id);
    })[0] ?? null;
}

export function tgChannelWorkspaceMetadata(
  workspace: TgChannelWorkspaceV2,
  status: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    kind: 'tg_channel',
    contentType: 'tg_channel',
    schemaVersion: 2,
    status,
    settings: workspaceToLegacyView(workspace).settings,
    sourceSnapshot: workspace.legacyContext?.sourceSnapshot,
  };
}
