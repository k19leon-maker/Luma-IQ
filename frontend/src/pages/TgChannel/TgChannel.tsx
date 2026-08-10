import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi, AiBatchJob, AiGenerationMode } from '../../api/ai';
import { ContentItem } from '../../api/content.api';
import { projectsApi } from '../../api/projects.api';
import { useContentApi } from '../../hooks/useContentApi';
import { AI_ACTION_COSTS } from '../../config/ai-balance';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useModelStore } from '../../store/model.store';
import { useProjectsStore } from '../../store/projects.store';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import { ContentRevisionComposer } from '../../components/ContentRevisionComposer/ContentRevisionComposer';
import s from './TgChannel.module.css';

type TgPostStatus = 'idea' | 'ready' | 'planned';
type ConversionPoint = 'PDF-гайд' | 'лонгрид' | 'видеоурок' | 'чеклист' | 'бесплатная Zoom-диагностика' | 'разбор ситуации' | 'консультация' | 'другой первый шаг';

interface TgChannelSettings {
  channelName: string;
  channelFor: string;
  conversionPoint: ConversionPoint;
  conversionDetails: string;
}

interface TgPostDraft {
  title: string;
  text: string;
  callToAction: string;
  authorComment: string;
  status: 'ready';
}

interface TgPlanItem {
  id: string;
  number: number;
  role: string;
  clientTask: string;
  topic: string;
  callToAction: string;
  status: TgPostStatus;
  post?: TgPostDraft;
  plannedDate?: string;
}

interface TgChannelResult {
  title: string;
  strategySummary: string;
  items: TgPlanItem[];
  settings: TgChannelSettings;
  sourceSnapshot?: Record<string, unknown>;
  aiPromptVersion?: string;
  generatedAt?: string;
}

interface StrategyStatus {
  key: string;
  label: string;
  filled: boolean;
}

const CONVERSION_OPTIONS: ConversionPoint[] = [
  'PDF-гайд',
  'лонгрид',
  'видеоурок',
  'чеклист',
  'бесплатная Zoom-диагностика',
  'разбор ситуации',
  'консультация',
  'другой первый шаг',
];

const EDIT_ACTIONS = [
  { label: 'Сделать мягче', step: 'edit', cost: AI_ACTION_COSTS.tg_channel_post_edit },
  { label: 'Добавить историю', step: 'edit', cost: AI_ACTION_COSTS.tg_channel_post_edit },
  { label: 'Усилить призыв к действию', step: 'edit', cost: AI_ACTION_COSTS.tg_channel_post_edit },
  { label: 'Сократить', step: 'edit', cost: AI_ACTION_COSTS.tg_channel_post_edit },
  { label: 'Сделать более экспертно', step: 'edit', cost: AI_ACTION_COSTS.tg_channel_post_edit },
  { label: 'Адаптировать под аудио', step: 'audio', cost: AI_ACTION_COSTS.tg_channel_post_audio_adapt },
  { label: 'Сделать сценарий видео', step: 'video', cost: AI_ACTION_COSTS.tg_channel_post_video_script },
] as const;

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

function normalizePlanItem(value: unknown, index: number): TgPlanItem {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const post = data.post && typeof data.post === 'object' ? normalizePost(data.post) : undefined;
  const plannedDate = typeof data.plannedDate === 'string' ? data.plannedDate : undefined;
  const status = plannedDate ? 'planned' : post ? 'ready' : 'idea';

  return {
    id: String(data.id ?? `tg-${index + 1}`),
    number: Number(data.number) || index + 1,
    role: String(data.role ?? 'Пост'),
    clientTask: String(data.clientTask ?? ''),
    topic: String(data.topic ?? ''),
    callToAction: String(data.callToAction ?? ''),
    status,
    post,
    plannedDate,
  };
}

function normalizeResult(value: Partial<TgChannelResult>, fallbackSettings: TgChannelSettings): TgChannelResult {
  return {
    title: value.title || 'План ТГ-канала',
    strategySummary: value.strategySummary || '',
    items: Array.isArray(value.items) ? value.items.slice(0, 15).map(normalizePlanItem) : [],
    settings: value.settings ?? fallbackSettings,
    sourceSnapshot: value.sourceSnapshot,
    aiPromptVersion: value.aiPromptVersion || 'tg-channel.plan.v1',
    generatedAt: value.generatedAt,
  };
}

function resultFromDb(item: ContentItem, fallbackSettings: TgChannelSettings): TgChannelResult | null {
  try {
    return normalizeResult(JSON.parse(item.content) as Partial<TgChannelResult>, fallbackSettings);
  } catch {
    return null;
  }
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

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function postFullText(item: TgPlanItem): string {
  const post = item.post;
  if (!post) return '';
  return [post.text, post.callToAction ? `\n${post.callToAction}` : ''].filter(Boolean).join('\n').trim();
}

export default function TgChannel() {
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const projectName = useProjectsStore((state) => state.projects.find((project) => project.id === state.activeProjectId)?.name ?? 'Проект');
  const hasActiveProject = Boolean(activeProjectId && activeProjectId !== 'default');
  const getModelSettings = useModelStore((state) => state.getSettings);
  const modelSettings = useMemo(() => getModelSettings('tg-channel'), [getModelSettings]);
  const { openAddModal } = useContentPlanStore();
  const { dbItems, loaded, saveItem, updateItem } = useContentApi({ projectId: hasActiveProject ? activeProjectId! : '', type: 'TG_CHANNEL' });

  const [strategyData, setStrategyData] = useState<Record<string, unknown> | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [settings, setSettings] = useState<TgChannelSettings>({
    channelName: '',
    channelFor: '',
    conversionPoint: 'бесплатная Zoom-диагностика',
    conversionDetails: '',
  });
  const [result, setResult] = useState<TgChannelResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingFor, setGeneratingFor] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [generationMode, setGenerationMode] = useState<AiGenerationMode>('now');
  const [batchJob, setBatchJob] = useState<AiBatchJob | null>(null);
  const [error, setError] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');

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
    if (!loaded || dbItems.length === 0) return;
    const latest = dbItems.find((item) => !isDemoContentText(item));
    if (!latest) return;
    const parsed = resultFromDb(latest, settings);
    if (!parsed) return;
    setResult(parsed);
    setSettings(parsed.settings);
    setSavedId(latest.id);
    setSelectedId(parsed.items[0]?.id ?? null);
  }, [dbItems, loaded]);

  const sourceSnapshot = useMemo(() => ({
    projectName,
    strategyData: compactText(strategyData, 3600),
    strategyLoadedAt: strategyData ? new Date().toISOString() : null,
  }), [projectName, strategyData]);

  const strategyStatus = useMemo<StrategyStatus[]>(() => {
    const strategyText = compactText(strategyData, 8000);
    return [
      { key: 'positioning', label: 'Позиционирование', filled: hasAnyStrategyValue(strategyData, ['positioningData', 'positioning', 'finalPositioning', 'selectedPositioning']) },
      { key: 'audience', label: 'Целевая аудитория', filled: hasAnyStrategyValue(strategyData, ['answers', 'audience', 'audienceData', 'chosenSegment', 'targetAudience']) },
      { key: 'utp', label: 'УТП', filled: hasAnyStrategyValue(strategyData, ['utpData', 'utp', 'finalUtp']) || /утп|уникаль|оффер|offer/i.test(strategyText) },
      { key: 'products', label: 'Продукты / лид-магнит', filled: /основной продукт|мини-продукт|лид-магнит|product|productsAndPrices/i.test(strategyText) },
    ];
  }, [strategyData]);

  const missingSections = strategyStatus.filter((item) => !item.filled).map((item) => item.label);
  const selectedItem = result?.items.find((item) => item.id === selectedId) ?? result?.items[0] ?? null;
  const readyCount = result?.items.filter((item) => item.post).length ?? 0;
  const plannedCount = result?.items.filter((item) => item.plannedDate).length ?? 0;
  const pendingItems = result?.items.filter((item) => !item.post) ?? [];

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
    if (!batchJob || !result || !['completed', 'partially_failed'].includes(batchJob.status)) return;
    const completed = new Map(
      (batchJob.items ?? [])
        .filter((item) => item.status === 'completed' && typeof item.output?.content === 'string')
        .map((item) => [item.customId, normalizePost(JSON.parse(stripJsonFence(String(item.output!.content))))]),
    );
    if (!completed.size) return;
    const next: TgChannelResult = {
      ...result,
      items: result.items.map((item) => {
        const post = completed.get(item.id);
        return post ? { ...item, post, status: item.plannedDate ? 'planned' : 'ready' } : item;
      }),
    };
    setResult(next);
    void persistResult(next, {
      kind: 'tg_channel',
      contentType: 'tg_channel',
      status: batchJob.status,
      settings,
      sourceSnapshot: next.sourceSnapshot,
      batchJobId: batchJob.id,
    });
    toast.success(
      batchJob.status === 'completed'
        ? `Фоновая генерация завершена: готово ${batchJob.completedItems} постов.`
        : `Готово ${batchJob.completedItems} постов, с ошибкой: ${batchJob.failedItems}.`,
    );
  // The terminal batch is applied once per job update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchJob?.id, batchJob?.status]);

  async function persistResult(nextResult: TgChannelResult, metadata: Record<string, unknown>, forceCreate = false) {
    const content = JSON.stringify(nextResult, null, 2);
    if (savedId && !forceCreate) {
      await updateItem(savedId, { title: nextResult.title, content, metadata });
      return;
    }
    const saved = await saveItem({
      title: nextResult.title,
      content,
      platform: 'Telegram',
      metadata,
    });
    if (saved) setSavedId(saved.id);
  }

  async function handleFormulateChannelFor() {
    if (!hasActiveProject || !activeProjectId) return;
    setGeneratingFor(true);
    setError('');
    try {
      const workflow = 'tg-channel.setup.channelFor';
      const inputs = { ...settings, sourceSnapshot };
      const response = await aiApi.startWorkflow(workflow, {
        projectId: activeProjectId,
        provider: modelSettings.provider,
        openaiModel: modelSettings.openaiModel,
        claudeModel: modelSettings.claudeModel,
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });
      const parsed = JSON.parse(stripJsonFence(response.content)) as { channelFor?: string };
      if (parsed.channelFor) {
        setSettings((current) => ({ ...current, channelFor: parsed.channelFor!.trim() }));
        toast.success('Описание канала сформулировано');
      }
    } catch (err) {
      const message = isLimitError(err) ? LIMIT_MESSAGE : 'Не удалось сформулировать описание канала.';
      setError(message);
      toast.error(message);
    } finally {
      setGeneratingFor(false);
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
    if (!settings.channelFor.trim()) {
      setError('Заполните поле “Для кого канал” или сформулируйте его с ИИ.');
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
      await persistResult(next, metadata, Boolean(savedId));
      toast.success(`План ТГ-канала собран. Списано ${response.aiPointsCharged ?? AI_ACTION_COSTS.tg_channel_plan} AI-баллов.`);
    } catch (err) {
      const message = isLimitError(err) ? LIMIT_MESSAGE : 'Не удалось собрать план ТГ-канала.';
      setError(message);
      toast.error(message);
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function runPostWorkflow(item: TgPlanItem, step: 'post' | 'edit' | 'audio' | 'video', editAction?: string): Promise<boolean> {
    if (!hasActiveProject || !activeProjectId || !result) return false;
    setBusyPostId(item.id);
    setBusyAction(editAction || step);
    setError('');
    try {
      const workflow = `tg-channel.${step}`;
      const inputs = {
        ...settings,
        planItem: JSON.stringify(item, null, 2),
        existingPost: item.post ? JSON.stringify(item.post, null, 2) : '',
        editAction,
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
      const post = normalizePost(JSON.parse(stripJsonFence(response.content)));
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

  async function handleGeneratePostsInBackground() {
    if (!activeProjectId || !result || pendingItems.length < 2) return;
    setError('');
    try {
      const items = pendingItems.map((item) => ({
        customId: item.id,
        title: item.topic,
        inputs: {
          ...settings,
          planItem: JSON.stringify(item, null, 2),
          existingPost: '',
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

  function handleAddToPlan(item: TgPlanItem) {
    if (!item.post || !result) return;
    openAddModal({
      type: 'post',
      title: item.post.title || item.topic,
      content: postFullText(item),
      preview: item.post.text.split('\n').filter(Boolean).slice(0, 2).join('\n'),
      platform: 'Telegram',
      projectId: activeProjectId ?? undefined,
      sourceId: savedId ?? item.id,
      onAdded: (date) => {
        const next: TgChannelResult = {
          ...result,
          items: result.items.map((row) => row.id === item.id ? { ...row, plannedDate: date, status: 'planned' } : row),
        };
        setResult(next);
        void persistResult(next, { kind: 'tg_channel', contentType: 'tg_channel', status: 'planned', settings, sourceSnapshot: next.sourceSnapshot });
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
          <div className={s.metric}><span>Точка конверсии</span><b>{settings.conversionPoint}</b></div>
        </aside>
      </section>

      {missingSections.length > 0 && (
        <div className={s.warning}>
          Luma IQ может собрать базовый план, но качество будет выше после заполнения разделов: {missingSections.join(', ')}.
        </div>
      )}
      {error && <div className={s.error}>{error}</div>}

      <section className={s.grid}>
        <div className={s.card}>
          <h2>Настройки канала</h2>
          <div className={s.formGrid}>
            <label className={s.field}>
              <span className={s.label}>Название канала</span>
              <input className={s.input} value={settings.channelName} onChange={(e) => setSettings((current) => ({ ...current, channelName: e.target.value }))} placeholder="Имя эксперта / тема канала" />
            </label>
            <label className={s.field}>
              <span className={s.label}>Куда вести аудиторию из постов?</span>
              <select className={s.select} value={settings.conversionPoint} onChange={(e) => setSettings((current) => ({ ...current, conversionPoint: e.target.value as ConversionPoint }))}>
                {CONVERSION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className={`${s.field} ${s.fieldWide}`}>
              <span className={s.label}>Для кого канал</span>
              <textarea className={s.textarea} value={settings.channelFor} onChange={(e) => setSettings((current) => ({ ...current, channelFor: e.target.value }))} placeholder="Короткое описание аудитории и офера канала" />
              <div className={s.inlineActions}>
                <button className={s.ghostButton} type="button" onClick={() => void handleFormulateChannelFor()} disabled={generatingFor}>
                  {generatingFor ? 'Формулирую...' : <>Сформулировать с ИИ<AiWorkflowCost workflow="tg-channel.setup.channelFor" projectId={activeProjectId} /></>}
                </button>
                <span className={s.fieldHint}>AI использует «Целевую аудиторию», «Позиционирование» и «УТП».</span>
              </div>
            </label>
            <div className={`${s.field} ${s.fieldWide}`}>
              <span className={s.label}>Свободная инструкция и идеи</span>
              <VoiceComposer
                value={customInstruction}
                onChange={setCustomInstruction}
                placeholder="Наговорите темы, истории, ограничения или пожелания к плану..."
                textareaClassName={s.textarea}
                rows={4}
              />
              <span className={s.fieldHint}>Инструкция учитывается при создании плана и не запускает публикацию.</span>
            </div>
            <label className={`${s.field} ${s.fieldWide}`}>
              <span className={s.label}>Кратко опишите первый шаг</span>
              <textarea className={s.textarea} value={settings.conversionDetails} onChange={(e) => setSettings((current) => ({ ...current, conversionDetails: e.target.value }))} placeholder="Например: бесплатная Zoom-диагностика на 30 минут..." />
              <span className={s.fieldHint}>Если нет PDF-гайда, видеоурока или лонгрида, первым шагом может быть бесплатная диагностика, консультация или разбор ситуации.</span>
            </label>
          </div>
          <div className={s.actions} style={{ marginTop: 16 }}>
            <button className={s.primaryButton} onClick={() => void handleGeneratePlan()} disabled={generatingPlan}>
              {generatingPlan ? 'Собираю...' : <>Собрать план ТГ-канала<AiWorkflowCost workflow="tg-channel.plan" projectId={activeProjectId} /></>}
            </button>
          </div>
        </div>

        <div className={s.card}>
          <h2>Данные проекта</h2>
          <div className={s.statusList}>
            {strategyStatus.map((item) => (
              <div key={item.key} className={s.statusRow}>
                <span>{item.label}</span>
                <b className={item.filled ? s.statusOk : s.statusMiss}>{item.filled ? 'заполнено' : 'не заполнено'}</b>
              </div>
            ))}
          </div>
          <div className={s.info} style={{ margin: '14px 0 0' }}>
            {strategyLoading ? 'Загружаю стратегию...' : `Проект: ${projectName}`}
          </div>
        </div>
      </section>

      {result ? (
        <section className={s.result}>
          <div className={s.resultTop}>
            <div>
              <h2>{result.title}</h2>
              {result.strategySummary && <p>{result.strategySummary}</p>}
            </div>
            <span className={s.statusBadge}>{savedId ? 'Сохранено автоматически' : 'Сохранится автоматически'}</span>
          </div>

          {pendingItems.length > 0 && (
            <div className={s.batchPanel}>
              <div>
                <h3>Создание постов</h3>
                <p>
                  {generationMode === 'now'
                    ? 'Откройте нужную тему ниже и создайте один пост сразу.'
                    : `Все еще не созданные посты (${pendingItems.length}) будут подготовлены в фоне.`}
                </p>
              </div>
              <div className={s.batchControls}>
                <div className={s.modeControl} aria-label="Режим генерации">
                  <button
                    type="button"
                    className={generationMode === 'now' ? s.modeActive : ''}
                    onClick={() => setGenerationMode('now')}
                  >
                    Сейчас
                  </button>
                  <button
                    type="button"
                    className={generationMode === 'background' ? s.modeActive : ''}
                    onClick={() => setGenerationMode('background')}
                  >
                    Фоновая генерация
                  </button>
                </div>
                {generationMode === 'background' && (
                  <button
                    className={s.primaryButton}
                    type="button"
                    disabled={pendingItems.length < 2 || Boolean(batchJob && !['completed', 'partially_failed', 'failed', 'cancelled', 'expired'].includes(batchJob.status))}
                    onClick={() => void handleGeneratePostsInBackground()}
                  >
                    {batchJob && !['completed', 'partially_failed', 'failed', 'cancelled', 'expired'].includes(batchJob.status)
                      ? `Выполняется: ${batchJob.completedItems} из ${batchJob.totalItems}`
                      : `Создать ${pendingItems.length} постов фоном`}
                  </button>
                )}
              </div>
              {batchJob && (
                <div className={s.batchStatus}>
                  Статус: {batchJob.status}. Готово: {batchJob.completedItems}, с ошибкой: {batchJob.failedItems}.
                </div>
              )}
            </div>
          )}

          <div className={s.tableWrap}>
            <table className={s.planTable}>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Роль поста</th>
                  <th>Задача клиента</th>
                  <th>Тема</th>
                  <th>Призыв к действию</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.number}</td>
                    <td>{item.role}</td>
                    <td>{item.clientTask}</td>
                    <td>{item.topic}</td>
                    <td>{item.callToAction}</td>
                    <td><span className={s.statusBadge}>{item.plannedDate ? `В контент-плане · ${formatDate(item.plannedDate)}` : item.post ? 'Готов' : 'Идея'}</span></td>
                    <td>
                      <button className={s.button} onClick={() => setSelectedId(item.id)}>
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedItem && (
            <article className={s.postCard}>
              <h3>{selectedItem.number}. {selectedItem.topic}</h3>
              <div className={s.info}>Задача клиента: {selectedItem.clientTask}</div>
              {selectedItem.post ? (
                <>
                  <h3>{selectedItem.post.title}</h3>
                  <div className={s.postText}>{selectedItem.post.text}</div>
                  {selectedItem.post.callToAction && <div className={s.comment}>Призыв к действию: {selectedItem.post.callToAction}</div>}
                  {selectedItem.post.authorComment && <div className={s.comment}>{selectedItem.post.authorComment}</div>}
                  <div className={s.postActions}>
                    <button className={s.button} onClick={() => void handleCopy(postFullText(selectedItem))}>Скопировать</button>
                    <button className={s.button} onClick={() => handleAddToPlan(selectedItem)}>В контент-план</button>
                  </div>
                  <div className={s.quickActions} style={{ marginTop: 12 }}>
                    {EDIT_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        className={s.ghostButton}
                        onClick={() => void runPostWorkflow(selectedItem, action.step, action.label)}
                        disabled={busyPostId === selectedItem.id}
                      >
                        {busyPostId === selectedItem.id && busyAction === action.label
                          ? 'Дорабатываю...'
                          : <>{action.label}<AiWorkflowCost workflow={`tg-channel.${action.step}`} projectId={activeProjectId} /></>}
                      </button>
                    ))}
                  </div>
                  <ContentRevisionComposer
                    key={selectedItem.id}
                    projectId={activeProjectId}
                    workflow="tg-channel.edit"
                    isLoading={busyPostId === selectedItem.id && busyAction !== ''}
                    onSubmit={(instruction) => runPostWorkflow(selectedItem, 'edit', instruction)}
                    placeholder="Например: добавьте мою историю, уберите давление и сделайте призыв конкретнее"
                  />
                </>
              ) : (
                <div className={s.postActions}>
                  <button className={s.primaryButton} onClick={() => void runPostWorkflow(selectedItem, 'post')} disabled={busyPostId === selectedItem.id}>
                    {busyPostId === selectedItem.id ? 'Пишу...' : <>Написать пост<AiWorkflowCost workflow="tg-channel.post" projectId={activeProjectId} /></>}
                  </button>
                </div>
              )}
            </article>
          )}
        </section>
      ) : (
        <div className={s.emptyState}>
          <h2>Соберите первые 10-15 постов для упаковки ТГ-канала</h2>
          <p>Они помогут объяснить вашу экспертность, закрыть ключевые страхи аудитории и мягко привести людей к первому шагу.</p>
        </div>
      )}
    </div>
  );
}
