import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { ModelBar } from '../../components/MessageInput/MessageInput';
import { aiApi } from '../../api/ai';
import type { ContentItem } from '../../api/content.api';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import { createdDateRu, isMigrated, markMigrated, metadataString, readLegacyItemsWithProjectFallback } from '../../utils/generatedContentPersistence';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import s from './Articles.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'vc' | 'dzen' | 'habr' | 'linkedin' | 'medium' | 'spark' | 'corporate' | 'seo' | 'telegram';
type ArticleType = 'story' | 'case' | 'analytics' | 'opinion' | 'review' | 'instruction' | 'guide' | 'seoArticle' | 'trends' | 'mistakes' | 'framework' | 'listicle' | 'research' | 'comparison' | 'educational';
type CtaType  = 'telegram' | 'leadmagnet' | 'consultation' | 'subscribe' | 'soft';
type Tone = 'editorial' | 'analytical' | 'journalistic' | 'premium' | 'conversational' | 'provocative' | 'intellectual';
type Depth = 'short' | 'medium' | 'deep' | 'pillar';
type Phase    = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface SavedArticle {
  id:            string;
  dbId?:         string;
  platform:      Platform;
  articleType?:  ArticleType;
  tone?:         Tone;
  depth?:        Depth;
  ctaType:       CtaType;
  botKeyword:    string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
  workflowRunId?: string;
  workflowStepId?: string;
  artifactId?:    string;
  generationId?:  string;
}

interface ArticleItem extends SplitItem {
  platform: Platform;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS: { key: Platform; emoji: string; label: string; desc: string }[] = [
  { key: 'vc',        emoji: '💼', label: 'VC.ru',        desc: 'Аналитика, кейсы, цифры, business tone' },
  { key: 'dzen',      emoji: '📰', label: 'Дзен',         desc: 'Storytelling, эмоциональное удержание, высокая читаемость' },
  { key: 'habr',      emoji: '🧩', label: 'Habr',         desc: 'Системность, глубина, структура, экспертиза' },
  { key: 'linkedin',  emoji: '💼', label: 'LinkedIn',     desc: 'Thought leadership, professional insights, authority' },
  { key: 'medium',    emoji: '✍️', label: 'Medium',       desc: 'Editorial essays, storytelling, intellectual clarity' },
  { key: 'spark',     emoji: '⚡', label: 'Spark',        desc: 'Бизнес-опыт, стартапы, выводы, дискуссии' },
  { key: 'corporate', emoji: '🏢', label: 'Корп. блог',   desc: 'Экспертность бренда, доверие, evergreen-контент' },
  { key: 'seo',       emoji: '🌐', label: 'SEO Blog',     desc: 'Поисковый трафик, структура, FAQ, long-tail запросы' },
  { key: 'telegram',  emoji: '💬', label: 'Telegram',     desc: 'Telegram longread, сильный голос автора, удержание' },
];

const PLATFORM_ICONS: Record<Platform, string> = {
  vc: '💼', dzen: '📰', habr: '🧩', linkedin: '💼', medium: '✍️', spark: '⚡', corporate: '🏢', seo: '🌐', telegram: '💬',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  vc: 'VC.ru',
  dzen: 'Дзен',
  habr: 'Habr',
  linkedin: 'LinkedIn Articles',
  medium: 'Medium',
  spark: 'Spark',
  corporate: 'Корпоративный блог',
  seo: 'SEO Blog',
  telegram: 'Telegram longread',
};

const ARTICLE_TYPE_OPTIONS: { key: ArticleType; label: string }[] = [
  { key: 'story', label: 'История' },
  { key: 'case', label: 'Кейс' },
  { key: 'analytics', label: 'Аналитика' },
  { key: 'opinion', label: 'Opinion' },
  { key: 'review', label: 'Разбор' },
  { key: 'instruction', label: 'Инструкция' },
  { key: 'guide', label: 'Гайд' },
  { key: 'seoArticle', label: 'SEO-статья' },
  { key: 'trends', label: 'Тренды' },
  { key: 'mistakes', label: 'Ошибки' },
  { key: 'framework', label: 'Framework' },
  { key: 'listicle', label: 'Подборка' },
  { key: 'research', label: 'Исследование' },
  { key: 'comparison', label: 'Comparison' },
  { key: 'educational', label: 'Educational' },
];

const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = Object.fromEntries(
  ARTICLE_TYPE_OPTIONS.map((item) => [item.key, item.label]),
) as Record<ArticleType, string>;

const TONE_OPTIONS: { key: Tone; label: string }[] = [
  { key: 'editorial', label: 'Editorial' },
  { key: 'analytical', label: 'Analytical' },
  { key: 'journalistic', label: 'Journalistic' },
  { key: 'premium', label: 'Premium' },
  { key: 'conversational', label: 'Conversational' },
  { key: 'provocative', label: 'Provocative' },
  { key: 'intellectual', label: 'Intellectual' },
];

const DEPTH_OPTIONS: { key: Depth; label: string }[] = [
  { key: 'short', label: 'Short' },
  { key: 'medium', label: 'Medium' },
  { key: 'deep', label: 'Deep' },
  { key: 'pillar', label: 'Pillar content' },
];

interface TopicOption {
  id: string;
  title: string;
  details: string;
  score: number;
  saved: boolean;
}

const FACTURE_HINTS = [
  '1. Что вы видели на практике? Какие кейсы, ошибки и выводы были?',
  '2. Что сейчас происходит у ЦА? Какие страхи, убеждения и ошибки мешают?',
  '3. Какие тренды, конфликты или странности рынка вы замечаете?',
  '4. С чем вы не согласны в рынке и какую авторскую позицию хотите показать?',
  '5. Какой главный вывод и какое действие должны остаться после статьи?',
];

// ─── Storage ──────────────────────────────────────────────────────────────────

function articlesKey(projectId: string) { return `articles_${projectId}`; }

function loadArticles(projectId: string): SavedArticle[] {
  return readLegacyItemsWithProjectFallback<SavedArticle>(articlesKey(projectId), projectId);
}

function isPlatform(value: string): value is Platform {
  return value in PLATFORM_LABELS;
}

function articleFromDb(item: ContentItem): SavedArticle {
  const platformFromMeta = metadataString(item, 'platform', '');
  const platformFromProvider = Object.entries(PLATFORM_LABELS).find(([, label]) => label === item.provider)?.[0] ?? '';
  const platform = isPlatform(platformFromMeta)
    ? platformFromMeta
    : isPlatform(platformFromProvider)
      ? platformFromProvider
      : 'telegram';

  return {
    id: `db-${item.id}`,
    dbId: item.id,
    platform,
    articleType: metadataString(item, 'articleType', 'analytics') as ArticleType,
    tone: metadataString(item, 'tone', 'editorial') as Tone,
    depth: metadataString(item, 'depth', 'deep') as Depth,
    ctaType: metadataString(item, 'ctaType', 'soft') as CtaType,
    botKeyword: metadataString(item, 'botKeyword', ''),
    content: item.content,
    editedContent: '',
    editedTitle: item.title ?? `Статья · ${PLATFORM_LABELS[platform]}`,
    createdAt: createdDateRu(item),
    workflowRunId: metadataString(item, 'workflowRunId', undefined as unknown as string),
    workflowStepId: metadataString(item, 'workflowStepId', undefined as unknown as string),
    artifactId: metadataString(item, 'artifactId', undefined as unknown as string),
    generationId: metadataString(item, 'generationId', undefined as unknown as string),
  };
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ['Настройка', 'Тема и фактура', 'Готовая статья'];
  return (
    <div className={s.stepper}>
      {steps.map((label, i) => {
        const n = i + 1;
        const isDone = n < step;
        const isAct  = n === step;
        return (
          <div key={i} className={s.stepItem}>
            {i > 0 && <div className={s.stepLine} />}
            <div className={`${s.stepDot}${isAct ? ' ' + s.stepDotActive : ''}${isDone ? ' ' + s.stepDotDone : ''}`}>
              {isDone ? '✓' : n}
            </div>
            <span className={`${s.stepLabel}${isAct ? ' ' + s.stepLabelActive : ''}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Articles() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const { openAddModal } = useContentPlanStore();
  const { dbItems, loaded: dbLoaded, saveItem: saveToApi, updateItem: updateInApi } = useContentApi({ projectId: activeProjectId, type: 'ARTICLE' });

  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'articles')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Articles
  const [articles, setArticles]     = useState<SavedArticle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Phase
  const [phase, setPhase] = useState<Phase>('step1');

  // Step 1
  const [platform,    setPlatform]    = useState<Platform>('vc');
  const [articleType, setArticleType] = useState<ArticleType>('analytics');
  const [tone,        setTone]        = useState<Tone>('editorial');
  const [depth,       setDepth]       = useState<Depth>('deep');
  const [ctaType,     setCtaType]     = useState<CtaType>('soft');
  const [botKeyword,  setBotKeyword]  = useState('');

  // Step 2
  const [topics,        setTopics]        = useState<TopicOption[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [topicsWorkflowRunId, setTopicsWorkflowRunId] = useState('');
  const [facture,       setFacture]       = useState('');
  const [inputMode,     setInputMode]     = useState<'text' | 'voice'>('text');
  const voice = useAudioRecorder(
    (text) => setFacture((prev) => prev ? `${prev} ${text}` : text),
    (message) => toast.error(message),
  );

  // Editor unsaved changes
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  // ── Persist ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProjectId || !dbLoaded) return;

    const fromDb = dbItems.map(articleFromDb).filter((article) => !isDemoContentText(article));
    if (fromDb.length > 0) {
      setArticles(fromDb);
      setSelectedId(fromDb[0]?.id ?? null);
      setPhase(fromDb.length ? 'editor' : 'step1');
      return;
    }

    const legacy = loadArticles(activeProjectId).filter((article) => !isDemoContentText(article));
    if (legacy.length > 0 && !isMigrated(activeProjectId, 'articles')) {
      setArticles(legacy);
      setSelectedId(legacy[0]?.id ?? null);
      setPhase('editor');
      legacy.forEach((article) => {
        void saveToApi({
          title: article.editedTitle,
          content: article.editedContent || article.content,
          platform: PLATFORM_LABELS[article.platform],
          metadata: {
            platform: article.platform,
            articleType: article.articleType,
            tone: article.tone,
            depth: article.depth,
            ctaType: article.ctaType,
            botKeyword: article.botKeyword,
            workflowRunId: article.workflowRunId,
            workflowStepId: article.workflowStepId,
            artifactId: article.artifactId,
            generationId: article.generationId,
          },
        });
      });
      markMigrated(activeProjectId, 'articles');
      return;
    }

    setArticles([]);
    setSelectedId(null);
    setPhase('step1');
  }, [activeProjectId, dbItems, dbLoaded, saveToApi]);

  const updateArticles = useCallback((next: SavedArticle[]) => {
    setArticles(next);
  }, []);

  useEffect(() => {
    const entries = Object.entries(editMap);
    if (entries.length === 0) return;
    const timer = window.setTimeout(() => {
      entries.forEach(([articleId, draft]) => {
        const article = articles.find((item) => item.id === articleId);
        if (!article?.dbId) return;
        void updateInApi(article.dbId, { title: draft.title, content: draft.content });
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [articles, editMap, updateInApi]);

  function parseTopics(content: string): TopicOption[] {
    const chunks = content
      .split(/\n(?=\s*(?:\d+[\).\]]|[-*])\s+)/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    const source = chunks.length >= 5 ? chunks : content.split('\n').map((line) => line.trim()).filter((line) => line.length > 20);

    return source.slice(0, 30).map((chunk, index) => {
      const clean = chunk.replace(/^\s*(?:[-*]|\d+[\).\]])\s*/, '').trim();
      const [firstLine, ...rest] = clean.split('\n').map((line) => line.trim()).filter(Boolean);
      const title = (firstLine || clean).replace(/\*\*/g, '').slice(0, 180);
      return {
        id: `topic-${Date.now()}-${index}`,
        title,
        details: rest.join('\n') || clean,
        score: Math.max(58, 96 - Math.floor(index * 1.4)),
        saved: false,
      };
    });
  }

  function updateTopic(id: string, patch: Partial<TopicOption>) {
    setTopics((items) => items.map((topic) => (topic.id === id ? { ...topic, ...patch } : topic)));
  }

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  async function handleGenerateThemes() {
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    setPhase('step2-loading');
    try {
      const seg      = strat.chosenSegment ?? strat.chosenSubsegment ?? '';
      const workflow = 'articles.topic.generate';
      const inputs = {
        articleType: ARTICLE_TYPE_LABELS[articleType],
        platform: PLATFORM_LABELS[platform],
        tone,
        depth,
        selectedSegment: seg || null,
        platformFormat: PLATFORM_OPTIONS.find((p) => p.key === platform)?.desc ?? '',
      };
      const resp = await aiApi.startWorkflow('articles.topic.generate', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });

      const parsed = parseTopics(resp.content);

      if (parsed.length === 0) {
        toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
        return;
      }
      setTopics(parsed);
      setSelectedTheme(parsed[0]?.title ?? '');
      setTopicsWorkflowRunId(resp.workflowRunId);
      if (!resp.validation.ok) {
        toast('Темы сгенерированы, но AI-валидация нашла замечания к формату');
      }
      setFacture('');
    } catch (err) {
      console.error('[Articles] themes AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      return;
    }
    setPhase('step2');
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  async function handleGenerateArticle() {
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    startGenerationTask(activeProjectId, 'articles', 'Пишу статью', selectedTheme || 'Формирую структуру и текст статьи');
    setPhase('generating');
    try {
      const seg      = strat.chosenSegment ?? strat.chosenSubsegment ?? '';
      const selectedTopic = topics.find((topic) => topic.title === selectedTheme);
      const ctaText  = {
        telegram: 'CTA: мягко пригласить в Telegram',
        leadmagnet: `CTA: получить лидмагнит, написав слово «${botKeyword || 'СТАРТ'}»`,
        consultation: 'CTA: записаться на разбор / консультацию',
        subscribe: 'CTA: подписаться на автора',
        soft: 'CTA: мягкий editorial CTA без давления',
      }[ctaType];

      const workflow = 'articles.article.write';
      const inputs = {
        articleType: ARTICLE_TYPE_LABELS[articleType],
        platform: PLATFORM_LABELS[platform],
        tone,
        depth,
        topic: selectedTheme,
        topicDetails: selectedTopic?.details ?? '',
        selectedSegment: seg || null,
        facture,
        cta: ctaText,
        botKeyword,
        topicsWorkflowRunId: topicsWorkflowRunId || null,
      };
      const resp = await aiApi.startWorkflow('articles.article.write', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs,
        idempotencyKey: makeAiIdempotencyKey({ projectId: activeProjectId, workflow, inputs }),
      });

      const content = resp.content.trim();
      if (!content) {
        toast.error('AI вернул пустой текст. Попробуйте сгенерировать статью ещё раз.');
        setPhase('step2');
        return;
      }
      const id    = `art-${Date.now()}`;
      const title = `${selectedTheme.slice(0, 50)}… · ${PLATFORM_LABELS[platform]}`;
      const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const newArticle: SavedArticle = {
        id, platform, articleType, tone, depth, ctaType, botKeyword,
        content, editedContent: '', editedTitle: title, createdAt: now,
        workflowRunId: resp.workflowRunId,
        workflowStepId: resp.workflowStepId,
        artifactId: resp.artifactId,
        generationId: resp.generationId,
      };
      const next = [newArticle, ...articles];
      updateArticles(next);
      setSelectedId(id);
      setPhase('editor');
      void saveToApi({
        title,
        content,
        platform: PLATFORM_LABELS[platform],
        metadata: { platform, articleType, tone, depth, ctaType, botKeyword, workflowRunId: resp.workflowRunId, workflowStepId: resp.workflowStepId, artifactId: resp.artifactId, generationId: resp.generationId },
      }).then((dbItem) => {
        if (!dbItem) return;
        updateArticles(next.map((article) => article.id === id ? { ...article, dbId: dbItem.id } : article));
      });
    } catch (err) {
      console.warn('[Articles] generate AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      setPhase('step2');
    } finally {
      finishGenerationTask(activeProjectId, 'articles');
    }
  }

  // ── Editor helpers ────────────────────────────────────────────────────────────
  function getEditorState(art: SavedArticle) {
    const ov = editMap[art.id];
    return {
      title:   ov?.title   ?? art.editedTitle,
      content: ov?.content ?? (art.editedContent || art.content),
    };
  }

  function setEditorField(artId: string, field: 'title' | 'content', value: string) {
    setEditMap(prev => {
      const art = articles.find(a => a.id === artId)!;
      const cur = prev[artId] ?? { title: art.editedTitle, content: art.editedContent || art.content };
      return { ...prev, [artId]: { ...cur, [field]: value } };
    });
  }

  function handleSave(artId: string) {
    const ov = editMap[artId];
    if (!ov) return;
    const next = articles.map(a =>
      a.id === artId ? { ...a, editedTitle: ov.title, editedContent: ov.content } : a,
    );
    updateArticles(next);
    const article = next.find((a) => a.id === artId);
    if (article?.dbId) {
      void updateInApi(article.dbId, {
        title: ov.title,
        content: ov.content,
        metadata: {
          platform: article.platform,
          articleType: article.articleType,
          tone: article.tone,
          depth: article.depth,
          ctaType: article.ctaType,
          botKeyword: article.botKeyword,
          workflowRunId: article.workflowRunId,
          workflowStepId: article.workflowStepId,
          artifactId: article.artifactId,
          generationId: article.generationId,
        },
      });
    }
    setEditMap(prev => { const n = { ...prev }; delete n[artId]; return n; });
  }

  function handleCopy(artId: string) {
    const art = articles.find(a => a.id === artId);
    if (art) navigator.clipboard.writeText(getEditorState(art).content);
  }

  function handleDownload(artId: string) {
    const art = articles.find(a => a.id === artId);
    if (!art) return;
    const { title, content } = getEditorState(art);
    void exportToDocx(title, content, title || 'article');
  }

  function goToStep1() {
    setPlatform('vc');
    setArticleType('analytics');
    setTone('editorial');
    setDepth('deep');
    setCtaType('soft');
    setBotKeyword('');
    setTopics([]);
    setSelectedTheme('');
    setTopicsWorkflowRunId('');
    setPhase('step1');
  }

  // ── SplitEditor items ─────────────────────────────────────────────────────────
  const splitItems: ArticleItem[] = articles.map(a => ({
    id:       a.id,
    icon:     PLATFORM_ICONS[a.platform],
    title:    a.editedTitle,
    meta:     `${PLATFORM_LABELS[a.platform]} · ${a.createdAt}`,
    preview:  (a.editedContent || a.content).slice(0, 100),
    platform: a.platform,
  }));

  // ── Editor right panel ────────────────────────────────────────────────────────
  function renderEditor(item: ArticleItem | null) {
    if (!item) {
      return (
        <div className={s.emptyEditor}>
          <span className={s.emptyIcon}>📰</span>
          <span className={s.emptyText}>Выберите статью слева</span>
        </div>
      );
    }
    const art            = articles.find(a => a.id === item.id)!;
    const { title, content } = getEditorState(art);
    const hasChanges     = !!editMap[art.id];

    return (
      <div className={s.editorPanel}>
        <div className={s.editorHeader}>
          <input
            className={s.editorTitleInput}
            value={title}
            onChange={e => setEditorField(art.id, 'title', e.target.value)}
          />
          <div className={s.editorMeta}>
            <span className={s.badge}>{PLATFORM_ICONS[art.platform]} {PLATFORM_LABELS[art.platform]}</span>
          </div>
        </div>

        <textarea
          className={s.editorTextarea}
          value={content}
          onChange={e => setEditorField(art.id, 'content', e.target.value)}
        />

        <div className={s.editorActions}>
          <button className={s.actionBtn} onClick={() => handleCopy(art.id)}>Копировать</button>
          <button className={s.actionBtn} onClick={() => { const st = getEditorState(art); openAddModal({ type: 'article', title: st.title, content: st.content, preview: st.content.split('\n').filter(Boolean).slice(0,2).join('\n'), platform: art.platform, projectId: activeProjectId ?? undefined, sourceId: art.id }); }}>
            📅 В контент-план
          </button>
          <button
            className={`${s.actionBtn} ${s.actionBtnPrimary}${!hasChanges ? ' ' + s.actionBtnDisabled : ''}`}
            onClick={() => handleSave(art.id)}
            disabled={!hasChanges}
          >
            Сохранить
          </button>
          <button className={s.actionBtn} onClick={() => handleDownload(art.id)}>Скачать .docx</button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === 'step2-loading') {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>Генерирую и оцениваю темы...</p>
      </div>
    );
  }

  if (phase === 'generating' || generationTask) {
    return (
      <div className={s.loadingScreen}>
        <span className={s.loadingEmoji}>✍️</span>
        <p className={s.loadingText}>{generationTask?.title ?? 'Пишу статью... это займёт несколько секунд'}</p>
        <p className={s.loadingSub}>{generationTask?.detail ?? 'Формирую структуру и блоки статьи'}</p>
      </div>
    );
  }

  // ── Editor ────────────────────────────────────────────────────────────────────
  if (phase === 'editor') {
    return (
      <SplitEditor
        items={splitItems}
        selectedId={selectedId}
        onSelect={setSelectedId}
        renderEditor={renderEditor}
        listTitle="Статьи"
        listHeaderAction={
          <button className={s.newArticleBtn} onClick={goToStep1}>+ Создать</button>
        }
      />
    );
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────────
  if (phase === 'step1') {
    return (
      <div className={s.page}>
        <Stepper step={1} />

        {hasStrategy ? (
          <div className={s.strategyBanner}>
            <span className={s.strategyLabel}>Из стратегии:</span>
            {strat.chosenSegment    && <span className={s.badge}>{strat.chosenSegment}</span>}
            {strat.chosenSubsegment && <span className={s.badge}>{strat.chosenSubsegment}</span>}
          </div>
        ) : (
          <div className={s.warnBanner}>
            <span>⚠️</span>
            <span>
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит SEO-темы
            </span>
          </div>
        )}

        <div className={s.section}>
          <div className={s.sectionTitle}>Тип статьи</div>
          <div className={s.chipGroup}>
            {ARTICLE_TYPE_OPTIONS.map(t => (
              <button
                key={t.key}
                className={`${s.chip}${articleType === t.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setArticleType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Platform */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Площадка</div>
          <div className={s.chipGroup}>
            {PLATFORM_OPTIONS.map(p => (
              <button
                key={p.key}
                className={`${s.chip}${platform === p.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setPlatform(p.key)}
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
          <div className={s.platformDesc}>
            {PLATFORM_OPTIONS.find(p => p.key === platform)?.desc}
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Тон</div>
          <div className={s.chipGroup}>
            {TONE_OPTIONS.map(t => (
              <button
                key={t.key}
                className={`${s.chip}${tone === t.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setTone(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Глубина статьи</div>
          <div className={s.chipGroup}>
            {DEPTH_OPTIONS.map(d => (
              <button
                key={d.key}
                className={`${s.chip}${depth === d.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setDepth(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Призыв к действию</div>
          <div className={s.chipGroup}>
            <button
              className={`${s.chip}${ctaType === 'telegram' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('telegram')}
            >
              📱 Подписка на ТГ канал
            </button>
            <button
              className={`${s.chip}${ctaType === 'leadmagnet' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('leadmagnet')}
            >
              🎁 Лид-магнит в боте
            </button>
            <button
              className={`${s.chip}${ctaType === 'consultation' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('consultation')}
            >
              📞 Консультация
            </button>
            <button
              className={`${s.chip}${ctaType === 'subscribe' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('subscribe')}
            >
              ✉️ Подписка
            </button>
            <button
              className={`${s.chip}${ctaType === 'soft' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('soft')}
            >
              🧭 Soft CTA
            </button>
          </div>
          {ctaType === 'leadmagnet' && (
            <div className={s.botKeywordRow}>
              <span className={s.botKeywordLabel}>Кодовое слово для бота</span>
              <input
                className={s.textInput}
                placeholder="Например: БЛИЗОСТЬ, СТАРТ, ПОМОЩЬ"
                value={botKeyword}
                onChange={e => setBotKeyword(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className={s.btnRow}>
          {articles.length > 0 && (
            <button className={s.secondaryBtn} onClick={() => setPhase('editor')}>
              ← Назад к статьям
            </button>
          )}
          <button className={s.primaryBtn} onClick={() => void handleGenerateThemes()}>
            Сгенерировать темы →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────────
  return (
    <div className={s.page}>
      <Stepper step={2} />

      <div className={s.section}>
        <div className={s.sectionTitle}>Выберите тему статьи</div>
        <div className={s.sectionSub}>
          ИИ предложил {topics.length} тем для «{PLATFORM_LABELS[platform]}» с angle, SEO intent и оценкой потенциала.
        </div>
        <div className={s.themeList}>
          {topics.map((topic) => (
            <div key={topic.id} className={`${s.themeItem}${selectedTheme === topic.title ? ' ' + s.themeItemActive : ''}`}>
              <button className={s.themeRadio} onClick={() => setSelectedTheme(topic.title)}>
                {selectedTheme === topic.title ? '◉' : '○'}
              </button>
              <button
                className={s.themeText}
                style={{ flex: 1, background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }}
                onClick={() => setSelectedTheme(topic.title)}
              >
                <strong>{topic.title}</strong>
                {topic.details && <span style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)' }}>{topic.details.slice(0, 420)}</span>}
              </button>
              <span className={s.badge}>Score {topic.score}</span>
              <button className={s.actionBtn} onClick={() => updateTopic(topic.id, { saved: !topic.saved })}>
                {topic.saved ? 'Сохранена' : 'Сохранить'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Facture */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Фактура</div>
        <div className={s.factureCard}>
          {FACTURE_HINTS.map((hint, i) => (
            <div key={i} className={s.factureHint}>{hint}</div>
          ))}
        </div>

        {voice.isSupported && (
          <div className={s.inputModeRow}>
            <button
              className={`${s.modeBtn}${inputMode === 'text' ? ' ' + s.modeBtnActive : ''}`}
              onClick={() => { setInputMode('text'); if (voice.isRecording) voice.stop(); }}
            >✏️ Текст</button>
            <button
              className={`${s.modeBtn}${inputMode === 'voice' ? ' ' + s.modeBtnActive : ''}`}
              onClick={() => setInputMode('voice')}
            >🎤 Голос</button>
          </div>
        )}

        {inputMode === 'text' ? (
          <textarea
            className={s.factureTextarea}
            placeholder="Расскажите о практике, кейсах, ошибках аудитории, рыночном контексте, спорной позиции, цифрах, примерах и главном выводе статьи..."
            value={facture}
            onChange={e => setFacture(e.target.value)}
          />
        ) : (
          <div className={s.voiceArea}>
            <button
              className={`${s.voiceBtn}${voice.isRecording ? ' ' + s.voiceBtnActive : ''}`}
              onClick={voice.toggle}
              disabled={voice.isTranscribing}
            >
              {voice.isRecording ? '⏹ Остановить запись' : voice.isTranscribing ? 'Распознаём...' : '🎤 Начать запись'}
            </button>
            {facture && <div className={s.voiceTranscript}>{facture}</div>}
          </div>
        )}

        <div className={s.factureCounter}>
          {facture.length} символов{' '}
          {facture.trim().length < 30 && (
            <span className={s.factureCounterWarn}>(минимум 30)</span>
          )}
        </div>
        <ModelBar section="articles" />
      </div>

      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button
          className={s.primaryBtn}
          disabled={facture.trim().length < 30}
          onClick={() => void handleGenerateArticle()}
        >
          Написать статью →
        </button>
      </div>
    </div>
  );
}
