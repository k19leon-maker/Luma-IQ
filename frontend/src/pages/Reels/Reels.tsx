import { useState, useRef, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { aiApi } from '../../api/ai';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { ModelBar } from '../../components/MessageInput/MessageInput';
import s from '../Posts/Posts.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform  = 'telegram' | 'instagram';
type ReelType  = 'tips' | 'story' | 'myth';
type Offer     = 'lead' | 'mini' | 'main';
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
  theme:         string;
  offer:         Offer;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { key: 'telegram'  as Platform, emoji: '💬', label: 'Telegram'  },
  { key: 'instagram' as Platform, emoji: '📱', label: 'Instagram' },
];

const REEL_TYPE_OPTIONS = [
  { key: 'tips'  as ReelType, emoji: '💡', label: 'Советы',        desc: '3–5 практических советов по теме' },
  { key: 'story' as ReelType, emoji: '📖', label: 'История',       desc: 'Кейс клиента или история из практики' },
  { key: 'myth'  as ReelType, emoji: '🚫', label: 'Разрушить миф', desc: 'Опровергаем распространённое заблуждение' },
];

const OFFER_OPTIONS = [
  { key: 'lead' as Offer, emoji: '🎁', label: 'Лид-магнит'       },
  { key: 'mini' as Offer, emoji: '⚡', label: 'Мини-продукт'     },
  { key: 'main' as Offer, emoji: '🚀', label: 'Основной продукт' },
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

const FACTURE_HINTS = [
  '1. Есть ли реальный случай из практики по этой теме?',
  '2. Что вы обычно говорите клиентам в такой ситуации?',
  '3. Какой инсайт хотите донести?',
  '4. Что изменилось у клиента после работы с вами?',
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
      id: 'reel-seed-1', reelType: 'tips', platform: 'instagram',
      theme: '3 техники снятия тревоги за 5 минут', offer: 'lead', keyword: 'ПОКОЙ',
      editedTitle: 'Советы · Instagram', editedContent: '', createdAt: '12 апр 2026',
      content: MOCK_REEL_CONTENT.tips,
    },
    {
      id: 'reel-seed-2', reelType: 'myth', platform: 'telegram',
      theme: 'Миф: психолог советует что делать', offer: 'mini', keyword: 'СТАРТ',
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

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ['Настройка', 'Тема и фактура', 'Готовый рилс'];
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
  const profileData = useUnpackingStore((s) => s.profileData);

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

  const [phase,    setPhase]    = useState<Phase>(() => loadReels(activeProjectId).length > 0 ? 'editor' : 'step1');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [reelType, setReelType] = useState<ReelType>('tips');
  const [offer,    setOffer]    = useState<Offer>('lead');
  const [keyword,  setKeyword]  = useState('');

  const [themes,        setThemes]        = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [facture,       setFacture]       = useState('');
  const [inputMode,     setInputMode]     = useState<'text' | 'voice'>('text');
  const [isListening,   setIsListening]   = useState(false);
  const recognitionRef = useRef<any>(null);
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  const updateReels = useCallback((next: SavedReel[]) => {
    setReels(next);
    persistReels(activeProjectId, next);
  }, [activeProjectId]);

  async function handleGenerateThemes() {
    setPhase('step2-loading');
    const claudeModel = localStorage.getItem('selectedModel_reels') ?? 'claude-haiku-4-5-20251001';
    const segCtx = strat.chosenSegment ? `Сегмент ЦА: ${strat.chosenSegment.split('\n')[0]?.slice(0, 100)}.` : '';
    const typeLabels: Record<ReelType, string> = {
      tips: 'рилс с практическими советами', story: 'рилс-история из практики', myth: 'рилс-разрушение мифа',
    };
    const prompt = `${segCtx} Придумай 5 конкретных тем для рилса типа «${typeLabels[reelType]}» для психолога. Выведи только 5 тем нумерованным списком.`;
    try {
      const resp = await aiApi.chat({ model: 'claude', claudeModel, section: 'reels', message: prompt, conversationHistory: [], unpackingProfile: profileData, projectName });
      const lines = resp.content.split('\n').map((l) => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean).slice(0, 5);
      if (lines.length === 0) {
        toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
        setPhase('step1');
        return;
      }
      setThemes(lines);
      setSelectedTheme(lines[0] ?? '');
    } catch {
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      setPhase('step1');
      return;
    }
    setFacture('');
    setPhase('step2');
  }

  async function handleGenerateReel() {
    setPhase('generating');
    const claudeModel = localStorage.getItem('selectedModel_reels') ?? 'claude-haiku-4-5-20251001';
    const segCtx = strat.chosenSegment ? `Сегмент: ${strat.chosenSegment.split('\n')[0]?.slice(0, 100)}.` : '';
    const extraCtx = [keyword && `Ключевое слово: "${keyword}".`, facture && `Контекст: "${facture}".`].filter(Boolean).join(' ');
    const typeLabels: Record<ReelType, string> = {
      tips: 'рилс-советы', story: 'рилс-история', myth: 'рилс-опровержение мифа',
    };
    const prompt = `Напиши сценарий ${typeLabels[reelType]} на тему «${selectedTheme}» для психолога. ${segCtx} ${extraCtx} Формат: заголовок + тезисы по слайдам + подпись с CTA. До 400 слов.`;
    let content: string;
    try {
      const resp = await aiApi.chat({ model: 'claude', claudeModel, section: 'reels', message: prompt, conversationHistory: [], unpackingProfile: profileData, projectName });
      content = resp.content;
    } catch {
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      setPhase('step2');
      return;
    }
    const id    = `reel-${Date.now()}`;
    const title = `${TYPE_LABELS[reelType]} · ${platform === 'telegram' ? 'Telegram' : 'Instagram'}`;
    const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    const newReel: SavedReel = { id, reelType, platform, theme: selectedTheme, offer, keyword, content, editedContent: '', editedTitle: title, createdAt: now };
    const next = [newReel, ...reels];
    updateReels(next);
    setSelectedId(id);
    setPhase('editor');
    void saveToApi({ title, content, platform: platform === 'telegram' ? 'Telegram' : 'Instagram', metadata: { reelType, offer, keyword, theme: selectedTheme } })
      .then((dbItem) => { if (!dbItem) return; updateReels([newReel, ...reels].map((r) => (r.id === id ? { ...r, dbId: dbItem.id } : r))); });
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

  function goToStep1() { setPlatform('instagram'); setReelType('tips'); setOffer('lead'); setKeyword(''); setPhase('step1'); }

  const splitItems: ReelItem[] = reels.map(r => ({
    id: r.id, icon: TYPE_ICONS[r.reelType], title: r.editedTitle,
    meta: `${r.platform === 'telegram' ? '💬 Telegram' : '📱 Instagram'} · ${r.createdAt}`,
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
            <span className={s.badge}>{reel.platform === 'telegram' ? '💬 Telegram' : '📱 Instagram'}</span>
            <span className={s.charCount}>{content.length} симв.</span>
          </div>
        </div>
        <textarea className={s.editorTextarea} value={content} onChange={e => setEditorField(reel.id, 'content', e.target.value)} />
        <div className={s.editorActions}>
          <button className={s.actionBtn} onClick={() => handleCopy(reel.id)}>Копировать</button>
          <button className={s.actionBtn} onClick={() => { const st = getEditorState(reel); openAddModal({ type: 'reel', title: st.title, content: st.content, preview: st.content.split('\n').filter(Boolean).slice(0, 2).join('\n'), platform: reel.platform === 'telegram' ? 'Telegram' : 'Instagram', projectId: activeProjectId ?? undefined, sourceId: reel.id }); }}>📅 В контент-план</button>
          <button className={`${s.actionBtn} ${s.actionBtnPrimary}${!hasChanges ? ' ' + s.actionBtnDisabled : ''}`} onClick={() => handleSave(reel.id)} disabled={!hasChanges}>Сохранить</button>
          <button className={s.actionBtn} onClick={() => handleDownload(reel.id)}>Скачать</button>
        </div>
      </div>
    );
  }

  if (phase === 'step2-loading' || phase === 'generating') {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>{phase === 'step2-loading' ? 'Генерирую темы для рилса...' : 'Пишу сценарий...'}</p>
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
          <div className={s.sectionTitle}>К чему ведёт рилс</div>
          <div className={s.chipGroup}>
            {OFFER_OPTIONS.map(o => (
              <button key={o.key} className={`${s.chip}${offer === o.key ? ' ' + s.chipActive : ''}`} onClick={() => setOffer(o.key)}>{o.emoji} {o.label}</button>
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
          <button className={s.primaryBtn} onClick={handleGenerateThemes}>Сгенерировать темы →</button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Stepper step={2} />
      <div className={s.section}>
        <div className={s.sectionTitle}>Выберите тему рилса</div>
        <div className={s.sectionSub}>ИИ предложил 5 тем для формата «{TYPE_LABELS[reelType]}»</div>
        <div className={s.themeList}>
          {themes.map((theme, i) => (
            <button key={i} className={`${s.themeItem}${selectedTheme === theme ? ' ' + s.themeItemActive : ''}`} onClick={() => setSelectedTheme(theme)}>
              <span className={s.themeRadio}>{selectedTheme === theme ? '◉' : '○'}</span>
              <span className={s.themeText}>«{theme}»</span>
            </button>
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
          <textarea className={s.factureTextarea} placeholder="Опишите идею рилса, случай из практики или главный месседж..." value={facture} onChange={e => setFacture(e.target.value)} />
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
        <ModelBar section="reels" />
      </div>
      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button className={s.primaryBtn} disabled={facture.trim().length < 30} onClick={handleGenerateReel}>Написать рилс →</button>
      </div>
    </div>
  );
}
