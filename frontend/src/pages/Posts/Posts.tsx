import { useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
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
}

interface SavedPost {
  id:            string;
  postType:      PostType;
  platform:      Platform;
  theme:         string;
  offer:         Offer;
  keyword:       string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
}

interface PostItem extends SplitItem {
  postType: PostType;
  platform: Platform;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_STRATEGY = 'strategy_answers';

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

const OFFER_LABELS: Record<Offer, string> = {
  lead: 'бесплатный материал',
  mini: 'мини-курс',
  main: 'программу работы',
};

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

// ─── Seed posts ───────────────────────────────────────────────────────────────

function makeSeedPosts(): SavedPost[] {
  return [
    {
      id:           'seed-1',
      postType:     'pain',
      platform:     'telegram',
      theme:        'Вы ссоритесь об одном и том же снова и снова',
      offer:        'lead',
      keyword:      'БЛИЗОСТЬ',
      editedTitle:  'Пост-боль · Telegram',
      editedContent: '',
      createdAt:    '12 апр 2026',
      content:
`Вы ссоритесь об одном и том же уже который год.

Сначала — повышенный голос. Потом — обиженное молчание. Потом — «ладно, забудем». А через две недели — снова.

Дело не в тарелках. Не в деньгах. Не в том, кто прав.

За каждой повторяющейся ссорой стоит одно: оба чувствуют себя невидимыми. Один хочет уважения. Другой — близости. Но оба говорят об этом через претензию, а не через потребность.

Один конкретный шаг: в следующий раз, когда почувствуете раздражение — остановитесь и скажите вслух, что вам на самом деле нужно. Не «ты всегда», а «мне важно».

Если узнали свою ситуацию — напишите БЛИЗОСТЬ в директ.
Я пришлю бесплатный материал.`,
    },
    {
      id:           'seed-2',
      postType:     'insight',
      platform:     'instagram',
      theme:        'Большинство пар ссорятся не из-за проблем',
      offer:        'mini',
      keyword:      'СТАРТ',
      editedTitle:  'Пост-инсайт · Instagram',
      editedContent: '',
      createdAt:    '10 апр 2026',
      content:
`Большинство пар ссорятся не из-за проблем, а из-за того, как они о них говорят.

Мозг воспринимает критику как угрозу. Буквально. Запускается та же реакция, что при физической опасности. Поэтому партнёр «закрывается» — это не упрямство, это защита.

Была клиентка: жаловалась, что муж не слышит её. На сессии выяснилось — она говорила: «Ты никогда не помогаешь». Он слышал: «Ты плохой». И замолкал.

Поменяли формулировку: «Мне сейчас нужна помощь». Муж начал откликаться.

Один вывод: проблема не в партнёре. Проблема в том, как мы доносим своё состояние.

Напишите СТАРТ — пришлю мини-курс.

Ссылка в шапке профиля 👆`,
    },
    {
      id:           'seed-3',
      postType:     'story',
      platform:     'telegram',
      theme:        'Она пришла через 8 лет брака',
      offer:        'main',
      keyword:      'ПОМОЩЬ',
      editedTitle:  'Пост-история · Telegram',
      editedContent: '',
      createdAt:    '8 апр 2026',
      content:
`Ко мне пришла она. 34 года, двое детей, 8 лет в браке. Ситуация: ссорились каждые две-три недели — об одном и том же.

Что происходило: она чувствовала себя одинокой рядом с мужем. Говорила об этом через упрёки. Он уходил в себя. Она злилась сильнее. Он замолкал ещё больше.

Работали с тем, как она выражает потребность в близости. Не «ты не уделяешь мне времени», а «я скучаю по нам». Звучит похоже — действует иначе.

Результат: через три недели написала — «Мы поговорили нормально первый раз за год. Просто поговорили».

Мораль: конфликт — это не про правоту. Это про то, чтобы быть услышанным. И этому можно научиться.

Узнали себя? Напишите ПОМОЩЬ — расскажу о программе работы.`,
    },
  ];
}

// ─── Mock generators ──────────────────────────────────────────────────────────

const MOCK_THEMES: Record<PostType, string[]> = {
  pain: [
    'Вы ссоритесь об одном и том же снова и снова',
    'Он замолкает — ты злишься. Ты злишься — он замолкает',
    'После ссоры вы миритесь. Но ничего не меняется',
    'Ты уже боишься поднимать некоторые темы',
    'Ты любишь его. Но иногда думаешь — может хватит?',
  ],
  insight: [
    'Большинство пар ссорятся не из-за проблем, а из-за того, как они о них говорят',
    'Молчание — это не мир. Это накопленная ярость',
    'Вы думаете, что ссоритесь из-за денег. На самом деле — нет',
    'Тот, кто молчит в конфликте, часто говорит громче',
    'Стремление быть правым — главный враг близости',
  ],
  story: [
    'Она пришла через 8 лет брака и сказала: «Мы чужие»',
    'Они ссорились каждую неделю. Об одном и том же',
    'Он не понимал, почему она плачет. Она не понимала, почему он молчит',
    'Две сессии — и она первый раз за год почувствовала себя услышанной',
    'Пара на грани развода. Что изменилось за месяц работы',
  ],
};

function buildPost(
  postType: PostType,
  platform: Platform,
  theme:    string,
  offer:    Offer,
  keyword:  string,
  facture:  string,
): string {
  const kw          = keyword.trim().toUpperCase() || 'СТАРТ';
  const offerLabel  = OFFER_LABELS[offer];
  const igSuffix    = platform === 'instagram' ? '\n\nСсылка в шапке профиля 👆' : '';
  const hasFacture  = facture.trim().length > 0;

  if (postType === 'pain') {
    return `${theme}.

${hasFacture ? facture.trim() : 'Это знакомо многим, кто приходит ко мне.'}

Что происходит внутри: один чувствует себя невидимым. Другой — отвергнутым. Оба говорят об этом через претензию, а не через потребность.

Один конкретный шаг: когда почувствуете раздражение — остановитесь и скажите вслух, что вам на самом деле нужно. Не «ты всегда», а «мне важно».

Если узнали свою ситуацию — напишите ${kw} в директ.
Я пришлю ${offerLabel}.${igSuffix}`;
  }

  if (postType === 'insight') {
    return `${theme}.

Объяснение: мозг воспринимает критику как угрозу. Запускается та же реакция, что при физической опасности. Поэтому партнёр «закрывается» — это не упрямство, это защита.

${hasFacture ? facture.trim() : 'Была клиентка: жаловалась, что муж не слышит её. Поменяли одну формулировку — и всё изменилось.'}

Один вывод: проблема часто не в том, что происходит, а в том, как мы об этом говорим.

Напишите ${kw} — пришлю ${offerLabel}.${igSuffix}`;
  }

  // story
  return `Ко мне пришла она. ${theme}.

${hasFacture ? facture.trim() : 'Ссорились каждые две недели. Об одном и том же. Мирились. Всё повторялось снова.'}

Работали с тем, как она выражает свои потребности. Не через упрёк — а через состояние. «Я скучаю по нам» вместо «тебе нет до меня дела».

Результат: через три недели написала — «Мы поговорили нормально первый раз за год».

Мораль: конфликт — это про то, чтобы быть услышанным. И этому можно научиться.

Узнали себя? Напишите ${kw} — расскажу про ${offerLabel}.${igSuffix}`;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function postsKey(projectId: string) {
  return `posts_${projectId}`;
}

function loadPosts(projectId: string): SavedPost[] {
  try {
    const raw = localStorage.getItem(postsKey(projectId));
    if (raw) return JSON.parse(raw) as SavedPost[];
  } catch {}
  return makeSeedPosts();
}

function persistPosts(projectId: string, posts: SavedPost[]) {
  localStorage.setItem(postsKey(projectId), JSON.stringify(posts));
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
  const { activeProjectId } = useProjectsStore();

  const [strat] = useState<StrategyData>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_STRATEGY) ?? '{}'); }
    catch { return {}; }
  });
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Posts
  const [posts, setPosts]         = useState<SavedPost[]>(() => loadPosts(activeProjectId));
  const [selectedId, setSelectedId] = useState<string | null>(() => loadPosts(activeProjectId)[0]?.id ?? null);

  // Phase
  const [phase, setPhase] = useState<Phase>(() =>
    loadPosts(activeProjectId).length > 0 ? 'editor' : 'step1',
  );

  // Step 1 form state
  const [platform, setPlatform] = useState<Platform>('telegram');
  const [postType, setPostType] = useState<PostType>('pain');
  const [offer,    setOffer]    = useState<Offer>('lead');
  const [keyword,  setKeyword]  = useState('');

  // Step 2 state
  const [themes,        setThemes]        = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [facture,       setFacture]       = useState('');
  const [inputMode,     setInputMode]     = useState<'text' | 'voice'>('text');
  const [isListening,   setIsListening]   = useState(false);
  const recognitionRef = useRef<any>(null);

  // Editor edit-in-progress (unsaved changes per post id)
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  // ── Persist ──────────────────────────────────────────────────────────────────
  const updatePosts = useCallback((next: SavedPost[]) => {
    setPosts(next);
    persistPosts(activeProjectId, next);
  }, [activeProjectId]);

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  function handleGenerateThemes() {
    setPhase('step2-loading');
    setTimeout(() => {
      const generated = MOCK_THEMES[postType];
      setThemes(generated);
      setSelectedTheme(generated[0] ?? '');
      setFacture('');
      setPhase('step2');
    }, 1200);
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  function handleGeneratePost() {
    setPhase('generating');
    setTimeout(() => {
      const content = buildPost(postType, platform, selectedTheme, offer, keyword, facture);
      const id      = `post-${Date.now()}`;
      const title   = `${TYPE_LABELS[postType]} · ${platform === 'telegram' ? 'Telegram' : 'Instagram'}`;
      const now     = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const newPost: SavedPost = {
        id, postType, platform, theme: selectedTheme,
        offer, keyword, content,
        editedContent: '', editedTitle: title, createdAt: now,
      };
      const next = [newPost, ...posts];
      updatePosts(next);
      setSelectedId(id);
      setPhase('editor');
    }, 1500);
  }

  // ── Voice input ───────────────────────────────────────────────────────────────
  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(' ');
      setFacture(prev => prev ? `${prev} ${t}` : t);
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
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
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${title}.txt`; a.click();
    URL.revokeObjectURL(url);
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
          <button className={s.actionBtn} onClick={() => alert('В контент-план — в разработке')}>В контент-план</button>
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
  if (phase === 'step2-loading' || phase === 'generating') {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>
          {phase === 'step2-loading' ? 'Генерирую темы для поста...' : 'Пишу пост...'}
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

  const voiceAvailable = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

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

        {voiceAvailable && (
          <div className={s.inputModeRow}>
            <button
              className={`${s.modeBtn}${inputMode === 'text' ? ' ' + s.modeBtnActive : ''}`}
              onClick={() => { setInputMode('text'); if (isListening) toggleVoice(); }}
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
              className={`${s.voiceBtn}${isListening ? ' ' + s.voiceBtnActive : ''}`}
              onClick={toggleVoice}
            >
              {isListening ? '⏹ Остановить запись' : '🎤 Начать запись'}
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
