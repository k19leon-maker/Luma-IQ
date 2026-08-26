import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aiApi, AiBatchJob, WorkflowResponse } from '../../api/ai';
import { projectsApi } from '../../api/projects.api';
import { AI_ACTION_COSTS } from '../../config/ai-balance';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useModelStore } from '../../store/model.store';
import { useProjectsStore } from '../../store/projects.store';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import {
  TgChannelResult,
  TgChannelSettings,
  TgPlanItem,
  TgPostDraft,
  tgChannelWorkspaceMetadata,
  validateTgChannelDescription,
  workspaceFromLegacyView,
  workspaceToLegacyView,
} from './tgChannelWorkspace';
import { TgChannelContentPlanTab } from './TgChannelContentPlanTab';
import { buildTgContentPlanSourceId } from './tgChannelContentPlan';
import { TgChannelDescriptionTab } from './TgChannelDescriptionTab';
import {
  appendTgPlanItem,
  createManualTgPlanItem,
  deleteTgPlanItem,
  replaceTgPlanItem,
} from './tgChannelPlanEditing';
import {
  parseTgChannelDescriptionProposal,
  TgChannelDescriptionAiProposal,
} from './tgChannelDescriptionAi';
import {
  getNextTgChannelTab,
  readTgChannelTab,
  TgChannelTab,
  writeTgChannelTab,
} from './tgChannelTabs';
import { useTgChannelWorkspaceStorage } from './useTgChannelWorkspaceStorage';
import {
  applyTgChannelIdeaProposal,
  applyTgChannelPostProposal,
  buildTgChannelGenerationContext,
  parseTgChannelIdeaProposal,
  parseTgChannelPostProposal,
  TgChannelIdeaProposal,
} from './tgChannelContentAi';
import s from './TgChannel.module.css';

interface StrategyStatus {
  key: string;
  label: string;
  href: string;
  filled: boolean;
}

type DescriptionAiAction = 'generate' | 'improve';

interface DescriptionAiRequest {
  action: DescriptionAiAction;
  workflow: string;
  inputs: Record<string, unknown>;
  idempotencyKey: string;
}

interface DescriptionAiProposalState {
  current: TgChannelDescriptionAiProposal;
  proposed: TgChannelDescriptionAiProposal;
  action: DescriptionAiAction;
  response: Pick<WorkflowResponse, 'workflowRunId' | 'workflowStepId' | 'artifactId' | 'generationId'>;
}

interface IdeaAiProposalState {
  itemId: string;
  current: TgPlanItem;
  proposed: TgChannelIdeaProposal;
  response: Pick<WorkflowResponse, 'workflowRunId' | 'workflowStepId' | 'artifactId' | 'generationId'>;
}

interface PostAiProposalState {
  itemId: string;
  current: TgPostDraft;
  proposed: TgPostDraft;
  response: Pick<WorkflowResponse, 'workflowRunId' | 'workflowStepId' | 'artifactId' | 'generationId'>;
}

const LIMIT_MESSAGE = 'AI-баланс закончился. Уже созданные материалы можно открыть и отправить в контент-план, но новое AI-действие будет доступно после обновления лимитов или смены тарифа.';

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  return true;
}

function compactText(value: unknown, max = 1800): string {
  if (!hasMeaningfulValue(value)) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n...[сокращено]` : text;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (withoutFence.startsWith('{')) return withoutFence;
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
}

function normalizePost(value: unknown): TgPostDraft {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    title: String(data.title ?? 'Пост для ТГ-канала'),
    text: String(data.text ?? ''),
    callToAction: String(data.callToAction ?? ''),
    authorComment: String(data.authorComment ?? ''),
    status: 'ready',
  };
}

function parseBatchPost(content: string): TgPostDraft | null {
  try {
    return normalizePost(JSON.parse(stripJsonFence(content)));
  } catch {
    return null;
  }
}

function normalizePlanItem(value: unknown, index: number): TgPlanItem {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const post = data.post && typeof data.post === 'object' ? normalizePost(data.post) : undefined;
  const plannedDate = typeof data.plannedDate === 'string' ? data.plannedDate : undefined;
  const status = plannedDate ? 'planned' : post ? 'ready' : 'idea';

  return {
    id: String(data.id ?? `tg-${index + 1}`),
    number: Number(data.position ?? data.number) || index + 1,
    role: String(data.role ?? 'Пост'),
    clientTask: String(data.readerTask ?? data.clientTask ?? ''),
    topic: String(data.topic ?? ''),
    keyMessage: String(data.keyMessage ?? ''),
    callToAction: String(data.cta ?? data.callToAction ?? ''),
    status,
    post,
    plannedDate,
    contentPlanItemId: typeof data.contentPlanItemId === 'string' ? data.contentPlanItemId : undefined,
    contentPlanSourceId: typeof data.contentPlanSourceId === 'string' ? data.contentPlanSourceId : undefined,
  };
}

function normalizeResult(value: Partial<TgChannelResult>, fallbackSettings: TgChannelSettings): TgChannelResult {
  return {
    title: value.title || 'План ТГ-канала',
    strategySummary: value.strategySummary || '',
    items: Array.isArray(value.items) ? value.items.map(normalizePlanItem) : [],
    settings: value.settings ?? fallbackSettings,
    sourceSnapshot: value.sourceSnapshot,
    aiPromptVersion: value.aiPromptVersion || 'tg-channel.plan.v1',
    generatedAt: value.generatedAt,
  };
}

function isLimitError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'response' in error
    ? String((error as { response?: { data?: { error?: unknown } } }).response?.data?.error ?? '')
    : error instanceof Error ? error.message : String(error ?? '');
  return /лимит|balance|баланс|credits|credit|тариф/i.test(message);
}

function findFirstString(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function hasAnyStrategyValue(source: Record<string, unknown> | null, keys: string[]): boolean {
  if (!source) return false;
  return keys.some((key) => hasMeaningfulValue(source[key]));
}

function postFullText(item: TgPlanItem): string {
  const post = item.post;
  if (!post) return '';
  return [post.text, post.callToAction ? `\n${post.callToAction}` : ''].filter(Boolean).join('\n').trim();
}

export default function TgChannel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readTgChannelTab(searchParams);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const projectName = useProjectsStore((state) => state.projects.find((project) => project.id === state.activeProjectId)?.name ?? 'Проект');
  const hasActiveProject = Boolean(activeProjectId && activeProjectId !== 'default');
  const getModelSettings = useModelStore((state) => state.getSettings);
  const modelSettings = useMemo(() => getModelSettings('tg-channel'), [getModelSettings]);
  const { openAddModal } = useContentPlanStore();
  const storage = useTgChannelWorkspaceStorage(hasActiveProject ? activeProjectId! : '');

  const [strategyData, setStrategyData] = useState<Record<string, unknown> | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [settings, setSettings] = useState<TgChannelSettings>({
    channelName: '',
    channelFor: '',
    conversionPoint: 'бесплатная Zoom-диагностика',
    conversionDetails: '',
  });
  const [channelDescription, setChannelDescription] = useState('');
  const [result, setResult] = useState<TgChannelResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [batchJob, setBatchJob] = useState<AiBatchJob | null>(null);
  const [error, setError] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [descriptionAiInstruction, setDescriptionAiInstruction] = useState('');
  const [descriptionAiAction, setDescriptionAiAction] = useState<DescriptionAiAction | null>(null);
  const [descriptionVoiceBusy, setDescriptionVoiceBusy] = useState(false);
  const [descriptionAiError, setDescriptionAiError] = useState('');
  const [descriptionAiProposal, setDescriptionAiProposal] = useState<DescriptionAiProposalState | null>(null);
  const [descriptionLastRequest, setDescriptionLastRequest] = useState<DescriptionAiRequest | null>(null);
  const [ideaAiProposal, setIdeaAiProposal] = useState<IdeaAiProposalState | null>(null);
  const [postAiProposal, setPostAiProposal] = useState<PostAiProposalState | null>(null);
  const recoveredBatchIdRef = useRef<string | null>(null);
  const appliedBatchIdRef = useRef<string | null>(null);
  const tabRefs = useRef<Record<TgChannelTab, HTMLButtonElement | null>>({
    description: null,
    'content-plan': null,
  });

  function selectTab(nextTab: TgChannelTab) {
    if (nextTab === tab) return;
    setSearchParams(writeTgChannelTab(searchParams, nextTab));
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const nextTab = getNextTgChannelTab(tab, event.key);
    if (!nextTab) return;
    event.preventDefault();
    selectTab(nextTab);
    requestAnimationFrame(() => tabRefs.current[nextTab]?.focus());
  }

  useEffect(() => {
    let alive = true;
    setStrategyData(null);
    if (!hasActiveProject || !activeProjectId) return;

    setStrategyLoading(true);
    Promise.all([
      projectsApi.getStrategyFields(activeProjectId, [
        'expertProfileData',
        'positioningData',
        'answers',
        'completed',
        'unpackingData',
      ]),
      projectsApi.getStrategy(activeProjectId, ['generatedData'], ['social']),
    ])
      .then(([strategy, generated]) => ({ ...strategy, ...(generated ?? {}) }))
      .then((data) => {
        if (!alive) return;
        const next = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
        setStrategyData(next);
        const inferred = findFirstString(next, ['channelFor', 'targetAudience', 'audience', 'chosenSegment', 'positioning']);
        if (inferred) {
          setSettings((current) => current.channelFor ? current : { ...current, channelFor: inferred.slice(0, 260) });
        }
      })
      .catch(() => {
        if (alive) setStrategyData(null);
      })
      .finally(() => {
        if (alive) setStrategyLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [activeProjectId, hasActiveProject]);

  useEffect(() => {
    setSettings({
      channelName: '',
      channelFor: '',
      conversionPoint: 'бесплатная Zoom-диагностика',
      conversionDetails: '',
    });
    setChannelDescription('');
    setResult(null);
    setSelectedId(null);
    setBatchJob(null);
    setCustomInstruction('');
    setDescriptionAiInstruction('');
    setDescriptionAiAction(null);
    setDescriptionVoiceBusy(false);
    setDescriptionAiError('');
    setDescriptionAiProposal(null);
    setDescriptionLastRequest(null);
    setIdeaAiProposal(null);
    setPostAiProposal(null);
    recoveredBatchIdRef.current = null;
    appliedBatchIdRef.current = null;
    setError('');
  }, [activeProjectId]);

  useEffect(() => {
    if (!storage.loaded || !storage.workspace) return;
    const view = workspaceToLegacyView(storage.workspace);
    setSettings(view.settings);
    setChannelDescription(storage.workspace.channel.description);
    setResult(view.result);
    setSelectedId((current) => {
      if (current && view.result?.items.some((item) => item.id === current)) return current;
      return view.result?.items[0]?.id ?? null;
    });
  }, [storage.loaded, storage.workspace]);

  const sourceSnapshot = useMemo(() => ({
    projectName,
    strategyData: compactText(strategyData, 3600),
    strategyLoadedAt: strategyData ? new Date().toISOString() : null,
  }), [projectName, strategyData]);

  const strategyStatus = useMemo<StrategyStatus[]>(() => {
    const strategyText = compactText(strategyData, 8000);
    return [
      { key: 'positioning', label: 'Позиционирование', href: '/app/strategy/positioning', filled: hasAnyStrategyValue(strategyData, ['positioningData', 'positioning', 'finalPositioning', 'selectedPositioning']) },
      { key: 'audience', label: 'Целевая аудитория', href: '/app/strategy/audience', filled: hasAnyStrategyValue(strategyData, ['answers', 'audience', 'audienceData', 'chosenSegment', 'targetAudience']) },
      { key: 'utp', label: 'УТП', href: '/app/strategy/utp', filled: hasAnyStrategyValue(strategyData, ['utpData', 'utp', 'finalUtp']) || /утп|уникаль|оффер|offer/i.test(strategyText) },
      { key: 'products', label: 'Продукты / лид-магнит', href: '/app/products/main', filled: /основной продукт|мини-продукт|лид-магнит|product|productsAndPrices/i.test(strategyText) },
    ];
  }, [strategyData]);

  const missingSections = strategyStatus.filter((item) => !item.filled).map((item) => item.label);
  const descriptionValidation = validateTgChannelDescription(channelDescription);
  const selectedItem = result?.items.find((item) => item.id === selectedId) ?? result?.items[0] ?? null;
  const readyCount = result?.items.filter((item) => item.post).length ?? 0;
  const plannedCount = result?.items.filter((item) => item.plannedDate).length ?? 0;
  const pendingItems = result?.items.filter((item) => !item.post) ?? [];

  useEffect(() => {
    setIdeaAiProposal((proposal) => proposal?.itemId === selectedId ? proposal : null);
    setPostAiProposal((proposal) => proposal?.itemId === selectedId ? proposal : null);
  }, [selectedId]);

  useEffect(() => {
    const activeBatchJobId = storage.workspace?.plan?.activeBatchJobId;
    if (!activeBatchJobId || recoveredBatchIdRef.current === activeBatchJobId || batchJob?.id === activeBatchJobId) return;
    recoveredBatchIdRef.current = activeBatchJobId;
    aiApi.getBatch(activeBatchJobId)
      .then(setBatchJob)
      .catch(() => {
        recoveredBatchIdRef.current = null;
        setError('Не удалось восстановить статус фоновой генерации. Обновите страницу или повторите позже.');
      });
  }, [batchJob?.id, storage.workspace?.plan?.activeBatchJobId]);

  useEffect(() => {
    if (!batchJob || ['completed', 'partially_failed', 'failed', 'cancelled', 'expired'].includes(batchJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const updated = await aiApi.getBatch(batchJob.id);
        setBatchJob(updated);
      } catch {
        // A transient polling error should not discard the durable server-side job.
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [batchJob]);

  useEffect(() => {
    if (!batchJob || !result || !['completed', 'partially_failed', 'failed', 'cancelled', 'expired'].includes(batchJob.status)) return;
    if (appliedBatchIdRef.current === batchJob.id) return;
    appliedBatchIdRef.current = batchJob.id;
    const completed = new Map<string, TgPostDraft>();
    let invalidOutputCount = 0;
    for (const item of batchJob.items ?? []) {
      if (item.status !== 'completed' || typeof item.output?.content !== 'string') continue;
      const post = parseBatchPost(item.output.content);
      if (post) completed.set(item.customId, post);
      else invalidOutputCount += 1;
    }
    const next: TgChannelResult = {
      ...result,
      items: result.items.map((item) => {
        const post = completed.get(item.id);
        return post ? { ...item, post, status: item.plannedDate ? 'planned' : 'ready' } : item;
      }),
    };
    setResult(next);
    const workspace = buildWorkspace(settings, next);
    const workspaceWithoutActiveBatch = workspace.plan
      ? { ...workspace, plan: { ...workspace.plan, activeBatchJobId: undefined } }
      : workspace;
    void storage.saveNow(workspaceWithoutActiveBatch, tgChannelWorkspaceMetadata(workspaceWithoutActiveBatch, batchJob.status, {
      ...(storage.metadata ?? {}),
      kind: 'tg_channel',
      contentType: 'tg_channel',
      status: batchJob.status,
      settings,
      sourceSnapshot: next.sourceSnapshot,
      batchJobId: batchJob.id,
    }));
    if (completed.size) toast.success(
      batchJob.status === 'completed'
        ? `Фоновая генерация завершена: готово ${batchJob.completedItems} постов.`
        : `Готово ${batchJob.completedItems} постов, с ошибкой: ${batchJob.failedItems}.`,
    );
    if (invalidOutputCount) {
      toast.error(`Не удалось прочитать ${invalidOutputCount} ${invalidOutputCount === 1 ? 'пост' : 'поста'}. Остальные результаты сохранены.`);
    }
  // The terminal batch is applied once per job update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchJob?.id, batchJob?.status]);

  function buildWorkspace(
    nextSettings: TgChannelSettings,
    nextResult: TgChannelResult | null,
    nextChannelDescription = storage.workspaceRef.current?.channel.description ?? '',
  ) {
    const workspace = workspaceFromLegacyView({
      settings: nextSettings,
      result: nextResult,
      base: storage.workspaceRef.current,
      channelDescription: nextChannelDescription,
    });
    return {
      ...workspace,
      channel: {
        ...workspace.channel,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  function scheduleSettingsSave(nextSettings: TgChannelSettings) {
    const workspace = buildWorkspace(nextSettings, result);
    storage.scheduleSave(workspace, tgChannelWorkspaceMetadata(workspace, 'draft', storage.metadata ?? {}));
  }

  function changeSetting<K extends keyof TgChannelSettings>(key: K, value: TgChannelSettings[K]) {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    scheduleSettingsSave(nextSettings);
  }

  function changeChannelDescription(value: string) {
    setChannelDescription(value);
    if (!validateTgChannelDescription(value).valid) return;
    const workspace = buildWorkspace(settings, result, value);
    storage.scheduleSave(workspace, tgChannelWorkspaceMetadata(workspace, 'draft', storage.metadata ?? {}));
  }

  async function persistResult(nextResult: TgChannelResult, metadata: Record<string, unknown>, forceCreate = false) {
    const resultWithCurrentSettings = { ...nextResult, settings };
    const workspace = buildWorkspace(settings, resultWithCurrentSettings);
    const nextMetadata = tgChannelWorkspaceMetadata(
      workspace,
      typeof metadata.status === 'string' ? metadata.status : 'saved',
      { ...(storage.metadata ?? {}), ...metadata },
    );
    await storage.saveNow(workspace, nextMetadata, { createNew: forceCreate });
  }

  async function executeDescriptionAi(request: DescriptionAiRequest) {
    if (!activeProjectId || descriptionAiAction || descriptionVoiceBusy) return;
    setDescriptionAiAction(request.action);
    setDescriptionAiError('');
    try {
      const response = await aiApi.startWorkflow(request.workflow, {
        projectId: activeProjectId,
        inputs: request.inputs,
        idempotencyKey: request.idempotencyKey,
      });
      const proposed = parseTgChannelDescriptionProposal(response);
      setDescriptionAiProposal({
        current: {
          channelName: String(request.inputs.currentChannelName ?? ''),
          channelDescription: String(request.inputs.currentChannelDescription ?? ''),
        },
        proposed,
        action: request.action,
        response,
      });
      toast.success(response.aiPointsCharged !== undefined
        ? `Вариант готов. Списано ${response.aiPointsCharged} AI-баллов.`
        : 'Вариант готов. Сравните его с текущей версией.');
    } catch (err) {
      const message = isLimitError(err)
        ? LIMIT_MESSAGE
        : err instanceof Error
          ? err.message
          : 'Не удалось подготовить описание канала.';
      setDescriptionAiError(message);
      toast.error(message);
    } finally {
      setDescriptionAiAction(null);
    }
  }

  function handleRunDescriptionAi(action: DescriptionAiAction) {
    if (!activeProjectId || descriptionAiAction || descriptionVoiceBusy) return;
    const workflow = `tg-channel.description.${action}`;
    const inputs = {
      currentChannelName: settings.channelName,
      currentChannelDescription: channelDescription,
      instruction: descriptionAiInstruction.trim(),
    };
    const requestScope = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const request: DescriptionAiRequest = {
      action,
      workflow,
      inputs,
      idempotencyKey: makeAiIdempotencyKey({
        projectId: activeProjectId,
        workflow,
        inputs,
        scope: requestScope,
      }),
    };
    setDescriptionLastRequest(request);
    void executeDescriptionAi(request);
  }

  function handleRetryDescriptionAi() {
    if (!descriptionLastRequest || !activeProjectId) return;
    const retryScope = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const retryRequest = {
      ...descriptionLastRequest,
      idempotencyKey: makeAiIdempotencyKey({
        projectId: activeProjectId,
        workflow: descriptionLastRequest.workflow,
        inputs: descriptionLastRequest.inputs,
        scope: `retry:${retryScope}`,
      }),
    };
    setDescriptionLastRequest(retryRequest);
    void executeDescriptionAi(retryRequest);
  }

  async function handleApplyDescriptionProposal() {
    if (!descriptionAiProposal || descriptionAiAction) return;
    const nextSettings = {
      ...settings,
      channelName: descriptionAiProposal.proposed.channelName,
    };
    const nextDescription = descriptionAiProposal.proposed.channelDescription;
    const workspace = buildWorkspace(nextSettings, result, nextDescription);
    const nextMetadata = tgChannelWorkspaceMetadata(workspace, 'draft', {
      ...(storage.metadata ?? {}),
      lastDescriptionAiAction: {
        action: descriptionAiProposal.action,
        ...descriptionAiProposal.response,
        appliedAt: new Date().toISOString(),
      },
    });

    setSettings(nextSettings);
    setChannelDescription(nextDescription);
    setDescriptionAiProposal(null);
    try {
      await storage.saveNow(workspace, nextMetadata);
      toast.success('AI-вариант применён и сохранён.');
    } catch {
      toast.error('Вариант применён локально, но сохранить его не удалось. Повторите сохранение.');
    }
  }

  async function handleGeneratePlan() {
    if (!hasActiveProject || !activeProjectId) {
      setError('Сначала выберите или создайте проект, чтобы собрать план ТГ-канала.');
      return;
    }
    if (!settings.channelName.trim()) {
      setError('Укажите название канала.');
      return;
    }
    if (!channelDescription.trim()) {
      setError('Добавьте описание канала.');
      return;
    }
    if (!descriptionValidation.valid) {
      setError('Сократите описание канала до 250 символов.');
      return;
    }
    if (result) {
      const ok = window.confirm('Текущий план ТГ-канала будет заменён новой версией. Продолжить?');
      if (!ok) return;
    }

    setGeneratingPlan(true);
    setError('');
    try {
      const workflow = 'tg-channel.plan';
      const inputs = {
        ...settings,
        channelDescription,
        missingSections: missingSections.length ? missingSections.join(', ') : 'Нет',
        sourceSnapshot,
        customInstruction: customInstruction.trim() || null,
      };
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: modelSettings.provider,
        openaiModel: modelSettings.openaiModel,
        claudeModel: modelSettings.claudeModel,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      const parsed = JSON.parse(stripJsonFence(response.content)) as Partial<TgChannelResult>;
      const next = normalizeResult({
        ...parsed,
        settings,
        sourceSnapshot,
        aiPromptVersion: 'tg-channel.plan.v1',
        generatedAt: new Date().toISOString(),
      }, settings);
      const metadata = {
        kind: 'tg_channel',
        contentType: 'tg_channel',
        status: 'generated',
        settings,
        sourceSnapshot,
        workflowRunId: response.workflowRunId,
        workflowStepId: response.workflowStepId,
        artifactId: response.artifactId,
        generationId: response.generationId,
      };
      setResult(next);
      setSelectedId(next.items[0]?.id ?? null);
      await persistResult(next, metadata, Boolean(storage.savedId));
      selectTab('content-plan');
      toast.success(`План ТГ-канала собран. Списано ${response.aiPointsCharged ?? AI_ACTION_COSTS.tg_channel_plan} AI-баллов.`);
    } catch (err) {
      const message = isLimitError(err) ? LIMIT_MESSAGE : 'Не удалось собрать план ТГ-канала.';
      setError(message);
      toast.error(message);
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function runIdeaImproveWorkflow(item: TgPlanItem, instruction: string): Promise<boolean> {
    if (!hasActiveProject || !activeProjectId || !result || busyPostId) return false;
    setBusyPostId(item.id);
    setBusyAction('idea-improve');
    setError('');
    try {
      const workflow = 'tg-channel.idea-improve';
      const context = buildTgChannelGenerationContext(result, item);
      const inputs = {
        ...settings,
        channelDescription: storage.workspaceRef.current?.channel.description ?? '',
        planItem: JSON.stringify(item, null, 2),
        instruction,
        ...context,
        sourceSnapshot: result.sourceSnapshot ?? sourceSnapshot,
      };
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: modelSettings.provider,
        openaiModel: modelSettings.openaiModel,
        claudeModel: modelSettings.claudeModel,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      setIdeaAiProposal({
        itemId: item.id,
        current: item,
        proposed: parseTgChannelIdeaProposal(response.content),
        response,
      });
      toast.success(`Вариант идеи готов. Списано ${response.aiPointsCharged ?? AI_ACTION_COSTS.tg_channel_idea_improve} AI-баллов.`);
      return true;
    } catch (err) {
      const message = isLimitError(err) ? LIMIT_MESSAGE : 'Не удалось улучшить идею. Повторите запрос.';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setBusyPostId(null);
      setBusyAction('');
    }
  }

  async function handleApplyIdeaProposal() {
    if (!ideaAiProposal || !result) return;
    const current = result.items.find((item) => item.id === ideaAiProposal.itemId);
    if (!current) return;
    const next = replaceTgPlanItem(result, applyTgChannelIdeaProposal(current, ideaAiProposal.proposed));
    setIdeaAiProposal(null);
    setResult(next);
    await persistResult(next, {
      status: 'draft',
      lastIdeaAiAction: { itemId: current.id, ...ideaAiProposal.response, appliedAt: new Date().toISOString() },
    });
    toast.success('AI-вариант идеи применён.');
  }

  async function runPostWorkflow(item: TgPlanItem, step: 'post' | 'edit' | 'audio' | 'video', editAction?: string): Promise<boolean> {
    if (!hasActiveProject || !activeProjectId || !result || busyPostId) return false;
    setBusyPostId(item.id);
    setBusyAction(editAction || step);
    setError('');
    try {
      const workflow = `tg-channel.${step}`;
      const generationContext = buildTgChannelGenerationContext(result, item);
      const inputs = {
        ...settings,
        channelDescription: storage.workspaceRef.current?.channel.description ?? '',
        planItem: JSON.stringify(item, null, 2),
        existingPost: item.post ? JSON.stringify(item.post, null, 2) : '',
        editAction,
        ...generationContext,
        sourceSnapshot: result.sourceSnapshot ?? sourceSnapshot,
      };
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: modelSettings.provider,
        openaiModel: modelSettings.openaiModel,
        claudeModel: modelSettings.claudeModel,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      const post = parseTgChannelPostProposal(response.content);
      if (step === 'edit') {
        if (!item.post) throw new Error('Нельзя доработать пост, который ещё не создан.');
        setPostAiProposal({ itemId: item.id, current: item.post, proposed: post, response });
        toast.success(`Вариант доработки готов. Списано ${response.aiPointsCharged ?? AI_ACTION_COSTS.tg_channel_post_edit} AI-баллов.`);
        return true;
      }
      const next: TgChannelResult = {
        ...result,
        items: result.items.map((row) => row.id === item.id ? { ...row, post, status: row.plannedDate ? 'planned' : 'ready' } : row),
      };
      const metadata = {
        kind: 'tg_channel',
        contentType: 'tg_channel',
        status: 'generated',
        settings,
        sourceSnapshot: next.sourceSnapshot,
        lastPostAction: {
          itemId: item.id,
          step,
          editAction,
          workflowRunId: response.workflowRunId,
          workflowStepId: response.workflowStepId,
          artifactId: response.artifactId,
          generationId: response.generationId,
          updatedAt: new Date().toISOString(),
        },
      };
      setResult(next);
      await persistResult(next, metadata);
      toast.success(`Готово. Списано ${response.aiPointsCharged ?? (step === 'post' ? AI_ACTION_COSTS.tg_channel_post : AI_ACTION_COSTS.tg_channel_post_edit)} AI-баллов.`);
      return true;
    } catch (err) {
      const message = isLimitError(err) ? LIMIT_MESSAGE : 'Не удалось выполнить AI-действие с постом.';
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setBusyPostId(null);
      setBusyAction('');
    }
  }

  async function handleApplyPostProposal() {
    if (!postAiProposal || !result) return;
    const item = result.items.find((row) => row.id === postAiProposal.itemId);
    if (!item) return;
    const currentPost = item.post ?? postAiProposal.current;
    const proposed = applyTgChannelPostProposal(currentPost, postAiProposal.proposed);
    const nextItem = { ...item, post: proposed, status: item.plannedDate ? 'planned' as const : proposed.status };
    const next = replaceTgPlanItem(result, nextItem);
    setPostAiProposal(null);
    setResult(next);
    await persistResult(next, {
      status: 'generated',
      lastPostAction: { itemId: item.id, step: 'edit', ...postAiProposal.response, appliedAt: new Date().toISOString() },
    });
    toast.success('AI-доработка применена к посту.');
  }

  async function handleGeneratePostsInBackground() {
    if (!activeProjectId || !result || pendingItems.length < 2) return;
    setError('');
    try {
      const items = pendingItems.map((item) => ({
        customId: item.id,
        title: item.topic,
        inputs: {
          ...settings,
          channelDescription: storage.workspaceRef.current?.channel.description ?? '',
          planItem: JSON.stringify(item, null, 2),
          existingPost: '',
          ...buildTgChannelGenerationContext(result, item),
          sourceSnapshot: result.sourceSnapshot ?? sourceSnapshot,
        },
      }));
      const idempotencyKey = makeAiIdempotencyKey({
        projectId: activeProjectId,
        workflow: 'tg-channel.post.batch',
        inputs: { items },
      });
      const job = await aiApi.createBatch({
        projectId: activeProjectId,
        workflow: 'tg-channel',
        step: 'post',
        items,
        idempotencyKey,
      });
      setBatchJob(job);
      const workspace = buildWorkspace(settings, result);
      if (workspace.plan) {
        const workspaceWithBatch = { ...workspace, plan: { ...workspace.plan, activeBatchJobId: job.id } };
        await storage.saveNow(workspaceWithBatch, tgChannelWorkspaceMetadata(workspaceWithBatch, 'batch_in_progress', {
          ...(storage.metadata ?? {}),
          batchJobId: job.id,
        }));
      }
      toast.success(`Пакет из ${items.length} постов поставлен в фоновую генерацию.`);
    } catch (err) {
      const message = isLimitError(err) ? LIMIT_MESSAGE : 'Не удалось запустить фоновую генерацию постов.';
      setError(message);
      toast.error(message);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success('Скопировано');
  }

  function scheduleManualResultSave(next: TgChannelResult, status = 'draft') {
    setResult(next);
    const workspace = buildWorkspace(settings, next);
    storage.scheduleSave(
      workspace,
      tgChannelWorkspaceMetadata(workspace, status, {
        ...(storage.metadata ?? {}),
        lastManualPlanEditAt: new Date().toISOString(),
      }),
    );
  }

  function handleUpdatePlanItem(nextItem: TgPlanItem) {
    if (!result) return;
    scheduleManualResultSave(replaceTgPlanItem(result, nextItem));
  }

  function handleAddIdea() {
    if (!result) return;
    const id = typeof crypto.randomUUID === 'function'
      ? `tg-manual-${crypto.randomUUID()}`
      : `tg-manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item = createManualTgPlanItem(result.items, id);
    scheduleManualResultSave(appendTgPlanItem(result, item));
    setSelectedId(id);
  }

  function handleDeletePlanItem(id: string) {
    if (!result) return;
    const next = deleteTgPlanItem(result, id);
    scheduleManualResultSave(next.result);
    setSelectedId(next.selectedId);
    toast.success('Идея удалена. Изменение сохранится автоматически.');
  }

  function handleAddToPlan(item: TgPlanItem) {
    if (!item.post || !result) return;
    const planId = storage.workspaceRef.current?.plan?.id ?? `tg-plan-${item.id}`;
    const sourceId = item.contentPlanSourceId ?? buildTgContentPlanSourceId(planId, item.id);
    openAddModal({
      type: 'post',
      title: item.post.title || item.topic,
      content: postFullText(item),
      preview: item.post.text.split('\n').filter(Boolean).slice(0, 2).join('\n'),
      platform: 'Telegram',
      projectId: activeProjectId ?? undefined,
      sourceId,
      onAdded: ({ item: contentPlanItem, created }) => {
        const next: TgChannelResult = {
          ...result,
          items: result.items.map((row) => row.id === item.id ? {
            ...row,
            plannedDate: contentPlanItem.date,
            status: 'planned',
            contentPlanItemId: contentPlanItem.id,
            contentPlanSourceId: sourceId,
          } : row),
        };
        setResult(next);
        void persistResult(next, { kind: 'tg_channel', contentType: 'tg_channel', status: 'planned', settings, sourceSnapshot: next.sourceSnapshot });
        toast.success(created ? 'Пост добавлен в Контент-план.' : 'Связанный пост в Контент-плане обновлён.');
      },
    });
  }

  if (!hasActiveProject) {
    return (
      <div className={s.root}>
        <div className={s.emptyState}>
          <h2>Сначала выберите или создайте проект</h2>
          <p>ТГ-канал собирается на основе стратегии конкретного проекта.</p>
        </div>
      </div>
    );
  }

  if (!storage.loaded || storage.loading) {
    return (
      <div className={s.root}>
        <div className={s.emptyState}>
          <h2>Загружаем ТГ-канал</h2>
          <p>Проверяем сохранённое описание, план и готовые посты проекта.</p>
        </div>
      </div>
    );
  }

  if (storage.loadError) {
    return (
      <div className={s.root}>
        <div className={s.emptyState} role="alert">
          <h2>Не удалось загрузить ТГ-канал</h2>
          <p>{storage.loadError}</p>
          <button className={s.button} type="button" onClick={storage.retryLoad}>Повторить загрузку</button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <section className={s.hero}>
        <div>
          <p className={s.eyebrow}>Контент</p>
          <h1>Упаковка ТГ-канала</h1>
          <p className={s.subtitle}>Соберите первые 10-15 evergreen-постов, которые объясняют экспертность, закрывают сомнения аудитории и ведут к первому шагу.</p>
          <p className={s.description}>Базово Luma IQ готовит текстовые посты. Эту же идею можно использовать как текст, аудио, короткое видео, подкаст или демонстрацию экрана.</p>
        </div>
        <aside className={s.sideCard}>
          <h2>Статус упаковки</h2>
          <div className={s.metric}><span>План</span><b>{result?.items.length ?? 0} постов</b></div>
          <div className={s.metric}><span>Готово</span><b>{readyCount}</b></div>
          <div className={s.metric}><span>В контент-плане</span><b>{plannedCount}</b></div>
          <div className={s.metric}><span>Описание</span><b>{channelDescription.trim() ? 'готово' : 'не заполнено'}</b></div>
        </aside>
      </section>

      {error && <div className={s.error} role="alert">{error}</div>}
      {storage.saveStatus !== 'idle'
        && (descriptionValidation.valid || storage.saveStatus === 'error') && (
        <div className={`${s.saveNotice} ${storage.saveStatus === 'error' ? s.saveNoticeError : ''}`} role="status">
          <span>
            {storage.saveStatus === 'pending' && 'Изменения ожидают автосохранения…'}
            {storage.saveStatus === 'saving' && 'Сохраняем изменения…'}
            {storage.saveStatus === 'saved' && 'Изменения сохранены'}
            {storage.saveStatus === 'error' && (storage.saveError || 'Не удалось сохранить изменения.')}
          </span>
          {storage.saveStatus === 'error' && (
            <button className={s.inlineRetry} type="button" onClick={storage.retrySave}>Повторить</button>
          )}
        </div>
      )}

      <div className={s.tabs} role="tablist" aria-label="Разделы ТГ-канала">
        <button
          ref={(node) => { tabRefs.current.description = node; }}
          id="tg-channel-description-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'description'}
          aria-controls="tg-channel-description-panel"
          tabIndex={tab === 'description' ? 0 : -1}
          className={tab === 'description' ? s.tabActive : s.tab}
          onClick={() => selectTab('description')}
          onKeyDown={handleTabKeyDown}
        >
          Описание канала
        </button>
        <button
          ref={(node) => { tabRefs.current['content-plan'] = node; }}
          id="tg-channel-content-plan-tab"
          type="button"
          role="tab"
          aria-selected={tab === 'content-plan'}
          aria-controls="tg-channel-content-plan-panel"
          tabIndex={tab === 'content-plan' ? 0 : -1}
          className={tab === 'content-plan' ? s.tabActive : s.tab}
          onClick={() => selectTab('content-plan')}
          onKeyDown={handleTabKeyDown}
        >
          Контент-план
          {result?.items.length ? <span className={s.tabCount}>{result.items.length}</span> : null}
        </button>
      </div>

      {tab === 'description' ? (
        <section
          id="tg-channel-description-panel"
          role="tabpanel"
          aria-labelledby="tg-channel-description-tab"
          aria-busy={Boolean(descriptionAiAction)}
          tabIndex={0}
        >
          <TgChannelDescriptionTab
            activeProjectId={activeProjectId!}
            settings={settings}
            channelDescription={channelDescription}
            descriptionValidation={descriptionValidation}
            strategyStatus={strategyStatus}
            strategyLoading={strategyLoading}
            aiInstruction={descriptionAiInstruction}
            aiAction={descriptionAiAction}
            voiceBusy={descriptionVoiceBusy}
            aiError={descriptionAiError}
            proposal={descriptionAiProposal}
            onChannelNameChange={(value) => changeSetting('channelName', value)}
            onChannelDescriptionChange={changeChannelDescription}
            onAiInstructionChange={setDescriptionAiInstruction}
            onVoiceBusyChange={setDescriptionVoiceBusy}
            onRunAi={handleRunDescriptionAi}
            onRetryAi={handleRetryDescriptionAi}
            onApplyProposal={() => void handleApplyDescriptionProposal()}
            onDismissProposal={() => setDescriptionAiProposal(null)}
            onCopy={(value) => void handleCopy(value)}
          />
        </section>
      ) : (
        <section
          id="tg-channel-content-plan-panel"
          role="tabpanel"
          aria-labelledby="tg-channel-content-plan-tab"
          aria-busy={generatingPlan || Boolean(busyPostId)}
          tabIndex={0}
        >
          <TgChannelContentPlanTab
            activeProjectId={activeProjectId!}
            result={result}
            selectedItem={selectedItem}
            pendingItems={pendingItems}
            saved={Boolean(storage.savedId)}
            batchJob={batchJob}
            busyPostId={busyPostId}
            busyAction={busyAction}
            ideaAiProposal={ideaAiProposal}
            postAiProposal={postAiProposal}
            generatingPlan={generatingPlan}
            onSelectItem={setSelectedId}
            onUpdateItem={handleUpdatePlanItem}
            onAddIdea={handleAddIdea}
            onDeleteItem={handleDeletePlanItem}
            onGeneratePostsInBackground={() => void handleGeneratePostsInBackground()}
            onImproveIdea={runIdeaImproveWorkflow}
            onApplyIdeaProposal={() => void handleApplyIdeaProposal()}
            onDismissIdeaProposal={() => setIdeaAiProposal(null)}
            onRunPostWorkflow={runPostWorkflow}
            onApplyPostProposal={() => void handleApplyPostProposal()}
            onDismissPostProposal={() => setPostAiProposal(null)}
            onCopyPost={(item) => void handleCopy(postFullText(item))}
            onAddToPlan={handleAddToPlan}
            onOpenDescription={() => selectTab('description')}
            onGeneratePlan={() => void handleGeneratePlan()}
          />
        </section>
      )}
    </div>
  );
}
