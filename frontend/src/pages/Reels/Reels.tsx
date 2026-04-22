import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useProjectsStore } from '../../store/projects.store';
import { useContentApi } from '../../hooks/useContentApi';
import s from './Reels.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrategyData {
  chosenSegment?: string;
  chosenSubsegment?: string;
  wants?: string;
  requests?: string;
  painfulQuestions?: string;
  deepDesires?: string;
  finalResult?: string;
  triedSolutions?: string;
  corePains?: string;
}

interface Hook {
  id: string;
  category: string;
  categoryLabel: string;
  text: string;
  triggerScore: number;
  urgencyScore: number;
  payScore: number;
  total: number;
}

interface Script {
  id: string;
  hookText: string;
  templateLabel: string;
  content: string;
  editedContent: string;
  editedTitle: string;
}

interface ScriptItem extends SplitItem {
  content: string;
  editedContent: string;
  editedTitle: string;
  templateLabel: string;
}

type Phase =
  | 'step1-idle'
  | 'step1-generating'
  | 'step1-revealing'
  | 'step1-done'
  | 'step2'
  | 'step3-generating'
  | 'step3';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_ANSWERS = 'strategy_answers';
const REELS_KEY       = 'reels_session';
const REVEAL_INTERVAL = 75; // ms per line

const CATEGORY_LABELS: Record<string, string> = {
  numbers:  '1️⃣ ЧИСЛИТЕЛЬНЫЕ',
  how:      '2️⃣ «КАК…»',
  intrigue: '3️⃣ ИНТРИГА',
  address:  '4️⃣ ОБРАЩЕНИЕ',
  combo:    '5️⃣ КОМБО',
};

const TEMPLATE_LABELS = ['Шаблон А', 'Шаблон Б', 'Шаблон В', 'Шаблон Г', 'Шаблон Д'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstLine(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  return text.split('\n')[0]?.replace(/^\d+\.\s*/, '').slice(0, 80) ?? fallback;
}

function extractKeyword(hookText: string): string {
  const words = hookText
    .replace(/[^а-яёa-z\s]/gi, '')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const word = words[0] ?? 'КЛЮЧ';
  return word.toUpperCase();
}

// ─── Hook generator (30 шт × 5 категорий) ────────────────────────────────────

function buildHooks(sd: StrategyData | null): Hook[] {
  const seg   = firstLine(sd?.chosenSegment,  'клиент');
  const sub   = firstLine(sd?.chosenSubsegment, 'специалист');
  const pain  = firstLine(sd?.corePains,       'чувствует себя потерянным');
  const res   = firstLine(sd?.finalResult,     'обретает гармонию и уверенность');
  const tried = firstLine(sd?.triedSolutions,  'пробовал самостоятельно справляться');
  const want  = firstLine(sd?.wants,           'хочет изменений');

  const raw: Array<[string, string]> = [
    // 1️⃣ ЧИСЛИТЕЛЬНЫЕ
    ['numbers', `3 вещи которые ${seg} делает из заботы — но именно они мешают`],
    ['numbers', `2 фразы которые разрушают доверие — и одна которая всё восстанавливает`],
    ['numbers', `5 признаков что ${sub} готов(а) к настоящим изменениям`],
    ['numbers', `7 вопросов которые помогут понять себя прямо сейчас`],
    ['numbers', `1 причина почему ${pain} — и как с этим работать`],
    ['numbers', `4 ошибки которые мешают ${res}`],
    // 2️⃣ КАК
    ['how', `Как перестать ${pain} раз и навсегда`],
    ['how', `Как ${seg} достигает ${res} — даже если кажется что всё безнадёжно`],
    ['how', `Как говорить о своих потребностях не вызывая защитную реакцию`],
    ['how', `Как распознать когда работа с психологом реально начинает помогать`],
    ['how', `Как превратить застрявшую боль в точку роста`],
    ['how', `Как мягко выйти из ситуации когда ${pain}`],
    // 3️⃣ ИНТРИГА
    ['intrigue', `Я никогда не думала что скажу это — но именно это помогает ${seg}`],
    ['intrigue', `Все говорят что нужно просто «поговорить» — вот почему это не работает`],
    ['intrigue', `Психологи редко говорят об этом публично — но это ключевой момент`],
    ['intrigue', `Почему ${seg} не может решить ${pain} самостоятельно — и это нормально`],
    ['intrigue', `То чего все боятся в терапии — но никто не обсуждает вслух`],
    ['intrigue', `Вот почему ${tried} не сработало — и что работает на самом деле`],
    // 4️⃣ ОБРАЩЕНИЕ
    ['address', `Если ты ${sub} и устал(а) от того что ${pain} — это для тебя`],
    ['address', `${seg.charAt(0).toUpperCase() + seg.slice(1)} — ты узнаешь себя в этом видео`],
    ['address', `Для тех кто уже ${tried} — и так и не получил результат`],
    ['address', `Это видео изменит то как ты думаешь о своей ситуации навсегда`],
    ['address', `Если ${pain} — посмотри это прежде чем делать что-то ещё`],
    ['address', `Ты ${want} но не знаешь с чего начать? Тогда тебе важно это знать`],
    // 5️⃣ КОМБО
    ['combo', `3 способа ${res} — даже если кажется что ничего не меняется`],
    ['combo', `Как я помогла клиентам с "${pain}" — и что удивило больше всего`],
    ['combo', `Правда о "${pain}" которую не скажет ни один другой специалист`],
    ['combo', `Почему я перестала давать советы — и что изменилось в результатах`],
    ['combo', `2 типа ${seg}: одни страдают годами другие меняются за месяц — в чём разница`],
    ['combo', `Один вопрос который меняет всё — и большинство никогда его не задаёт`],
  ];

  return raw
    .map(([cat, text], i) => ({
      id: `hook-${i}`,
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat] ?? cat,
      text,
      triggerScore: 5 + ((i * 3 + 7) % 5),
      urgencyScore:  5 + ((i * 5 + 3) % 5),
      payScore:      5 + ((i * 7 + 1) % 5),
      total: (5 + ((i * 3 + 7) % 5)) + (5 + ((i * 5 + 3) % 5)) + (5 + ((i * 7 + 1) % 5)),
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Lines for typewriter display ────────────────────────────────────────────

function buildHooksLines(hooks: Hook[]): string[] {
  const categories = ['numbers', 'how', 'intrigue', 'address', 'combo'];
  const lines: string[] = [];
  categories.forEach((cat) => {
    lines.push(''); // spacer
    lines.push(`## ${CATEGORY_LABELS[cat]} (6 хуков)`);
    lines.push('');
    hooks
      .filter((h) => h.category === cat)
      .slice(0, 6)
      .forEach((h, i) => lines.push(`${i + 1}. ${h.text}`));
  });
  return lines.filter((_, i) => i !== 0); // remove leading spacer
}

// ─── Script builders (5 шаблонов) ────────────────────────────────────────────

function buildScript(hook: Hook, context: string, templateIdx: number): string {
  const ctx = context.trim();
  const kw  = extractKeyword(hook.text);
  const h   = hook.text;
  // Split free-form context into sentences for sub-parts
  const sentences = ctx
    .split(/(?<=[.!?\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const p = (idx: number, fallback: string): string =>
    sentences[idx] ?? (ctx.length > 10 ? ctx.slice(0, 150) : fallback);

  switch (templateIdx % 5) {
    case 0: // Шаблон А — «Самый простой способ»
      return [
        `САМЫЙ ПРОСТОЙ СПОСОБ`,
        h.toUpperCase(),
        ``,
        `ПОМОЖЕТ ДАЖЕ ТЕМ, КТО`,
        p(0, 'уже пробовал всё и потерял надежду').toUpperCase(),
        ``,
        p(1, 'На первом шаге важно остановиться и задать себе один честный вопрос.'),
        ``,
        p(2, 'Я видела как это работает даже в самых сложных случаях.'),
        ``,
        `А ЕСЛИ ХОЧЕШЬ ВЫЙТИ ИЗ ЭТОГО ЗАМКНУТОГО КРУГА —`,
        `ПИШИ «${kw}» В КОММЕНТАРИИ И Я ПРИШЛЮ ТЕБЕ В ДИРЕКТ [название лид-магнита]`,
      ].join('\n');

    case 1: // Шаблон Б — «2 ошибки»
      return [
        `2 ОШИБКИ ИЗ-ЗА КОТОРЫХ`,
        h.toUpperCase(),
        ``,
        `ПОМНИ О НИХ ПРЕЖДЕ ЧЕМ ДЕЙСТВОВАТЬ`,
        ``,
        `ПЕРВОЕ.`,
        p(0, 'Большинство пытаются решить внешнюю проблему, не касаясь внутренней.'),
        ``,
        `ВТОРОЕ.`,
        p(1, 'Они ждут когда станет "совсем плохо" вместо того чтобы действовать сейчас.'),
        ``,
        p(2, 'Осознание этих ошибок — уже первый шаг к изменениям.'),
        ``,
        `ПИШИ «${kw}» В КОММЕНТАРИИ — ПРИШЛЮ [название материала] БЕСПЛАТНО`,
      ].join('\n');

    case 2: // Шаблон В — «Как сделать»
      return [
        `КАК СДЕЛАТЬ`,
        h.toUpperCase(),
        ``,
        `ЭТО ВИДЕО ДЛЯ ВАС ЕСЛИ`,
        p(0, 'вы узнаёте себя в этой ситуации').toUpperCase(),
        ``,
        `С ПОМОЩЬЮ ЭТОГО МЕТОДА Я`,
        p(1, 'помогла клиентам получить реальные изменения уже через несколько сессий'),
        ``,
        `ОТЛИЧНО ПОДОЙДЁТ ТЕМ КОМУ СЛОЖНО`,
        p(2, 'справиться с этим в одиночку'),
        ``,
        `ЧТОБЫ ПОЛУЧИТЬ ПОШАГОВЫЙ РАЗБОР —`,
        `ПИШИТЕ В ДИРЕКТ «${kw}»`,
      ].join('\n');

    case 3: // Шаблон Г — «3 шага»
      return [
        `ТЫ ЧУВСТВУЕШЬ`,
        h.toUpperCase(),
        `И НЕ ЗНАЕШЬ КАК С ЭТИМ СПРАВИТЬСЯ?`,
        ``,
        `ДЕРЖИ 3 ШАГА`,
        ``,
        `ШАГ 1:`,
        p(0, 'Остановитесь и назовите то, что вы на самом деле чувствуете.'),
        ``,
        `ШАГ 2:`,
        p(1, 'Задайте себе вопрос: "Что мне сейчас действительно нужно?"'),
        ``,
        `ШАГ 3:`,
        p(2, 'Сделайте одно маленькое действие в сторону этой потребности.'),
        ``,
        `А ЕСЛИ У ТЕБЯ ЕЩЁ НЕТ РЕЗУЛЬТАТА — СМОТРИ ЗАКРЕП`,
        `ИЛИ ПИШИ «${kw}» В ДИРЕКТ`,
      ].join('\n');

    default: // Шаблон Д — «История результата»
      return [
        `ХОТИТЕ УЗНАТЬ ЧТО БУДЕТ ЕСЛИ`,
        h.toUpperCase(),
        ``,
        `ЭТОТ РИЛС ДЛЯ ТЕБЯ ЕСЛИ ТЫ`,
        p(0, 'узнаёшь себя в этой ситуации').toUpperCase(),
        ``,
        p(0, 'Ко мне обратился клиент с похожей ситуацией. Казалось что выхода нет.'),
        ``,
        p(1, 'Мы начали с простого: назвали то, что происходит, без осуждения.'),
        ``,
        p(2, 'Через несколько сессий человек сказал: "Я наконец чувствую себя собой".'),
        ``,
        `ХОЧЕШЬ ТАК ЖЕ?`,
        `ПИШИ «${kw}» В КОММЕНТАРИИ — ПРИШЛЮ В ДИРЕКТ [лид-магнит]`,
      ].join('\n');
  }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadStrategyData(): StrategyData | null {
  try {
    const raw = localStorage.getItem(STORAGE_ANSWERS);
    if (!raw) return null;
    const d = JSON.parse(raw) as StrategyData;
    if (!d.chosenSegment && !d.corePains) return null;
    return d;
  } catch { return null; }
}

function loadSession(): Script[] | null {
  try {
    const raw = localStorage.getItem(REELS_KEY);
    return raw ? (JSON.parse(raw) as Script[]) : null;
  } catch { return null; }
}

function saveSession(scripts: Script[]) {
  localStorage.setItem(REELS_KEY, JSON.stringify(scripts));
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = ['Хуки', 'Фактура', 'Сценарии'];
  return (
    <div className={s.stepper}>
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === currentStep;
        const done   = n < currentStep;
        return (
          <>
            <div key={label} className={s.stepItem}>
              <div className={`${s.stepDot}${active ? ' ' + s.stepDotActive : done ? ' ' + s.stepDotDone : ''}`}>
                {done ? '✓' : n}
              </div>
              <span className={`${s.stepLabel}${active ? ' ' + s.stepLabelActive : ''}`}>
                Шаг {n} — {label}
              </span>
            </div>
            {i < steps.length - 1 && <div key={`line-${i}`} className={s.stepLine} />}
          </>
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reels() {
  const strategyData = loadStrategyData();
  const hasStrategy  = strategyData !== null;
  const { activeProjectId } = useProjectsStore();
  const { saveItem: saveToApi } = useContentApi({ projectId: activeProjectId, type: 'REEL' });

  // ── Phase ──────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<Phase>(() =>
    loadSession() ? 'step3' : 'step1-idle',
  );

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  const [hooks,         setHooks]         = useState<Hook[]>([]);
  const [hookLines,     setHookLines]     = useState<string[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  const [facturaText,      setFacturaText]      = useState('');
  const [inputMode,        setInputMode]        = useState<'text' | 'voice'>('text');
  const [isRecording,      setIsRecording]      = useState(false);
  const [interimText,      setInterimText]      = useState('');
  const [speechSupported,  setSpeechSupported]  = useState<boolean | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── Step 3 ─────────────────────────────────────────────────────────────────

  const [scripts,         setScripts]         = useState<Script[]>(() => loadSession() ?? []);
  const [activeScriptId,  setActiveScriptId]  = useState<string | null>(
    () => (loadSession()?.[0]?.id ?? null),
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Typewriter effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'step1-revealing') return;
    if (revealedCount >= hookLines.length) {
      setPhase('step1-done');
      return;
    }
    timerRef.current = setInterval(() => {
      setRevealedCount((c) => c + 1);
    }, REVEAL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, hookLines.length]); // eslint-disable-line

  useEffect(() => {
    if (revealedCount >= hookLines.length && phase === 'step1-revealing') {
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase('step1-done');
    }
  }, [revealedCount, hookLines.length, phase]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerateHooks = useCallback(() => {
    setPhase('step1-generating');
    setTimeout(() => {
      const h  = buildHooks(strategyData);
      const lines = buildHooksLines(h);
      setHooks(h);
      setHookLines(lines);
      setRevealedCount(0);
      setPhase('step1-revealing');
    }, 2000);
  }, [strategyData]);

  function toggleHook(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 5) {
        next.add(id);
      }
      return next;
    });
  }

  function handleProceedToStep2() {
    setFacturaText('');
    setInputMode('text');
    setPhase('step2');
  }

  function startRecording() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
      return;
    }
    setSpeechSupported(true);
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setFacturaText((prev) => prev + (prev === '' || prev.endsWith(' ') ? '' : ' ') + final);
      }
      setInterimText(interim);
    };
    recognition.onerror = () => { setIsRecording(false); setInterimText(''); };
    recognition.onend  = () => { setIsRecording(false); setInterimText(''); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setInterimText('');
  }

  function stopRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setInterimText('');
  }

  function handleGenerateScripts() {
    stopRecording();
    setPhase('step3-generating');
    setTimeout(() => {
      const selected = hooks.filter((h) => selectedIds.has(h.id));
      const newScripts: Script[] = selected.map((hook, i) => {
        const content = buildScript(hook, facturaText, i);
        return {
          id: `script-${Date.now()}-${i}`,
          hookText: hook.text,
          templateLabel: TEMPLATE_LABELS[i % TEMPLATE_LABELS.length] ?? `Шаблон ${i + 1}`,
          content,
          editedContent: content,
          editedTitle: `Рилс: ${hook.text.slice(0, 50)}`,
        };
      });
      setScripts(newScripts);
      setActiveScriptId(newScripts[0]?.id ?? null);
      saveSession(newScripts);
      setPhase('step3');
      // Сохраняем каждый сценарий в БД
      newScripts.forEach((sc) => {
        void saveToApi({ title: sc.editedTitle, content: sc.editedContent, platform: 'Instagram/TikTok' });
      });
    }, 1500);
  }

  function handleNewSeries() {
    localStorage.removeItem(REELS_KEY);
    stopRecording();
    setScripts([]);
    setHooks([]);
    setHookLines([]);
    setRevealedCount(0);
    setSelectedIds(new Set());
    setFacturaText('');
    setInputMode('text');
    setActiveScriptId(null);
    setPhase('step1-idle');
  }

  function handleSaveScript(scriptId: string, title: string, content: string) {
    setScripts((prev) => {
      const updated = prev.map((sc) =>
        sc.id === scriptId ? { ...sc, editedTitle: title, editedContent: content } : sc,
      );
      saveSession(updated);
      return updated;
    });
  }

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content).catch(() => undefined);
  }

  function handleDownload(title: string, content: string) {
    const blob = new Blob([`${title}\n\n${content}`], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title.slice(0, 40).replace(/[^\wа-яёa-z\s]/gi, '').trim() || 'reel'}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Step 1 score helper ────────────────────────────────────────────────────

  function scoreClass(v: number) {
    return v >= 8 ? s.scoreHigh : s.scoreMid;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── STEP 3: SplitEditor ────────────────────────────────────────────────────

  if (phase === 'step3' || phase === 'step3-generating') {
    const splitItems: ScriptItem[] = scripts.map((sc) => ({
      id:            sc.id,
      icon:          '🎬',
      title:         sc.editedTitle,
      meta:          sc.templateLabel,
      preview:       sc.editedContent.split('\n').slice(0, 2).join(' '),
      content:       sc.content,
      editedContent: sc.editedContent,
      editedTitle:   sc.editedTitle,
      templateLabel: sc.templateLabel,
    }));

    return (
      <div className={s.step3Root}>
        {/* top bar */}
        <div className={s.step3TopBar}>
          <span>5 сценариев готовы</span>
          <div className={s.step3TopBarActions}>
            <button className={s.secondaryBtn} onClick={handleNewSeries}>
              ↺ Создать новую серию
            </button>
          </div>
        </div>

        {/* SplitEditor: use negative margin trick already baked into SplitEditor,
            but here it's inside step3Root, so we override via wrapper */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {phase === 'step3-generating' ? (
            <div className={s.emptyScriptState}>
              <span className={s.emptyIcon}>🎬</span>
              <span>Пишем сценарии…</span>
            </div>
          ) : (
            <SplitEditor<ScriptItem>
              items={splitItems}
              selectedId={activeScriptId}
              onSelect={(id) => setActiveScriptId(id)}
              listTitle="5 сценариев"
              renderEditor={(item) => {
                if (!item) {
                  return (
                    <div className={s.emptyScriptState}>
                      <span className={s.emptyIcon}>✏️</span>
                      <span>Выберите сценарий слева</span>
                    </div>
                  );
                }
                return (
                  <ScriptEditor
                    key={item.id}
                    scriptId={item.id}
                    initialTitle={item.editedTitle}
                    initialContent={item.editedContent}
                    templateLabel={item.templateLabel}
                    onSave={handleSaveScript}
                    onCopy={handleCopy}
                    onDownload={handleDownload}
                  />
                );
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ── STEPS 1 & 2: scrollable wizard ────────────────────────────────────────

  const currentStep: 1 | 2 | 3 =
    phase.startsWith('step1') ? 1 : phase === 'step2' ? 2 : 3;

  return (
    <div className={s.page}>
      <Stepper currentStep={currentStep} />

      {/* ═══════════════ STEP 1 ══════════════════════════════════════════════ */}
      {phase.startsWith('step1') && (
        <>
          <div className={s.section}>
            <h2 className={s.sectionTitle}>Шаг 1 из 3 — Генерация хуков</h2>
            <p className={s.sectionSub}>
              ИИ сгенерирует 30 хуков по 5 категориям, опираясь на данные вашей стратегии.
              Затем вы выберете лучшие и перейдёте к сбору фактуры.
            </p>
          </div>

          {/* Баннер: нет стратегии */}
          {!hasStrategy && (
            <div className={s.banner}>
              💡 Для генерации рилсов сначала пройдите{' '}
              <NavLink to="/strategy" className={s.bannerLink}>Стратегию</NavLink>{' '}
              — ИИ использует данные о вашей аудитории.
            </div>
          )}

          {/* Данные из стратегии */}
          {hasStrategy && (
            <div className={s.section}>
              <div className={s.strategyInfo}>
                <span className={s.strategyInfoLabel}>Из стратегии:</span>
                {strategyData?.chosenSegment && (
                  <span className={s.badge}>{firstLine(strategyData.chosenSegment, '')}</span>
                )}
                {strategyData?.chosenSubsegment && (
                  <span className={s.badge}>{firstLine(strategyData.chosenSubsegment, '')}</span>
                )}
              </div>
            </div>
          )}

          {/* Кнопка генерации */}
          {phase === 'step1-idle' && (
            <div className={s.section}>
              <button className={s.primaryBtn} onClick={handleGenerateHooks}>
                Сгенерировать 30 хуков →
              </button>
            </div>
          )}

          {/* Генерация (спиннер) */}
          {phase === 'step1-generating' && (
            <div className={s.section}>
              <button className={s.primaryBtn} disabled>
                <span className={s.spinner} /> Генерирую хуки…
              </button>
            </div>
          )}

          {/* Typewriter output */}
          {(phase === 'step1-revealing' || phase === 'step1-done') && (
            <>
              <div className={s.section}>
                <div className={s.hooksOutput}>
                  <HooksDisplay lines={hookLines} revealed={revealedCount} />
                </div>
              </div>

              {/* Рейтинговая таблица */}
              {phase === 'step1-done' && (
                <div className={s.section}>
                  <p className={s.sectionSub}>
                    Выберите до 5 хуков для работы. Таблица отсортирована по суммарному баллу.
                  </p>

                  <div className={s.tableWrap}>
                    <table className={s.hooksTable}>
                      <thead>
                        <tr>
                          <th />
                          <th>#</th>
                          <th>Хук</th>
                          <th>Триггерность</th>
                          <th>Срочность</th>
                          <th>Платёжеспос.</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hooks.map((h, i) => (
                          <tr
                            key={h.id}
                            className={selectedIds.has(h.id) ? s.hookRowSelected : ''}
                            onClick={() => toggleHook(h.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                className={s.hookCheckbox}
                                checked={selectedIds.has(h.id)}
                                onChange={() => toggleHook(h.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td className={s.hookNum}>{i + 1}</td>
                            <td className={s.hookText}>
                              <div className={s.hookCatBadge}>{h.categoryLabel}</div>
                              <div>{h.text}</div>
                            </td>
                            <td className={`${s.scoreCell} ${scoreClass(h.triggerScore)}`}>{h.triggerScore}</td>
                            <td className={`${s.scoreCell} ${scoreClass(h.urgencyScore)}`}>{h.urgencyScore}</td>
                            <td className={`${s.scoreCell} ${scoreClass(h.payScore)}`}>{h.payScore}</td>
                            <td className={s.totalCell}>{h.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={s.btnRow}>
                    <button
                      className={s.primaryBtn}
                      disabled={selectedIds.size === 0}
                      onClick={handleProceedToStep2}
                    >
                      Выбрать {selectedIds.size > 0 ? selectedIds.size : ''} хуков и продолжить →
                    </button>
                    <span className={`${s.selectCounter}${selectedIds.size > 0 ? ' ' + s.selectCounterActive : ''}`}>
                      {selectedIds.size} / 5 выбрано
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════════ STEP 2 ══════════════════════════════════════════════ */}
      {phase === 'step2' && (
        <>
          <div className={s.section}>
            <h2 className={s.sectionTitle}>Шаг 2 из 3 — Расскажите о своём опыте</h2>
            <p className={s.sectionSub}>
              Ответьте в свободной форме — текстом или голосом.
              ИИ сам разберёт фактуру под каждый сценарий.
            </p>
          </div>

          {/* Выбранные хуки */}
          <div className={s.selectedHooks}>
            {hooks.filter((h) => selectedIds.has(h.id)).map((h, i) => (
              <div key={h.id} className={s.selectedHookChip}>
                <span className={s.hookNum2}>#{i + 1}</span>
                {h.text}
              </div>
            ))}
          </div>

          {/* Подсказки-вопросы */}
          <div className={s.facturaCard}>
            <div className={s.facturaHintTitle}>Ответьте на эти вопросы в любом порядке:</div>
            <ol className={s.facturaHintsList}>
              <li>Опишите реальный случай из практики — когда клиент столкнулся с этой проблемой</li>
              <li>Что вы обычно говорите или делаете в такой ситуации?</li>
              <li>Какой результат получил клиент после работы с вами?</li>
              <li>Есть ли у вас личная история, связанная с этой темой?</li>
              <li>Что чаще всего удивляет клиентов в вашем подходе?</li>
              <li>Какую главную ошибку совершают люди в этой ситуации?</li>
              <li>Какой инсайт вы хотите донести через эти видео?</li>
            </ol>
          </div>

          {/* Переключатель режимов */}
          <div className={s.modeSwitch}>
            <button
              className={`${s.modeSwitchChip}${inputMode === 'text' ? ' ' + s.modeSwitchChipActive : ''}`}
              onClick={() => { stopRecording(); setInputMode('text'); }}
            >
              ✏️ Текст
            </button>
            <button
              className={`${s.modeSwitchChip}${inputMode === 'voice' ? ' ' + s.modeSwitchChipActive : ''}`}
              onClick={() => setInputMode('voice')}
            >
              🎤 Голос
            </button>
          </div>

          {/* Единое поле ввода */}
          <div className={s.facturaTextareaWrap}>
            <textarea
              className={s.facturaTextarea}
              placeholder={`Пишите свободно — можно не по порядку, можно одним потоком. Например: «У меня была клиентка которая пришла с проблемой... Я обычно в таких случаях... Результат был...»`}
              value={facturaText}
              onChange={(e) => setFacturaText(e.target.value)}
            />
            {inputMode === 'voice' && interimText && (
              <div className={s.interimPreview}>{interimText}</div>
            )}
            <div className={s.wordCount}>
              {facturaText.trim() ? facturaText.trim().split(/\s+/).length : 0} слов
            </div>
          </div>

          {/* Голосовой режим */}
          {inputMode === 'voice' && (
            <div className={s.voiceArea}>
              {speechSupported === false ? (
                <div className={s.voiceUnsupported}>
                  Голосовой ввод недоступен в вашем браузере. Попробуйте Chrome или Safari.
                </div>
              ) : (
                <div className={s.voiceBtnWrap}>
                  {isRecording && <div className={s.pulseRing} />}
                  <button
                    className={`${s.voiceBtn}${isRecording ? ' ' + s.voiceBtnRecording : ''}`}
                    onClick={isRecording ? stopRecording : startRecording}
                  >
                    {isRecording ? '🔴 Остановить запись' : '🎤 Начать запись'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Навигация */}
          <div className={s.btnRow} style={{ marginTop: 28 }}>
            <button
              className={s.secondaryBtn}
              onClick={() => { stopRecording(); setPhase('step1-done'); }}
            >
              ← Назад
            </button>
            <button
              className={s.primaryBtn}
              disabled={facturaText.trim().length < 50}
              onClick={handleGenerateScripts}
            >
              Готово, пишем сценарии →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── HooksDisplay ─────────────────────────────────────────────────────────────

function HooksDisplay({ lines, revealed }: { lines: string[]; revealed: number }) {
  const visible = lines.slice(0, revealed);
  if (visible.length === 0) {
    return <p className={s.hooksEmpty}>Формулирую хуки…</p>;
  }
  return (
    <>
      {visible.map((line, i) => {
        if (line.startsWith('## ')) {
          return <p key={i} className={s.hooksCategoryHeader}>{line.replace('## ', '')}</p>;
        }
        if (line === '') {
          return <br key={i} />;
        }
        return <p key={i} className={s.hooksOutputLine}>{line}</p>;
      })}
    </>
  );
}

// ─── ScriptEditor ─────────────────────────────────────────────────────────────

interface ScriptEditorProps {
  scriptId:       string;
  initialTitle:   string;
  initialContent: string;
  templateLabel:  string;
  onSave:         (id: string, title: string, content: string) => void;
  onCopy:         (content: string) => void;
  onDownload:     (title: string, content: string) => void;
}

function ScriptContentView({ content }: { content: string }) {
  return (
    <div className={s.scriptContent}>
      {content.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className={s.scriptLineSpacer} />;
        const isCaps = trimmed === trimmed.toUpperCase() && /[А-ЯA-Z]/.test(trimmed);
        return (
          <p key={i} className={isCaps ? s.scriptLineCaps : s.scriptLineNormal}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

function ScriptEditor({
  scriptId, initialTitle, initialContent, templateLabel,
  onSave, onCopy, onDownload,
}: ScriptEditorProps) {
  const [title,     setTitle]     = useState(initialTitle);
  const [content,   setContent]   = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const { openAddModal } = useContentPlanStore();

  return (
    <div className={s.scriptEditorWrap}>
      <div className={s.scriptHeader}>
        <input
          className={s.scriptTitleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок сценария"
        />
        <span className={s.scriptTemplateBadge}>{templateLabel}</span>
      </div>

      <div className={s.scriptBody}>
        {isEditing ? (
          <textarea
            className={s.scriptTextarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Текст сценария…"
            autoFocus
          />
        ) : (
          <ScriptContentView content={content} />
        )}
      </div>

      <div className={s.scriptFooter}>
        <span className={s.charCount}>{content.length} симв.</span>
        <div className={s.scriptActions}>
          <button
            className={`${s.actionBtn}${isEditing ? ' ' + s.actionBtnActive : ''}`}
            onClick={() => setIsEditing((v) => !v)}
          >
            {isEditing ? '✓ Готово' : '✏️ Редактировать'}
          </button>
          <button className={s.actionBtn} onClick={() => onCopy(`${title}\n\n${content}`)}>
            📋 Копировать
          </button>
          <button className={s.actionBtn} onClick={() => openAddModal({ type: 'reel', title, content, preview: content.split('\n').filter(Boolean).slice(0,2).join('\n'), platform: 'Instagram', sourceId: scriptId })}>
            📅 В контент-план
          </button>
          <button className={s.actionBtn} onClick={() => onDownload(title, content)}>
            ⬇️ Скачать .docx
          </button>
          <button
            className={`${s.actionBtn} ${s.actionBtnPrimary}`}
            onClick={() => { onSave(scriptId, title, content); setIsEditing(false); }}
          >
            💾 Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
