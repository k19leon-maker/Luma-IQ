import { useState, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { aiApi } from '../../api/ai';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { ContentItem } from '../../api/content.api';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import { createdDateRu, isMigrated, markMigrated, metadataString, readLegacyItemsWithProjectFallback } from '../../utils/generatedContentPersistence';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import s from './Posts.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'telegram' | 'instagram';
type PostType = 'pain' | 'insight' | 'story';
type Offer   = 'lead' | 'mini' | 'main';
type Phase   = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
  finalResult?:      string;
  corePains?:        string;
}

interface SavedPost {
  id:            string;
  dbId?:         string;   // ID записи в GeneratedText
  postType:      PostType;
  platform:      Platform;
  theme:         string;
  offer:         Offer;
  keyword:       string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
  workflowRunId?: string;
  workflowStepId?: string;
  artifactId?:    string;
  generationId?:  string;
}

interface PostItem extends SplitItem {
  postType: PostType;
  platform: Platform;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { key: 'telegram'  as Platform, emoji: '💬', label: 'Telegram'   },
  { key: 'instagram' as Platform, emoji: '📱', label: 'Instagram'  },
];

const POST_TYPE_OPTIONS = [
  { key: 'pain'    as PostType, emoji: '😔', label: 'Пост-боль',    desc: 'Описываем ситуацию — читатель узнаёт себя' },
  { key: 'insight' as PostType, emoji: '💡', label: 'Пост-инсайт', desc: 'Неожиданный взгляд на привычную проблему'  },
  { key: 'story'   as PostType, emoji: '📖', label: 'Пост-история', desc: 'Анонимная история клиента до/после'        },
];

const OFFER_OPTIONS = [
  { key: 'lead' as Offer, emoji: '🎁', label: 'Лид-магнит'       },
  { key: 'mini' as Offer, emoji: '⚡', label: 'Мини-продукт'     },
  { key: 'main' as Offer, emoji: '🚀', label: 'Основной продукт' },
];

const TYPE_LABELS: Record<PostType, string> = {
  pain:    'Боль',
  insight: 'Инсайт',
  story:   'История',
};

const TYPE_ICONS: Record<PostType, string> = {
  pain:    '😔',
  insight: '💡',
  story:   '📖',
};

const FACTURE_HINTS = [
  '1. Есть ли реальный случай из практики по этой теме?',
  '2. Что вы обычно говорите клиентам в такой ситуации?',
  '3. Какой инсайт хотите донести?',
  '4. Что изменилось у клиента после работы с вами?',
];

// ─── Storage ──────────────────────────────────────────────────────────────────

function postsKey(projectId: string) {
  return `posts_${projectId}`;
}

function loadPosts(projectId: string): SavedPost[] {
  return readLegacyItemsWithProjectFallback<SavedPost>(postsKey(projectId), projectId);
}

function postFromDb(item: ContentItem): SavedPost {
  const postType = metadataString(item, 'postType', 'pain') as PostType;
  const platform = (item.provider?.toLowerCase().includes('instagram') ? 'instagram' : metadataString(item, 'platform', 'telegram')) as Platform;
  return {
    id: `db-${item.id}`,
    dbId: item.id,
    postType,
    platform,
    theme: metadataString(item, 'theme', item.title ?? 'Пост'),
    offer: metadataString(item, 'offer', 'lead') as Offer,
    keyword: metadataString(item, 'keyword'),
    content: item.content,
    editedContent: item.content,
    editedTitle: item.title ?? 'Пост',
    createdAt: createdDateRu(item),
    workflowRunId: metadataString(item, 'workflowRunId') || undefined,
    workflowStepId: metadataString(item, 'workflowStepId') || undefined,
    artifactId: metadataString(item, 'artifactId') || undefined,
    generationId: metadataString(item, 'generationId') || undefined,
  };
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ['Настройка', 'Тема и фактура', 'Готовый пост'];
  return (
    <div className={s.stepper}>
      {steps.map((label, i) => {
        const n      = i + 1;
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

export default function Posts() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const { openAddModal } = useContentPlanStore();
  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'posts')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const { dbItems, loaded: dbLoaded, saveItem: saveToApi, updateItem: updateInApi } = useContentApi({
    projectId: activeProjectId,
    type: 'POST',
  });

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Posts
  const [posts, setPosts]         = useState<SavedPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId || !dbLoaded) return;
    const fromDb = dbItems.map(postFromDb).filter((post) => !isDemoContentText(post));
    const legacy = loadPosts(activeProjectId).filter((post) => !isDemoContentText(post));
    if (fromDb.length > 0) {
      setPosts(fromDb);
      setSelectedId(fromDb[0]?.id ?? null);
      setPhase('editor');
      return;
    }
    if (legacy.length > 0 && !isMigrated(activeProjectId, 'posts')) {
      setPosts(legacy);
      setSelectedId(legacy[0]?.id ?? null);
      setPhase('editor');
      void Promise.all(legacy.map((post) => saveToApi({
        title: post.editedTitle,
        content: post.editedContent || post.content,
        platform: post.platform === 'telegram' ? 'Telegram' : 'Instagram',
        metadata: {
          postType: post.postType,
          offer: post.offer,
          keyword: post.keyword,
          theme: post.theme,
          workflowRunId: post.workflowRunId,
          workflowStepId: post.workflowStepId,
          artifactId: post.artifactId,
          generationId: post.generationId,
        },
      }))).then(() => markMigrated(activeProjectId, 'posts'));
      return;
    }
    setPosts([]);
    setSelectedId(null);
    setPhase('step1');
  }, [activeProjectId, dbItems, dbLoaded, saveToApi]);

  // Phase
  const [phase, setPhase] = useState<Phase>('step1');

  // Step 1 form state
  const [platform, setPlatform] = useState<Platform>('telegram');
  const [postType, setPostType] = useState<PostType>('pain');
  const [offer,    setOffer]    = useState<Offer>('lead');
  const [keyword,  setKeyword]  = useState('');

  // Step 2 state
  const [themes,        setThemes]        = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [facture,       setFacture]       = useState('');
  const [topicsWorkflowRunId, setTopicsWorkflowRunId] = useState('');
  const [inputMode,     setInputMode]     = useState<'text' | 'voice'>('text');
  const voice = useAudioRecorder(
    (text) => setFacture((prev) => prev ? `${prev} ${text}` : text),
    (message) => toast.error(message),
  );

  // Editor edit-in-progress (unsaved changes per post id)
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  // ── Persist ──────────────────────────────────────────────────────────────────
  const updatePosts = useCallback((next: SavedPost[]) => {
    setPosts(next);
  }, []);

  useEffect(() => {
    const entries = Object.entries(editMap);
    if (entries.length === 0) return;
    const timer = window.setTimeout(() => {
      entries.forEach(([postId, draft]) => {
        const post = posts.find((item) => item.id === postId);
        if (!post?.dbId) return;
        void updateInApi(post.dbId, { title: draft.title, content: draft.content });
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [editMap, posts, updateInApi]);

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  async function handleGenerateThemes() {
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    setPhase('step2-loading');
    const segCtx = strat.chosenSegment
      ? `Сегмент ЦА: ${strat.chosenSegment.split('\n')[0]?.slice(0, 100)}. Подсегмент: ${strat.chosenSubsegment?.split('\n')[0]?.slice(0, 80) ?? ''}.`
      : '';
    const typeLabels: Record<PostType, string> = {
      pain: 'пост про боль клиента и узнавание',
      insight: 'пост-инсайт с новым взглядом',
      story: 'пост-история или кейс',
    };
    try {
      const resp = await aiApi.startWorkflow('posts.topic.generate', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs: {
          platform: platform === 'telegram' ? 'Telegram' : 'Instagram',
          postType: typeLabels[postType],
          goal: offer === 'lead' ? 'продать лид-магнит' : offer === 'mini' ? 'продать мини-продукт' : 'продать основной продукт',
          selectedSegment: segCtx || null,
        },
      });
      const lines = resp.content.split('\n').map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean).slice(0, 5);
      setThemes(lines);
      setSelectedTheme(lines[0] ?? '');
      setTopicsWorkflowRunId(resp.workflowRunId);
      if (!resp.validation.ok) toast.error('AI ответил неидеально, но темы сохранены');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let errorMessage = 'Ошибка соединения с AI';
      if (raw.includes('401')) errorMessage = 'Неверный API ключ';
      else if (raw.includes('429')) errorMessage = 'Превышен лимит запросов — проверьте баланс';
      else if (raw.includes('500')) errorMessage = 'Ошибка сервера AI — попробуйте позже';
      console.error('[AI posts themes]', err);
      toast.error(errorMessage);
      setPhase('step1');
      return;
    }
    setFacture('');
    setPhase('step2');
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  async function handleGeneratePost() {
    if (!activeProjectId) {
      toast.error('Сначала выберите проект');
      return;
    }
    startGenerationTask(activeProjectId, 'posts', 'Пишу пост', selectedTheme || 'Собираю текст поста');
    setPhase('generating');
    const extraCtx = [
      keyword && `Ключевое слово/фраза: "${keyword}".`,
      facture && `Дополнительная фактура от эксперта: "${facture}".`,
      offer && `CTA в конце: призыв к ${offer === 'lead' ? 'лид-магниту' : offer === 'mini' ? 'мини-продукту' : 'основному продукту'}.`,
    ].filter(Boolean).join(' ');
    const typeLabels: Record<PostType, string> = {
      pain: 'пост про боль/проблему клиента и эмоциональное узнавание',
      insight: 'пост-инсайт с новым взглядом и механизмом решения',
      story: 'пост-история/кейс из практики',
    };
    let content: string;
    let workflowMeta: Pick<SavedPost, 'workflowRunId' | 'workflowStepId' | 'artifactId' | 'generationId'> = {};
    try {
      const resp = await aiApi.startWorkflow('posts.post.write', {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs: {
          platform: platform === 'telegram' ? 'Telegram' : 'Instagram',
          postType: typeLabels[postType],
          goal: offer === 'lead' ? 'лид-магнит' : offer === 'mini' ? 'мини-продукт' : 'основной продукт',
          topic: selectedTheme,
          facture,
          keyword,
          cta: extraCtx,
          topicsWorkflowRunId: topicsWorkflowRunId || null,
        },
      });
      content = resp.content;
      workflowMeta = {
        workflowRunId: resp.workflowRunId,
        workflowStepId: resp.workflowStepId,
        artifactId: resp.artifactId,
        generationId: resp.generationId,
      };
      if (!resp.validation.ok) toast.error('AI ответил неидеально, но пост сохранен');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      let errorMessage = 'Ошибка соединения с AI';
      if (raw.includes('401')) errorMessage = 'Неверный API ключ';
      else if (raw.includes('429')) errorMessage = 'Превышен лимит запросов — проверьте баланс';
      else if (raw.includes('500')) errorMessage = 'Ошибка сервера AI — попробуйте позже';
      console.error('[AI posts generate]', err);
      toast.error(errorMessage);
      setPhase('step2');
      finishGenerationTask(activeProjectId, 'posts');
      return;
    }
    const id    = `post-${Date.now()}`;
    const title = `${TYPE_LABELS[postType]} · ${platform === 'telegram' ? 'Telegram' : 'Instagram'}`;
    const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    const newPost: SavedPost = {
      id, postType, platform, theme: selectedTheme,
      offer, keyword, content,
      editedContent: '', editedTitle: title, createdAt: now,
      ...workflowMeta,
    };
    const next = [newPost, ...posts];
    updatePosts(next);
    setSelectedId(id);
    setPhase('editor');
    void saveToApi({
      title, content,
      platform: platform === 'telegram' ? 'Telegram' : 'Instagram',
      metadata: { postType, offer, keyword, theme: selectedTheme, ...workflowMeta },
    }).then((dbItem) => {
      if (!dbItem) return;
      updatePosts([newPost, ...posts].map((p) => (p.id === id ? { ...p, dbId: dbItem.id } : p)));
    });
    finishGenerationTask(activeProjectId, 'posts');
  }

  // ── Editor helpers ────────────────────────────────────────────────────────────
  function getEditorState(post: SavedPost) {
    const ov = editMap[post.id];
    return {
      title:   ov?.title   ?? post.editedTitle,
      content: ov?.content ?? (post.editedContent || post.content),
    };
  }

  function setEditorField(postId: string, field: 'title' | 'content', value: string) {
    setEditMap(prev => {
      const post = posts.find(p => p.id === postId)!;
      const cur  = prev[postId] ?? {
        title:   post.editedTitle,
        content: post.editedContent || post.content,
      };
      return { ...prev, [postId]: { ...cur, [field]: value } };
    });
  }

  function handleSave(postId: string) {
    const ov = editMap[postId];
    if (!ov) return;
    updatePosts(posts.map(p =>
      p.id === postId ? { ...p, editedTitle: ov.title, editedContent: ov.content } : p,
    ));
    setEditMap(prev => { const n = { ...prev }; delete n[postId]; return n; });
    const post = posts.find(p => p.id === postId);
    if (post?.dbId) {
      void updateInApi(post.dbId, { title: ov.title, content: ov.content });
    }
  }

  function handleCopy(postId: string) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    navigator.clipboard.writeText(getEditorState(post).content);
  }

  function handleDownload(postId: string) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const { title, content } = getEditorState(post);
    void exportToDocx(title, content, title || 'post');
  }

  function goToStep1() {
    setPlatform('telegram'); setPostType('pain'); setOffer('lead'); setKeyword('');
    setPhase('step1');
  }

  // ── SplitEditor items ─────────────────────────────────────────────────────────
  const splitItems: PostItem[] = posts.map(p => ({
    id:       p.id,
    icon:     TYPE_ICONS[p.postType],
    title:    p.editedTitle,
    meta:     `${p.platform === 'telegram' ? '💬 Telegram' : '📱 Instagram'} · ${p.createdAt}`,
    preview:  (p.editedContent || p.content).slice(0, 100),
    postType: p.postType,
    platform: p.platform,
  }));

  // ── Editor right panel renderer ───────────────────────────────────────────────
  function renderEditor(item: PostItem | null) {
    if (!item) {
      return (
        <div className={s.emptyEditor}>
          <span className={s.emptyIcon}>✍️</span>
          <span className={s.emptyText}>Выберите пост слева</span>
        </div>
      );
    }
    const post       = posts.find(p => p.id === item.id)!;
    const { title, content } = getEditorState(post);
    const hasChanges = !!editMap[post.id];

    return (
      <div className={s.editorPanel}>
        <div className={s.editorHeader}>
          <input
            className={s.editorTitleInput}
            value={title}
            onChange={e => setEditorField(post.id, 'title', e.target.value)}
          />
          <div className={s.editorMeta}>
            <span className={s.badge}>{TYPE_LABELS[post.postType]}</span>
            <span className={s.badge}>{post.platform === 'telegram' ? '💬 Telegram' : '📱 Instagram'}</span>
            <span className={s.charCount}>{content.length} симв.</span>
          </div>
        </div>

        <textarea
          className={s.editorTextarea}
          value={content}
          onChange={e => setEditorField(post.id, 'content', e.target.value)}
        />

        <div className={s.editorActions}>
          <button className={s.actionBtn} onClick={() => handleCopy(post.id)}>Копировать</button>
          <button className={s.actionBtn} onClick={() => { const st = getEditorState(post); openAddModal({ type: 'post', title: st.title, content: st.content, preview: st.content.split('\n').filter(Boolean).slice(0,2).join('\n'), platform: post.platform === 'telegram' ? 'Telegram' : 'Instagram', projectId: activeProjectId ?? undefined, sourceId: post.id }); }}>📅 В контент-план</button>
          <button
            className={`${s.actionBtn} ${s.actionBtnPrimary}${!hasChanges ? ' ' + s.actionBtnDisabled : ''}`}
            onClick={() => handleSave(post.id)}
            disabled={!hasChanges}
          >
            Сохранить
          </button>
          <button className={s.actionBtn} onClick={() => handleDownload(post.id)}>Скачать</button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === 'step2-loading' || phase === 'generating' || generationTask) {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>
          {generationTask?.title ?? (phase === 'step2-loading' ? 'Генерирую темы для поста...' : 'Пишу пост...')}
        </p>
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
        listTitle="Посты"
        listHeaderAction={
          <button className={s.newPostBtn} onClick={goToStep1}>+ Создать</button>
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
            {strat.finalResult      && <span className={s.badge}>{strat.finalResult.slice(0, 50)}</span>}
          </div>
        ) : (
          <div className={s.warnBanner}>
            <span>⚠️</span>
            <span>
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит качество постов
            </span>
          </div>
        )}

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
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Тип поста</div>
          <div className={s.chipGroup}>
            {POST_TYPE_OPTIONS.map(t => (
              <button
                key={t.key}
                className={`${s.chip}${postType === t.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setPostType(t.key)}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <div className={s.typeDesc}>
            {POST_TYPE_OPTIONS.find(t => t.key === postType)?.desc}
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>К чему ведёт пост</div>
          <div className={s.chipGroup}>
            {OFFER_OPTIONS.map(o => (
              <button
                key={o.key}
                className={`${s.chip}${offer === o.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setOffer(o.key)}
              >
                {o.emoji} {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Кодовое слово</div>
          <input
            className={s.textInput}
            placeholder="Например: БЛИЗОСТЬ, СТАРТ, ПОМОЩЬ"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          <div className={s.inputHint}>Используется в призыве в конце поста</div>
        </div>

        <div className={s.btnRow}>
          {posts.length > 0 && (
            <button className={s.secondaryBtn} onClick={() => setPhase('editor')}>
              ← Назад к постам
            </button>
          )}
          <button className={s.primaryBtn} onClick={handleGenerateThemes}>
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
        <div className={s.sectionTitle}>Выберите тему поста</div>
        <div className={s.sectionSub}>
          ИИ предложил 5 тем для типа «{TYPE_LABELS[postType]}»
        </div>
        <div className={s.themeList}>
          {themes.map((theme, i) => (
            <button
              key={i}
              className={`${s.themeItem}${selectedTheme === theme ? ' ' + s.themeItemActive : ''}`}
              onClick={() => setSelectedTheme(theme)}
            >
              <span className={s.themeRadio}>{selectedTheme === theme ? '◉' : '○'}</span>
              <span className={s.themeText}>«{theme}»</span>
            </button>
          ))}
        </div>
      </div>

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
            >
              ✏️ Текст
            </button>
            <button
              className={`${s.modeBtn}${inputMode === 'voice' ? ' ' + s.modeBtnActive : ''}`}
              onClick={() => setInputMode('voice')}
            >
              🎤 Голос
            </button>
          </div>
        )}

        {inputMode === 'text' ? (
          <textarea
            className={s.factureTextarea}
            placeholder="Расскажите о своём опыте, случае из практики или инсайте..."
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
      </div>

      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button
          className={s.primaryBtn}
          disabled={facture.trim().length < 30}
          onClick={handleGeneratePost}
        >
          Написать пост →
        </button>
      </div>
    </div>
  );
}
