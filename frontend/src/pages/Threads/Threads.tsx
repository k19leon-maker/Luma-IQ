import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi } from '../../api/ai';
import { ContentItem } from '../../api/content.api';
import { projectsApi } from '../../api/projects.api';
import { useContentApi } from '../../hooks/useContentApi';
import { useModelStore } from '../../store/model.store';
import { useProjectsStore } from '../../store/projects.store';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import s from './Threads.module.css';

type ThreadsPostFormat = 'single_post' | 'mini_thread' | 'deep_thread';
type ThreadsStatus = 'draft' | 'approved' | 'published';

interface ThreadItem {
  order: number;
  text: string;
}

interface ThreadsPlanItem {
  dayNumber: number;
  contentType: string;
  topic: string;
  mainIdea: string;
  goal: string;
  format: ThreadsPostFormat;
  ctaType: string;
  funnelRole: string;
}

interface ThreadsPost {
  dayNumber: number;
  title: string;
  format: ThreadsPostFormat;
  contentType: string;
  text: string;
  threadItems: ThreadItem[];
  cta: string;
  authorComment: string;
  status: ThreadsStatus;
}

interface ThreadsSettings {
  goal: string;
  formatMix: string;
  salesIntensity: string;
  tone: string;
}

interface ThreadsResult {
  title: string;
  strategySummary: string;
  contentPlan: ThreadsPlanItem[];
  posts: ThreadsPost[];
  sourceSnapshot?: Record<string, unknown>;
  settings?: ThreadsSettings;
  aiPromptVersion?: string;
  generatedAt?: string;
}

interface StrategyStatus {
  key: string;
  label: string;
  filled: boolean;
}

const GOALS = ['Охваты', 'Вовлечение', 'Прогрев доверия', 'Переход в Telegram', 'Продажа мини-продукта', 'Заявки на консультацию'];
const FORMATS = ['Смешанный план', 'Одиночные посты', 'Мини-треды', 'Глубокие треды'];
const SALES = ['Без продаж', 'Мягкие CTA', 'CTA 2–3 раза в неделю', 'Запуск / активная продажа'];
const TONES = ['Тёплая экспертная', 'Острая и полярная', 'Личная и наблюдательная', 'Практичная', 'Глубокая методологическая'];

const LIMIT_MESSAGE = 'Лимит AI-генераций исчерпан. Вы можете открыть ранее сохранённые Threads-планы, но новая генерация будет доступна после обновления лимитов или смены тарифа.';

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulValue);
  return true;
}

function compactText(value: unknown, max = 1600): string {
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

function parseThreadsResult(raw: string): ThreadsResult {
  const parsed = JSON.parse(stripJsonFence(raw)) as Partial<ThreadsResult>;
  return normalizeResult(parsed);
}

function normalizePost(value: unknown, index: number): ThreadsPost {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const threadItems = Array.isArray(data.threadItems)
    ? data.threadItems.map((item, itemIndex) => {
      const row = item && typeof item === 'object' ? item as unknown as Record<string, unknown> : {};
      return {
        order: Number(row.order) || itemIndex + 1,
        text: String(row.text ?? ''),
      };
    }).filter((item) => item.text.trim())
    : [];

  return {
    dayNumber: Number(data.dayNumber) || index + 1,
    title: String(data.title ?? `День ${index + 1}`),
    format: (['single_post', 'mini_thread', 'deep_thread'].includes(String(data.format)) ? data.format : 'single_post') as ThreadsPostFormat,
    contentType: String(data.contentType ?? 'Threads'),
    text: String(data.text ?? ''),
    threadItems,
    cta: String(data.cta ?? ''),
    authorComment: String(data.authorComment ?? ''),
    status: (['draft', 'approved', 'published'].includes(String(data.status)) ? data.status : 'draft') as ThreadsStatus,
  };
}

function normalizeResult(value: Partial<ThreadsResult>): ThreadsResult {
  const contentPlan = Array.isArray(value.contentPlan)
    ? value.contentPlan.slice(0, 7).map((item, index) => {
      const row = item && typeof item === 'object' ? item as unknown as Record<string, unknown> : {};
      return {
        dayNumber: Number(row.dayNumber) || index + 1,
        contentType: String(row.contentType ?? 'Threads'),
        topic: String(row.topic ?? ''),
        mainIdea: String(row.mainIdea ?? ''),
        goal: String(row.goal ?? ''),
        format: (['single_post', 'mini_thread', 'deep_thread'].includes(String(row.format)) ? row.format : 'single_post') as ThreadsPostFormat,
        ctaType: String(row.ctaType ?? ''),
        funnelRole: String(row.funnelRole ?? ''),
      };
    })
    : [];

  return {
    title: value.title || 'Threads-план на 7 дней',
    strategySummary: value.strategySummary || '',
    contentPlan,
    posts: Array.isArray(value.posts) ? value.posts.slice(0, 7).map(normalizePost) : [],
    sourceSnapshot: value.sourceSnapshot,
    settings: value.settings,
    aiPromptVersion: value.aiPromptVersion || 'threads.plan.v1',
    generatedAt: value.generatedAt,
  };
}

function resultFromDb(item: ContentItem): ThreadsResult | null {
  try {
    return normalizeResult(JSON.parse(item.content) as Partial<ThreadsResult>);
  } catch {
    return null;
  }
}

function isLimitError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'response' in error
    ? String((error as { response?: { data?: { error?: unknown } } }).response?.data?.error ?? '')
    : error instanceof Error ? error.message : String(error ?? '');
  return /лимит|credits|credit|кредит|generation|тариф/i.test(message);
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function postText(post: ThreadsPost): string {
  if (post.threadItems.length > 0) {
    return post.threadItems.map((item) => `${item.order}/${post.threadItems.length}\n${item.text}`).join('\n\n');
  }
  return post.text;
}

function hasAnyStrategyValue(source: Record<string, unknown> | null, keys: string[]): boolean {
  if (!source) return false;
  return keys.some((key) => hasMeaningfulValue(source[key]));
}

function findFirstString(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export default function Threads() {
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const projectName = useProjectsStore((state) => state.projects.find((project) => project.id === state.activeProjectId)?.name ?? 'Проект');
  const hasActiveProject = Boolean(activeProjectId && activeProjectId !== 'default');
  const getModelSettings = useModelStore((state) => state.getSettings);
  const modelSettings = useMemo(() => getModelSettings('threads'), [getModelSettings]);
  const { dbItems, loaded, saveItem, updateItem } = useContentApi({ projectId: hasActiveProject ? activeProjectId! : '', type: 'THREADS' });
  const [strategyData, setStrategyData] = useState<Record<string, unknown> | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);

  const [settings, setSettings] = useState<ThreadsSettings>({
    goal: 'Прогрев доверия',
    formatMix: 'Смешанный план',
    salesIntensity: 'Мягкие CTA',
    tone: 'Тёплая экспертная',
  });
  const [result, setResult] = useState<ThreadsResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'posts'>('plan');
  const [generating, setGenerating] = useState(false);
  const [regeneratingDay, setRegeneratingDay] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setStrategyData(null);
    if (!hasActiveProject || !activeProjectId) return;

    setStrategyLoading(true);
    projectsApi.getStrategy(activeProjectId)
      .then((data) => {
        if (!alive) return;
        const next = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
        setStrategyData(next);
        const projectTone = findFirstString(next, ['tone', 'toneOfVoice', 'communicationTone', 'socialTone']);
        if (projectTone) {
          setSettings((current) => current.tone === projectTone ? current : { ...current, tone: projectTone });
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
    const parsed = resultFromDb(latest);
    if (!parsed) return;
    setResult(parsed);
    setSavedId(latest.id);
    if (parsed.settings) setSettings(parsed.settings);
  }, [dbItems, loaded]);

  const sourceSnapshot = useMemo(() => ({
    projectName,
    strategyData: compactText(strategyData, 3200),
    strategyLoadedAt: strategyData ? new Date().toISOString() : null,
  }), [projectName, strategyData]);

  const strategyStatus = useMemo<StrategyStatus[]>(() => {
    const strategyText = compactText(strategyData, 8000);

    return [
      { key: 'positioning', label: 'Позиционирование', filled: hasAnyStrategyValue(strategyData, ['positioningData', 'positioning', 'finalPositioning', 'selectedPositioning']) },
      { key: 'audience', label: 'Целевая аудитория', filled: hasAnyStrategyValue(strategyData, ['answers', 'audience', 'audienceData', 'chosenSegment', 'targetAudience']) },
      { key: 'utp', label: 'УТП', filled: hasAnyStrategyValue(strategyData, ['utpData', 'utp', 'finalUtp']) || /утп|уникаль|оффер|offer/i.test(strategyText) },
      { key: 'products', label: 'Продукты', filled: /основной продукт|мини-продукт|лид-магнит|product|productsAndPrices/i.test(strategyText) },
      { key: 'tone', label: 'Тональность', filled: hasAnyStrategyValue(strategyData, ['tone', 'toneOfVoice', 'communicationTone', 'socialTone']) || settings.tone !== 'Тёплая экспертная' },
    ];
  }, [settings.tone, strategyData]);

  const missingSections = strategyStatus.filter((item) => !item.filled).map((item) => item.label);

  async function persistResult(nextResult: ThreadsResult, metadata: Record<string, unknown>, forceCreate = false) {
    const content = JSON.stringify(nextResult, null, 2);
    if (savedId && !forceCreate) {
      await updateItem(savedId, { title: nextResult.title, content, metadata });
      return;
    }
    const saved = await saveItem({
      title: nextResult.title,
      content,
      platform: 'Threads',
      metadata,
    });
    if (saved) setSavedId(saved.id);
  }

  async function handleGenerate() {
    if (!hasActiveProject) {
      setError('Сначала выберите или создайте проект, чтобы сгенерировать Threads-план.');
      return;
    }

    if (result) {
      const ok = window.confirm('Текущий Threads-план будет заменён новой версией. Продолжить?');
      if (!ok) return;
    }

    setGenerating(true);
    setError('');
    try {
      const response = await aiApi.startWorkflow('threads.plan.generate', {
        projectId: activeProjectId,
        provider: modelSettings.provider,
        openaiModel: modelSettings.openaiModel,
        claudeModel: modelSettings.claudeModel,
        idempotencyKey: `threads-plan:${activeProjectId}:${Date.now()}`,
        inputs: {
          ...settings,
          missingSections: missingSections.length ? missingSections.join(', ') : 'Нет',
          sourceSnapshot,
        },
      });
      const next = parseThreadsResult(response.content);
      const enriched: ThreadsResult = {
        ...next,
        sourceSnapshot,
        settings,
        aiPromptVersion: 'threads.plan.v1',
        generatedAt: new Date().toISOString(),
      };
      const metadata = {
        kind: 'threads_plan',
        contentType: 'threads',
        status: 'generated',
        sourceSnapshot,
        settings,
        aiPromptVersion: 'threads.plan.v1',
        workflowRunId: response.workflowRunId,
        workflowStepId: response.workflowStepId,
        artifactId: response.artifactId,
        generationId: response.generationId,
      };
      setResult(enriched);
      setActiveTab('plan');
      await persistResult(enriched, metadata);
      toast.success('Threads-план сгенерирован и сохранён');
    } catch (err) {
      const message = isLimitError(err)
        ? LIMIT_MESSAGE
        : 'Не удалось сгенерировать Threads-план. Попробуйте ещё раз. Если ошибка повторится, проверьте лимиты и подключение AI-модели.';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegeneratePost(post: ThreadsPost) {
    if (!hasActiveProject || !result) return;
    setRegeneratingDay(post.dayNumber);
    setError('');
    try {
      const response = await aiApi.startWorkflow('threads.post.regenerate', {
        projectId: activeProjectId!,
        provider: modelSettings.provider,
        openaiModel: modelSettings.openaiModel,
        claudeModel: modelSettings.claudeModel,
        idempotencyKey: `threads-post:${activeProjectId}:${post.dayNumber}:${Date.now()}`,
        inputs: {
          ...settings,
          dayNumber: post.dayNumber,
          existingPost: JSON.stringify(post, null, 2),
          sourceSnapshot: result.sourceSnapshot ?? sourceSnapshot,
          rewriteAction: 'regenerate',
        },
      });
      const nextPost = normalizePost(JSON.parse(stripJsonFence(response.content)), post.dayNumber - 1);
      const nextResult: ThreadsResult = {
        ...result,
        posts: result.posts.map((item) => item.dayNumber === post.dayNumber ? nextPost : item),
        generatedAt: result.generatedAt ?? new Date().toISOString(),
      };
      const metadata = {
        kind: 'threads_plan',
        contentType: 'threads',
        status: 'generated',
        sourceSnapshot: nextResult.sourceSnapshot,
        settings,
        aiPromptVersion: nextResult.aiPromptVersion ?? 'threads.plan.v1',
        lastPostRegeneration: {
          dayNumber: post.dayNumber,
          workflowRunId: response.workflowRunId,
          workflowStepId: response.workflowStepId,
          artifactId: response.artifactId,
          generationId: response.generationId,
          regeneratedAt: new Date().toISOString(),
        },
      };
      setResult(nextResult);
      await persistResult(nextResult, metadata);
      toast.success(`День ${post.dayNumber} перегенерирован`);
    } catch (err) {
      const message = isLimitError(err)
        ? LIMIT_MESSAGE
        : 'Не удалось перегенерировать пост. Попробуйте ещё раз.';
      setError(message);
      toast.error(message);
    } finally {
      setRegeneratingDay(null);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success('Скопировано');
  }

  if (!hasActiveProject) {
    return (
      <div className={s.root}>
        <div className={s.emptyState}>
          <h2>Сначала выберите или создайте проект</h2>
          <p>Сначала выберите или создайте проект, чтобы сгенерировать Threads-план.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <section className={s.hero}>
        <div className={s.heroText}>
          <p className={s.eyebrow}>Контент</p>
          <h1>Threads ИИ</h1>
          <p className={s.subtitle}>Создавайте 7-дневный план постов и веток для Threads на основе стратегии проекта, целевой аудитории, УТП и продуктовой линейки.</p>
          <p className={s.description}>AI учтёт позиционирование, боли и желания аудитории, прошлые решения, ключевые возражения, продукты проекта и тональность коммуникации, чтобы создать не случайные посты, а серию экспертных публикаций для прогрева, вовлечения и мягкого перехода к следующему шагу.</p>
        </div>
        <div className={s.heroActions}>
          <button className={s.primaryBtn} onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? 'Генерирую...' : result ? 'Сгенерировать заново' : 'Сгенерировать Threads-план'}
          </button>
          <span className={s.saveStatus}>{savedId ? 'Сохранено автоматически' : 'После генерации сохранится автоматически'}</span>
          {result?.generatedAt && <span className={s.generatedAt}>Последняя версия: {formatDate(result.generatedAt)}</span>}
        </div>
      </section>

      {missingSections.length > 0 && (
        <div className={s.warning}>
          Некоторые стратегические данные пока не заполнены. AI создаст план на основе доступной информации, но результат будет точнее после заполнения разделов: {missingSections.join(', ')}.
        </div>
      )}
      {error && <div className={s.error}>{error}</div>}

      <section className={s.grid}>
        <div className={s.card}>
          <div className={s.cardHeader}>
            <h2>Данные проекта</h2>
            <span>{strategyLoading ? 'Загружаю...' : projectName}</span>
          </div>
          <div className={s.statusList}>
            {strategyStatus.map((item) => (
              <div key={item.key} className={s.statusRow}>
                <span>{item.label}</span>
                <b className={item.filled ? s.statusOk : s.statusMiss}>{item.filled ? 'заполнено' : 'не заполнено'}</b>
              </div>
            ))}
          </div>
        </div>

        <div className={s.card}>
          <div className={s.cardHeader}>
            <h2>Настройки генерации</h2>
            <span>7 дней фиксировано</span>
          </div>
          <SettingGroup label="Цель контента" options={GOALS} value={settings.goal} onChange={(goal) => setSettings((current) => ({ ...current, goal }))} />
          <SettingGroup label="Формат" options={FORMATS} value={settings.formatMix} onChange={(formatMix) => setSettings((current) => ({ ...current, formatMix }))} />
          <SettingGroup label="Интенсивность продаж" options={SALES} value={settings.salesIntensity} onChange={(salesIntensity) => setSettings((current) => ({ ...current, salesIntensity }))} />
          <SettingGroup label="Тональность" options={TONES} value={settings.tone} onChange={(tone) => setSettings((current) => ({ ...current, tone }))} />
        </div>
      </section>

      {result ? (
        <section className={s.result}>
          <div className={s.resultTop}>
            <div>
              <h2>{result.title}</h2>
              {result.strategySummary && <p>{result.strategySummary}</p>}
            </div>
            <div className={s.tabs}>
              <button className={activeTab === 'plan' ? s.tabActive : ''} onClick={() => setActiveTab('plan')}>План на 7 дней</button>
              <button className={activeTab === 'posts' ? s.tabActive : ''} onClick={() => setActiveTab('posts')}>Готовые посты</button>
            </div>
          </div>

          {activeTab === 'plan' ? (
            <div className={s.tableWrap}>
              <table className={s.planTable}>
                <thead>
                  <tr>
                    <th>День</th>
                    <th>Тип поста</th>
                    <th>Тема</th>
                    <th>Главная мысль</th>
                    <th>Цель</th>
                    <th>Формат</th>
                    <th>CTA</th>
                    <th>Роль в воронке</th>
                  </tr>
                </thead>
                <tbody>
                  {result.contentPlan.map((item) => (
                    <tr key={item.dayNumber}>
                      <td>{item.dayNumber}</td>
                      <td>{item.contentType}</td>
                      <td>{item.topic}</td>
                      <td>{item.mainIdea}</td>
                      <td>{item.goal}</td>
                      <td>{formatLabel(item.format)}</td>
                      <td>{item.ctaType}</td>
                      <td>{item.funnelRole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={s.postsList}>
              {result.posts.map((post) => (
                <article key={post.dayNumber} className={s.postCard}>
                  <div className={s.postHeader}>
                    <div>
                      <span className={s.dayBadge}>День {post.dayNumber}</span>
                      <h3>{post.title}</h3>
                    </div>
                    <div className={s.postMeta}>
                      <span>Тип: {post.contentType}</span>
                      <span>Формат: {formatLabel(post.format)}</span>
                    </div>
                  </div>
                  {post.threadItems.length > 0 ? (
                    <div className={s.threadList}>
                      {post.threadItems.map((item) => (
                        <div key={item.order} className={s.threadItem}>
                          <b>{item.order}/{post.threadItems.length}</b>
                          <p>{item.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={s.postText}>{post.text}</p>
                  )}
                  {post.cta && <div className={s.cta}>CTA: {post.cta}</div>}
                  {post.authorComment && <div className={s.comment}>{post.authorComment}</div>}
                  <div className={s.postActions}>
                    <button onClick={() => void handleCopy(postText(post))}>Скопировать</button>
                    <button onClick={() => void handleRegeneratePost(post)} disabled={regeneratingDay === post.dayNumber}>
                      {regeneratingDay === post.dayNumber ? 'Перегенерирую...' : 'Перегенерировать'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className={s.emptyState}>
          <h2>Пока нет Threads-плана</h2>
          <p>Выберите настройки и запустите генерацию. Просмотр и копирование сохранённых результатов не расходуют лимиты.</p>
        </div>
      )}
    </div>
  );
}

function SettingGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className={s.settingGroup}>
      <div className={s.settingLabel}>{label}</div>
      <div className={s.segmented}>
        {options.map((option) => (
          <button key={option} className={value === option ? s.segmentActive : ''} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatLabel(format: ThreadsPostFormat): string {
  if (format === 'mini_thread') return 'Мини-тред';
  if (format === 'deep_thread') return 'Глубокий тред';
  return 'Одиночный пост';
}
