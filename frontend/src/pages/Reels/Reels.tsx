import { useState, useRef, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { aiApi } from '../../api/ai';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import s from '../Posts/Posts.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform  = 'reels' | 'shorts' | 'tiktok' | 'telegram';
type ReelType  = 'tips' | 'story' | 'myth';
type ReelGoal  = 'lead' | 'subscribe' | 'consultation' | 'application' | 'warmup' | 'reach' | 'engagement' | 'sale' | 'telegram' | 'youtube' | 'mini';
type Tone      = 'calm' | 'expert' | 'emotional' | 'provocative' | 'deep' | 'premium';
type Intensity = 'low' | 'medium' | 'high';
type Phase     = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
  finalResult?:      string;
  corePains?:        string;
}

interface SavedReel {
  id:            string;
  dbId?:         string;
  reelType:      ReelType;
  platform:      Platform;
  goal:          ReelGoal;
  tone:          Tone;
  intensity:     Intensity;
  theme:         string;
  hook:          string;
  keyword:       string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
}

interface ReelItem extends SplitItem {
  reelType: ReelType;
  platform: Platform;
}

interface HookOption {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'test';
  score: number;
  saved: boolean;
  liked: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { key: 'reels'    as Platform, emoji: '📱', label: 'Reels'  },
  { key: 'shorts'   as Platform, emoji: '▶️', label: 'Shorts' },
  { key: 'tiktok'   as Platform, emoji: '🎵', label: 'TikTok' },
  { key: 'telegram' as Platform, emoji: '💬', label: 'Telegram' },
];

const REEL_TYPE_OPTIONS = [
  { key: 'tips'  as ReelType, emoji: '💡', label: 'Советы',        desc: '3–5 практических советов по теме' },
  { key: 'story' as ReelType, emoji: '📖', label: 'История',       desc: 'Кейс клиента или история из практики' },
  { key: 'myth'  as ReelType, emoji: '🚫', label: 'Разрушить миф', desc: 'Опровергаем распространённое заблуждение' },
];

const GOAL_OPTIONS = [
  { key: 'lead'         as ReelGoal, emoji: '🎁', label: 'Лидмагнит' },
  { key: 'subscribe'    as ReelGoal, emoji: '➕', label: 'Подписка' },
  { key: 'consultation' as ReelGoal, emoji: '📞', label: 'Консультация' },
  { key: 'application'  as ReelGoal, emoji: '📝', label: 'Заявка' },
  { key: 'warmup'       as ReelGoal, emoji: '🔥', label: 'Прогрев' },
  { key: 'reach'        as ReelGoal, emoji: '📈', label: 'Охваты' },
  { key: 'engagement'   as ReelGoal, emoji: '💬', label: 'Вовлечение' },
  { key: 'sale'         as ReelGoal, emoji: '💸', label: 'Продажа' },
  { key: 'telegram'     as ReelGoal, emoji: '💬', label: 'Telegram' },
  { key: 'youtube'      as ReelGoal, emoji: '▶️', label: 'YouTube' },
  { key: 'mini'         as ReelGoal, emoji: '⚡', label: 'Мини-продукт' },
];

const TONE_OPTIONS = [
  { key: 'calm'        as Tone, label: 'Спокойный' },
  { key: 'expert'      as Tone, label: 'Экспертный' },
  { key: 'emotional'   as Tone, label: 'Эмоциональный' },
  { key: 'provocative' as Tone, label: 'Провокационный' },
  { key: 'deep'        as Tone, label: 'Глубокий' },
  { key: 'premium'     as Tone, label: 'Premium' },
];

const INTENSITY_OPTIONS = [
  { key: 'low'    as Intensity, label: 'Low' },
  { key: 'medium' as Intensity, label: 'Medium' },
  { key: 'high'   as Intensity, label: 'High' },
];

const TYPE_LABELS: Record<ReelType, string> = {
  tips:  'Советы',
  story: 'История',
  myth:  'Миф',
};

const TYPE_ICONS: Record<ReelType, string> = {
  tips:  '💡',
  story: '📖',
  myth:  '🚫',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  reels: 'Instagram Reels',
  shorts: 'YouTube Shorts',
  tiktok: 'TikTok',
  telegram: 'Telegram',
};

const GOAL_LABELS: Record<ReelGoal, string> = {
  lead: 'лидмагнит',
  subscribe: 'подписка',
  consultation: 'консультация',
  application: 'заявка',
  warmup: 'прогрев',
  reach: 'охваты',
  engagement: 'вовлечение',
  sale: 'продажа',
  telegram: 'переход в Telegram',
  youtube: 'переход в YouTube',
  mini: 'мини-продукт',
};

const TONE_LABELS: Record<Tone, string> = {
  calm: 'спокойный',
  expert: 'экспертный',
  emotional: 'эмоциональный',
  provocative: 'провокационный',
  deep: 'глубокий',
  premium: 'premium',
};

const INTENSITY_LABELS: Record<Intensity, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

const FACTURE_HINTS = [
  '1. Что вы реально видели в практике по выбранному хуку?',
  '2. Какие ошибки делает аудитория и почему они повторяются?',
  '3. Какие фразы, мысли или эмоции звучат у клиентов?',
  '4. Что люди обычно пробуют и почему это не срабатывает?',
  '5. Какой главный инсайт должен остаться после Reels?',
];


const MOCK_REEL_CONTENT: Record<ReelType, string> = {
  tips: `3 техники снятия тревоги за 5 минут\n\n[Слайд 1] Дыхание 4-7-8\nВдох 4 сек → задержка 7 → выдох 8. Повтори 3 раза.\n\n[Слайд 2] Метод «5-4-3-2-1»\n5 вещей видишь, 4 слышишь, 3 ощущаешь, 2 чувствуешь запах, 1 вкус.\n\n[Слайд 3] Физическая разрядка\nСожми кулаки на 5 сек — резко разожми. 5 раз.\n\nПодпись: Напиши мне — пришлю памятку с 10 техниками.`,
  story: `История клиентки\n\nОна пришла полгода назад. Ситуация: тревога, страх ошибиться.\n\nЧто работало: не советы — вопросы. «Что произойдёт если вы ошибётесь?» → «Меня уволят» → «И что тогда?» → тишина. Потом: «Наверное, ничего страшного».\n\nРезультат: через 6 сессий — новая работа, другое качество жизни.\n\nМораль: страх — это не правда. Это гипотеза которую можно проверить.`,
  myth: `Миф: к психологу ходят только если «совсем плохо»\n\n🚫 Реальность: ко мне приходят люди которые хотят лучше.\n\nК психологу ходят чтобы:\n— разобраться в отношениях пока они ещё есть\n— понять себя до того как это стало проблемой\n— принять важное решение осознанно\n\nПрофилактика работает. Не ждите когда станет невыносимо.`,
};

// ─── Seed reels ───────────────────────────────────────────────────────────────

function makeSeedReels(): SavedReel[] {
  return [
    {
      id: 'reel-seed-1', reelType: 'tips', platform: 'reels',
      goal: 'lead', tone: 'expert', intensity: 'medium',
      theme: '3 техники снятия тревоги за 5 минут', hook: 'Тревога не всегда просит “успокоиться”. Иногда она просит вернуть себе контроль.', keyword: 'ПОКОЙ',
      editedTitle: 'Советы · Instagram', editedContent: '', createdAt: '12 апр 2026',
      content: MOCK_REEL_CONTENT.tips,
    },
    {
      id: 'reel-seed-2', reelType: 'myth', platform: 'telegram',
      goal: 'mini', tone: 'deep', intensity: 'medium',
      theme: 'Миф: психолог советует что делать', hook: 'Если вы ждете от психолога совет, вы можете пропустить главное.', keyword: 'СТАРТ',
      editedTitle: 'Миф · Telegram', editedContent: '', createdAt: '10 апр 2026',
      content: MOCK_REEL_CONTENT.myth,
    },
  ];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function reelsKey(projectId: string) { return `reels_${projectId}`; }
function loadReels(projectId: string): SavedReel[] {
  try {
    const raw = localStorage.getItem(reelsKey(projectId));
    if (raw) return JSON.parse(raw) as SavedReel[];
  } catch {}
  return makeSeedReels();
}
function persistReels(projectId: string, reels: SavedReel[]) {
  localStorage.setItem(reelsKey(projectId), JSON.stringify(reels));
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Цель', 'Хуки и фактура', 'Готовый сценарий'];
  return (
    <div className={s.stepper}>
      {steps.map((label, i) => {
        const n = i + 1; const isDone = n < step; const isAct = n === step;
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

export default function Reels() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? '');
  const { openAddModal } = useContentPlanStore();
  const { mergedProfile } = useProjectMarketingContext();
  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'reels')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const { saveItem: saveToApi, updateItem: updateInApi } = useContentApi({
    projectId: activeProjectId,
    type: 'REEL',
  });

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  const [reels,      setReels]      = useState<SavedReel[]>(() => loadReels(activeProjectId));
  const [selectedId, setSelectedId] = useState<string | null>(() => loadReels(activeProjectId)[0]?.id ?? null);

  useEffect(() => {
    setReels(loadReels(activeProjectId));
    setSelectedId(loadReels(activeProjectId)[0]?.id ?? null);
    setPhase(loadReels(activeProjectId).length > 0 ? 'editor' : 'step1');
  }, [activeProjectId]); // eslint-disable-line

  const [phase,     setPhase]     = useState<Phase>(() => loadReels(activeProjectId).length > 0 ? 'editor' : 'step1');
  const [platform,  setPlatform]  = useState<Platform>('reels');
  const [reelType,  setReelType]  = useState<ReelType>('tips');
  const [goal,      setGoal]      = useState<ReelGoal>('lead');
  const [tone,      setTone]      = useState<Tone>('expert');
  const [intensity, setIntensity] = useState<Intensity>('medium');
  const [keyword,   setKeyword]   = useState('');

  const [hooks,        setHooks]        = useState<HookOption[]>([]);
  const [selectedHook, setSelectedHook] = useState('');
  const [facture,       setFacture]       = useState('');
  const [inputMode,     setInputMode]     = useState<'text' | 'voice'>('text');
  const [isListening,   setIsListening]   = useState(false);
  const recognitionRef = useRef<any>(null);
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  const updateReels = useCallback((next: SavedReel[]) => {
    setReels(next);
    persistReels(activeProjectId, next);
  }, [activeProjectId]);

  function parseHooks(content: string): HookOption[] {
    const lines = content
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[\).\]]|\*\*)\s*/, '').replace(/\*\*/g, '').trim())
      .filter((line) => line.length > 12)
      .filter((line) => !/^(высокий|средний|тестовые|приоритет|список|группировка|score|оценка)/i.test(line))
      .slice(0, 50);

    return lines.map((text, index) => ({
      id: `hook-${Date.now()}-${index}`,
      text,
      priority: index < 10 ? 'high' : index < 25 ? 'medium' : 'test',
      score: Math.max(62, 96 - Math.floor(index * 1.2)),
      saved: false,
      liked: false,
    }));
  }

  function updateHook(id: string, patch: Partial<HookOption>) {
    setHooks((items) => items.map((hook) => (hook.id === id ? { ...hook, ...patch } : hook)));
  }

  async function handleGenerateHooks(nextTone = tone, nextIntensity = intensity) {
    setPhase('step2-loading');
    const segCtx = strat.chosenSegment ? `Сегмент ЦА: ${strat.chosenSegment.split('\n')[0]?.slice(0, 160)}.` : '';
    const typeLabels: Record<ReelType, string> = {
      tips: 'практический Reels с механизмом решения',
      story: 'Reels-история или кейс',
      myth: 'Reels-разрушение мифа',
    };
    const prompt = `Сгенерируй 30 сильных хуков для Reels Engine в Luma IQ.

Платформа: ${PLATFORM_LABELS[platform]}
Бизнес-цель: ${GOAL_LABELS[goal]}
Формат: ${typeLabels[reelType]}
Тон: ${TONE_LABELS[nextTone]}
Интенсивность триггеров: ${INTENSITY_LABELS[nextIntensity]}
${segCtx}

Требования:
- хуки должны быть привязаны к текущему проекту, эксперту, ЦА, позиционированию, продуктам и воронке;
- не используй нишу психологии, если текущий проект не про психологию;
- каждый хук 1–2 предложения максимум;
- каждый хук должен включать минимум 2 механики: боль, ошибка, скрытый механизм, контраст, идентичность, цена бездействия, tension, curiosity gap;
- без кликбейта, таблоидности, TikTok-кринжа и generic AI language.

Формат ответа:
Высокий приоритет
1. [хук] — score: [0-100]

Средний приоритет
11. [хук] — score: [0-100]

Тестовые
21. [хук] — score: [0-100]

Не объясняй логику.`;
    try {
      const resp = await aiApi.chat({ model: 'chatgpt', section: 'reels', message: prompt, conversationHistory: [], unpackingProfile: mergedProfile as Record<string, string>, projectName });
      const parsed = parseHooks(resp.content);
      if (parsed.length === 0) {
        toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
        setPhase('step1');
        return;
      }
      setHooks(parsed);
      setSelectedHook(parsed[0]?.text ?? '');
      setTone(nextTone);
      setIntensity(nextIntensity);
    } catch {
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      setPhase('step1');
      return;
    }
    setFacture('');
    setPhase('step2');
  }

  async function handleGenerateReel() {
    startGenerationTask(activeProjectId, 'reels', 'Пишу сценарий рилса', selectedHook || 'Собираю сценарий');
    setPhase('generating');
    const segCtx = strat.chosenSegment ? `Сегмент: ${strat.chosenSegment.split('\n')[0]?.slice(0, 160)}.` : '';
    const extraCtx = [keyword && `Ключевое слово для CTA: "${keyword}".`, facture && `Фактура от эксперта: "${facture}".`].filter(Boolean).join(' ');
    const typeLabels: Record<ReelType, string> = {
      tips: 'практический Reels',
      story: 'Reels-история/кейс',
      myth: 'Reels-разрушение мифа',
    };
    const prompt = `Создай полноценный сценарий вертикального видео для Reels Engine в Luma IQ.

Платформа: ${PLATFORM_LABELS[platform]}
Бизнес-цель: ${GOAL_LABELS[goal]}
Формат: ${typeLabels[reelType]}
Тон: ${TONE_LABELS[tone]}
Интенсивность триггеров: ${INTENSITY_LABELS[intensity]}
Выбранный хук: «${selectedHook}»
${segCtx}
${extraCtx}

Перед сценарием проверь достаточность фактуры.
Если фактуры недостаточно для сильного сценария, верни только блок “Нужна фактура” и 5 конкретных уточняющих вопросов.

Если фактуры достаточно, верни готовый результат:
## Заголовок
## Хук
## Сценарий 45–60 секунд по сценам
## Эмоциональные акценты
## CTA
## Подсказки для съемки и удержания

Требования:
- сценарий должен звучать как реальная речь эксперта, а не статья;
- удерживай внимание каждые 5–8 секунд;
- используй конкретные ситуации, ошибки, фразы аудитории и механизм проблемы;
- CTA должен соответствовать цели: ${GOAL_LABELS[goal]};
- не используй мотивационную воду, инфоцыганский тон, generic AI language и TikTok-кринж.

Не объясняй логику. Сразу выдавай готовый результат.`;
    let content: string;
    try {
      const resp = await aiApi.chat({ model: 'chatgpt', section: 'reels', message: prompt, conversationHistory: [], unpackingProfile: mergedProfile as Record<string, string>, projectName });
      content = resp.content;
    } catch {
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      setPhase('step2');
      finishGenerationTask(activeProjectId, 'reels');
      return;
    }
    const id    = `reel-${Date.now()}`;
    const title = `${TYPE_LABELS[reelType]} · ${PLATFORM_LABELS[platform]}`;
    const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    const newReel: SavedReel = { id, reelType, platform, goal, tone, intensity, theme: selectedHook, hook: selectedHook, keyword, content, editedContent: '', editedTitle: title, createdAt: now };
    const next = [newReel, ...reels];
    updateReels(next);
    setSelectedId(id);
    setPhase('editor');
    void saveToApi({ title, content, platform: PLATFORM_LABELS[platform], metadata: { reelType, goal, tone, intensity, keyword, hook: selectedHook } })
      .then((dbItem) => { if (!dbItem) return; updateReels([newReel, ...reels].map((r) => (r.id === id ? { ...r, dbId: dbItem.id } : r))); });
    finishGenerationTask(activeProjectId, 'reels');
  }

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e: any) => { const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(' '); setFacture(prev => prev ? `${prev} ${t}` : t); };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec; rec.start(); setIsListening(true);
  }

  function getEditorState(reel: SavedReel) {
    const ov = editMap[reel.id];
    return { title: ov?.title ?? reel.editedTitle, content: ov?.content ?? (reel.editedContent || reel.content) };
  }

  function setEditorField(reelId: string, field: 'title' | 'content', value: string) {
    setEditMap(prev => {
      const reel = reels.find(r => r.id === reelId)!;
      const cur  = prev[reelId] ?? { title: reel.editedTitle, content: reel.editedContent || reel.content };
      return { ...prev, [reelId]: { ...cur, [field]: value } };
    });
  }

  function handleSave(reelId: string) {
    const ov = editMap[reelId]; if (!ov) return;
    updateReels(reels.map(r => r.id === reelId ? { ...r, editedTitle: ov.title, editedContent: ov.content } : r));
    setEditMap(prev => { const n = { ...prev }; delete n[reelId]; return n; });
    const reel = reels.find(r => r.id === reelId);
    if (reel?.dbId) void updateInApi(reel.dbId, { title: ov.title, content: ov.content });
  }

  function handleCopy(reelId: string) {
    const reel = reels.find(r => r.id === reelId); if (!reel) return;
    navigator.clipboard.writeText(getEditorState(reel).content);
  }

  function handleDownload(reelId: string) {
    const reel = reels.find(r => r.id === reelId); if (!reel) return;
    const { title, content } = getEditorState(reel);
    void exportToDocx(title, content, title || 'reel');
  }

  function goToStep1() {
    setPlatform('reels');
    setReelType('tips');
    setGoal('lead');
    setTone('expert');
    setIntensity('medium');
    setKeyword('');
    setHooks([]);
    setSelectedHook('');
    setPhase('step1');
  }

  const splitItems: ReelItem[] = reels.map(r => ({
    id: r.id, icon: TYPE_ICONS[r.reelType], title: r.editedTitle,
    meta: `${PLATFORM_LABELS[r.platform] ?? 'Reels'} · ${r.createdAt}`,
    preview: (r.editedContent || r.content).slice(0, 100),
    reelType: r.reelType, platform: r.platform,
  }));

  function renderEditor(item: ReelItem | null) {
    if (!item) {
      return <div className={s.emptyEditor}><span className={s.emptyIcon}>🎬</span><span className={s.emptyText}>Выберите рилс слева</span></div>;
    }
    const reel = reels.find(r => r.id === item.id)!;
    const { title, content } = getEditorState(reel);
    const hasChanges = !!editMap[reel.id];
    return (
      <div className={s.editorPanel}>
        <div className={s.editorHeader}>
          <input className={s.editorTitleInput} value={title} onChange={e => setEditorField(reel.id, 'title', e.target.value)} />
          <div className={s.editorMeta}>
            <span className={s.badge}>{TYPE_LABELS[reel.reelType]}</span>
            <span className={s.badge}>{PLATFORM_LABELS[reel.platform] ?? 'Reels'}</span>
            <span className={s.charCount}>{content.length} симв.</span>
          </div>
        </div>
        <textarea className={s.editorTextarea} value={content} onChange={e => setEditorField(reel.id, 'content', e.target.value)} />
        <div className={s.editorActions}>
          <button className={s.actionBtn} onClick={() => handleCopy(reel.id)}>Копировать</button>
          <button className={s.actionBtn} onClick={() => { const st = getEditorState(reel); openAddModal({ type: 'reel', title: st.title, content: st.content, preview: st.content.split('\n').filter(Boolean).slice(0, 2).join('\n'), platform: PLATFORM_LABELS[reel.platform] ?? 'Reels', projectId: activeProjectId ?? undefined, sourceId: reel.id }); }}>📅 В контент-план</button>
          <button className={`${s.actionBtn} ${s.actionBtnPrimary}${!hasChanges ? ' ' + s.actionBtnDisabled : ''}`} onClick={() => handleSave(reel.id)} disabled={!hasChanges}>Сохранить</button>
          <button className={s.actionBtn} onClick={() => handleDownload(reel.id)}>Скачать</button>
        </div>
      </div>
    );
  }

  if (phase === 'step2-loading' || phase === 'generating' || generationTask) {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>{generationTask?.title ?? (phase === 'step2-loading' ? 'Генерирую и ранжирую хуки...' : 'Пишу сценарий...')}</p>
      </div>
    );
  }

  if (phase === 'editor') {
    return (
      <SplitEditor
        items={splitItems} selectedId={selectedId} onSelect={setSelectedId}
        renderEditor={renderEditor} listTitle="Рилсы"
        listHeaderAction={<button className={s.newPostBtn} onClick={goToStep1}>+ Создать</button>}
      />
    );
  }

  const voiceAvailable = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

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
            <span>Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит качество рилсов</span>
          </div>
        )}
        <div className={s.section}>
          <div className={s.sectionTitle}>Площадка</div>
          <div className={s.chipGroup}>
            {PLATFORM_OPTIONS.map(p => (
              <button key={p.key} className={`${s.chip}${platform === p.key ? ' ' + s.chipActive : ''}`} onClick={() => setPlatform(p.key)}>{p.emoji} {p.label}</button>
            ))}
          </div>
        </div>
        <div className={s.section}>
          <div className={s.sectionTitle}>Формат рилса</div>
          <div className={s.chipGroup}>
            {REEL_TYPE_OPTIONS.map(t => (
              <button key={t.key} className={`${s.chip}${reelType === t.key ? ' ' + s.chipActive : ''}`} onClick={() => setReelType(t.key)}>{t.emoji} {t.label}</button>
            ))}
          </div>
          <div className={s.typeDesc}>{REEL_TYPE_OPTIONS.find(t => t.key === reelType)?.desc}</div>
        </div>
        <div className={s.section}>
          <div className={s.sectionTitle}>Цель Reels</div>
          <div className={s.chipGroup}>
            {GOAL_OPTIONS.map(o => (
              <button key={o.key} className={`${s.chip}${goal === o.key ? ' ' + s.chipActive : ''}`} onClick={() => setGoal(o.key)}>{o.emoji} {o.label}</button>
            ))}
          </div>
        </div>
        <div className={s.section}>
          <div className={s.sectionTitle}>Тон</div>
          <div className={s.chipGroup}>
            {TONE_OPTIONS.map(o => (
              <button key={o.key} className={`${s.chip}${tone === o.key ? ' ' + s.chipActive : ''}`} onClick={() => setTone(o.key)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className={s.section}>
          <div className={s.sectionTitle}>Интенсивность триггеров</div>
          <div className={s.chipGroup}>
            {INTENSITY_OPTIONS.map(o => (
              <button key={o.key} className={`${s.chip}${intensity === o.key ? ' ' + s.chipActive : ''}`} onClick={() => setIntensity(o.key)}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className={s.section}>
          <div className={s.sectionTitle}>Кодовое слово</div>
          <input className={s.textInput} placeholder="Например: ПОКОЙ, СТАРТ, ПОМОЩЬ" value={keyword} onChange={e => setKeyword(e.target.value)} />
          <div className={s.inputHint}>Используется в призыве в конце рилса</div>
        </div>
        <div className={s.btnRow}>
          {reels.length > 0 && <button className={s.secondaryBtn} onClick={() => setPhase('editor')}>← Назад к рилсам</button>}
          <button className={s.primaryBtn} onClick={() => handleGenerateHooks()}>Сгенерировать хуки →</button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Stepper step={2} />
      <div className={s.section}>
        <div className={s.sectionTitle}>Выберите хук</div>
        <div className={s.sectionSub}>ИИ предложил {hooks.length} хуков для цели «{GOAL_LABELS[goal]}». Выберите один, сохраните удачные или перегенерируйте под другой тон.</div>
        <div className={s.chipGroup} style={{ marginBottom: 14 }}>
          <button className={s.chip} onClick={() => handleGenerateHooks('provocative', 'high')}>Сделать жестче</button>
          <button className={s.chip} onClick={() => handleGenerateHooks('calm', 'low')}>Сделать спокойнее</button>
          <button className={s.chip} onClick={() => handleGenerateHooks(tone, intensity)}>Regenerate</button>
        </div>
        <div className={s.themeList}>
          {hooks.map((hook) => (
            <div key={hook.id} className={`${s.themeItem}${selectedHook === hook.text ? ' ' + s.themeItemActive : ''}`}>
              <button className={s.themeRadio} onClick={() => setSelectedHook(hook.text)}>{selectedHook === hook.text ? '◉' : '○'}</button>
              <button className={s.themeText} style={{ flex: 1, background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => setSelectedHook(hook.text)}>
                «{hook.text}»
              </button>
              <span className={s.badge}>{hook.priority === 'high' ? 'High' : hook.priority === 'medium' ? 'Medium' : 'Test'}</span>
              <span className={s.badge}>Score {hook.score}</span>
              <button className={s.actionBtn} onClick={() => updateHook(hook.id, { liked: !hook.liked })}>{hook.liked ? '♥' : '♡'}</button>
              <button className={s.actionBtn} onClick={() => updateHook(hook.id, { saved: !hook.saved })}>{hook.saved ? 'Сохранен' : 'Сохранить'}</button>
            </div>
          ))}
        </div>
      </div>
      <div className={s.section}>
        <div className={s.sectionTitle}>Идея и фактура</div>
        <div className={s.factureCard}>
          {FACTURE_HINTS.map((hint, i) => <div key={i} className={s.factureHint}>{hint}</div>)}
        </div>
        {voiceAvailable && (
          <div className={s.inputModeRow}>
            <button className={`${s.modeBtn}${inputMode === 'text' ? ' ' + s.modeBtnActive : ''}`} onClick={() => { setInputMode('text'); if (isListening) toggleVoice(); }}>✏️ Текст</button>
            <button className={`${s.modeBtn}${inputMode === 'voice' ? ' ' + s.modeBtnActive : ''}`} onClick={() => setInputMode('voice')}>🎤 Голос</button>
          </div>
        )}
        {inputMode === 'text' ? (
          <textarea className={s.factureTextarea} placeholder="Опишите реальные ситуации, ошибки аудитории, кейсы, фразы клиентов, эмоции и главный инсайт для сценария..." value={facture} onChange={e => setFacture(e.target.value)} />
        ) : (
          <div className={s.voiceArea}>
            <button className={`${s.voiceBtn}${isListening ? ' ' + s.voiceBtnActive : ''}`} onClick={toggleVoice}>
              {isListening ? '⏹ Остановить запись' : '🎤 Начать запись'}
            </button>
            {facture && <div className={s.voiceTranscript}>{facture}</div>}
          </div>
        )}
        <div className={s.factureCounter}>
          {facture.length} символов{' '}
          {facture.trim().length < 30 && <span className={s.factureCounterWarn}>(минимум 30)</span>}
        </div>
      </div>
      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button className={s.primaryBtn} disabled={facture.trim().length < 30 || !selectedHook} onClick={handleGenerateReel}>Написать сценарий →</button>
      </div>
    </div>
  );
}
