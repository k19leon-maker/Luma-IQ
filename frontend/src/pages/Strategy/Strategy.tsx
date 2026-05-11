import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import { useModelStore } from '../../store/model.store';
import { aiApi } from '../../api/ai';
import { downloadStrategyPdf } from '../../api/strategy.api';
import { projectsApi } from '../../api/projects.api';
import type { AudienceAnswers } from '../../store/audience.store';

// ── Types ──────────────────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'choice' | 'done';

interface StepDef {
  id:         number;
  label:      string;
  type:       'auto' | 'choice';
  answerKey?: keyof AudienceAnswers;
  choiceKey?: keyof AudienceAnswers;
}

interface DocEntry {
  stepId:        number;
  type:          'text' | 'choice';
  title:         string;
  fullText:      string;
  displayedText: string;
  isTyping:      boolean;
  options?:      string[];
  chosen?:       string;
}

// ── Step definitions ───────────────────────────────────────────────────────────

const STEPS: StepDef[] = [
  { id: 1,  label: '10 сегментов ЦА',         type: 'auto',   answerKey: 'segments' },
  { id: 2,  label: 'ТОП 3 сегмента',          type: 'auto',   answerKey: 'top3segments' },
  { id: 3,  label: 'Выбор сегмента',          type: 'choice', choiceKey: 'chosenSegment' },
  { id: 4,  label: '5 подсегментов',          type: 'auto',   answerKey: 'subsegments' },
  { id: 5,  label: 'Выбор подсегмента',       type: 'choice', choiceKey: 'chosenSubsegment' },
  { id: 6,  label: 'Список «ХОЧУ»',           type: 'auto',   answerKey: 'wants' },
  { id: 7,  label: '10 запросов',             type: 'auto',   answerKey: 'requests' },
  { id: 8,  label: 'Выбор запроса',           type: 'choice', choiceKey: 'chosenRequest' },
  { id: 9,  label: 'Болезненные вопросы',     type: 'auto',   answerKey: 'painfulQuestions' },
  { id: 10, label: 'Сокровенные желания',     type: 'auto',   answerKey: 'deepDesires' },
  { id: 11, label: 'Конечный результат',      type: 'auto',   answerKey: 'finalResult' },
  { id: 12, label: 'Что бесит больше всего',  type: 'auto',   answerKey: 'corePains' },
];

const STEP_TITLES: Record<number, string> = {
  1:  'ТОП 10 СЕГМЕНТОВ ЦА',
  2:  'ТОП 3 СЕГМЕНТА ПО ВОСТРЕБОВАННОСТИ',
  3:  'ВЫБОР СЕГМЕНТА',
  4:  '5 ПОДСЕГМЕНТОВ',
  5:  'ВЫБОР ПОДСЕГМЕНТА',
  6:  'СПИСОК «ХОЧУ»',
  7:  '10 ЗАПРОСОВ СЕГМЕНТА',
  8:  'ВЫБОР ЗАПРОСА',
  9:  'БОЛЕЗНЕННЫЕ ВОПРОСЫ',
  10: 'СОКРОВЕННЫЕ ЖЕЛАНИЯ',
  11: 'КОНЕЧНЫЙ РЕЗУЛЬТАТ',
  12: 'ЧТО БЕСИТ БОЛЬШЕ ВСЕГО',
  99: 'АНАЛИЗ ЗАВЕРШЁН',
};

const COMPLETION_TEXT =
  '✅ Анализ целевой аудитории завершён.\n\nМета-упаковка вашего клиента полностью сформирована и готова для разработки УТП, продуктов и контента.';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PositioningData {
  role?: string;
  audience?: string;
  problem?: string;
  result?: string;
  statement?: string;
}

// ── ChoiceCard sub-component ───────────────────────────────────────────────────

function ChoiceCard({
  title,
  options,
  onConfirm,
}: {
  title:     string;
  options:   string[];
  onConfirm: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E3DC', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#D4A847', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
        👆 {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => setSelected(opt)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: selected === opt ? '1.5px solid #D4A847' : '1px solid #E5E3DC',
              background: selected === opt ? '#FFF8E8' : '#F5F4F0', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ color: selected === opt ? '#D4A847' : '#aaa', fontSize: 14, marginTop: 1, flexShrink: 0 }}>
              {selected === opt ? '●' : '○'}
            </span>
            <span style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.5 }}>{opt}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => { if (selected) onConfirm(selected); }}
        disabled={!selected}
        style={{
          padding: '9px 20px', borderRadius: 8, border: 'none',
          background: selected ? '#D4A847' : '#F0EEE8', color: selected ? '#fff' : '#bbb',
          fontSize: 13, fontWeight: 500, cursor: selected ? 'pointer' : 'not-allowed',
        }}
      >
        ✅ Подтвердить выбор
      </button>
    </div>
  );
}

// ── AI step prompts ────────────────────────────────────────────────────────────

function buildStepPrompt(stepId: number, answers: Partial<AudienceAnswers>, projectContext: string, strict = false): string {
  const seg  = (answers.chosenSegment    ?? '').slice(0, 200) || (answers.segments ?? '').slice(0, 400);
  const sub  = (answers.chosenSubsegment ?? '').slice(0, 200);
  const req  = (answers.chosenRequest    ?? '').slice(0, 200);
  const ctx  = `Контекст проекта:\n${projectContext || 'Контекст пока не заполнен.'}\n\nРаботай строго на основе этого контекста. Не подставляй случайные ниши, если они не следуют из контекста.\n\n`;
  const strictPrefix = strict
    ? 'ВАЖНО: Выдай ТОЛЬКО пронумерованный список. Никаких вопросов. Никаких уточнений. Только список в точном формате ниже.\n\n'
    : '';
  switch (stepId) {
    case 1:  return ctx + 'Сгенерируй 10 сегментов целевой аудитории для этого эксперта/проекта. Для каждого сегмента укажи: название сегмента, ситуацию «Когда:», желание «Хочу:» и цель «Чтобы:». Используй **жирный** для названий сегментов. Формат: «Сегмент N — **[название]**». Строго 10 сегментов.';
    case 2:  return ctx + strictPrefix + `Из этих 10 сегментов:\n${answers.segments ?? ''}\n\nВыдай ТОЛЬКО список ТОП 3 сегментов по востребованности. Никаких вопросов, никаких уточнений.\nФормат СТРОГО (только это, ничего лишнего):\n🥇 Сегмент 1 — [название]\n[1–2 предложения почему]\n🥈 Сегмент 2 — [название]\n[1–2 предложения почему]\n🥉 Сегмент 3 — [название]\n[1–2 предложения почему]`;
    case 4:  return ctx + strictPrefix + `Для выбранного сегмента «${seg}» выдай ТОЛЬКО список из 5 подсегментов. Никаких вопросов, никаких уточнений.\nФормат СТРОГО (только это, ничего лишнего):\nПодсегмент 1 — [название]\nКогда: ...\nХочу: ...\nЧтобы: ...\nПодсегмент 2 — [название]\nКогда: ...\nХочу: ...\nЧтобы: ...\n(и так далее до Подсегмент 5)`;
    case 6:  return ctx + `Для подсегмента «${sub}» составь список «ХОЧУ» — 10–12 конкретных желаний клиентов на языке самих клиентов. Начинай каждый пункт с «• Хочу».`;
    case 7:  return ctx + strictPrefix + `Для сегмента «${seg}» (подсегмент: «${sub}») выдай ТОЛЬКО список из 10 конкретных запросов. Никаких вопросов к пользователю, никаких уточнений.\nФормат СТРОГО (только список, ничего лишнего):\n1. [запрос на живом языке клиента]\n2. [запрос]\n...\n10. [запрос]`;
    case 9:  return ctx + `Для подсегмента «${sub}», запрос «${req}». Напиши 8–10 болезненных вопросов которые эти клиенты задают себе внутри — от первого лица, эмоционально. Начинай каждый с «•».`;
    case 10: return ctx + `Для подсегмента «${sub}». Опиши сокровенные желания клиентов этого сегмента — глубинные мечты, которые они не произносят вслух, но очень хотят. 6–8 пунктов, начинай с «•».`;
    case 11: return ctx + `Для подсегмента «${sub}». Сформулируй одним ёмким предложением главный конечный результат который клиенты получают после работы с психологом.`;
    case 12: return ctx + `Для подсегмента «${sub}». Напиши текст от первого лица (150–250 слов) — что больше всего бесит и изматывает клиентов данного сегмента. Максимально эмоционально и на языке клиента. Без заголовков.`;
    default: return ctx + `Шаг ${stepId}: продолжи анализ целевой аудитории.`;
  }
}

function stripMd(s: string): string {
  return s.replace(/\*+/g, '').replace(/__/g, '').trim();
}

function parseChoiceOptions(stepId: number, text: string): string[] {
  // Pattern 1: "Сегмент N —", "Подсегмент N —", "Запрос N —" (handles ** wrapping)
  {
    const matches: string[] = [];
    for (const m of text.matchAll(
      /(?:подсегмент|сегмент|запрос|вариант)\s+\d+\s*[—\-–:]+\s*\*{0,2}([^\n*:]{3,})/gi,
    )) {
      const val = stripMd(m[1]);
      if (val.length > 3) matches.push(val);
    }
    if (matches.length >= 2) {
      console.log(`[Audience step ${stepId}] P1 found:`, matches);
      return matches.slice(0, 5);
    }
  }

  // Pattern 2: emoji medals 🥇🥈🥉
  {
    const matches: string[] = [];
    for (const m of text.matchAll(
      /(?:^|\n)\s*\*{0,2}[🥇🥈🥉]\s*\*{0,2}\s*(?:(?:сегмент|вариант)\s+\d+\s*[—\-–]\s*)?([^\n*:]{3,})/gim,
    )) {
      const val = stripMd(m[1]);
      if (val.length > 3) matches.push(val);
    }
    if (matches.length >= 2) {
      console.log(`[Audience step ${stepId}] P2 found:`, matches);
      return matches.slice(0, 5);
    }
  }

  // Pattern 3: numbered list
  {
    const matches: string[] = [];
    for (const m of text.matchAll(/(?:^|\n)\s*\d+[.)]\s*\*{0,2}([^\n*]{5,80})/gm)) {
      const val = stripMd(m[1]).split(':')[0].trim();
      if (val.length > 3) matches.push(val);
    }
    if (matches.length >= 2) {
      console.log(`[Audience step ${stepId}] P3 found:`, matches);
      return matches.slice(0, 5);
    }
  }

  // Pattern 4: standalone **Bold** titles
  {
    const matches: string[] = [];
    for (const m of text.matchAll(/\*\*([^*\n]{5,60})\*\*/g)) {
      const val = m[1].trim();
      if (val.length > 3) matches.push(val);
    }
    if (matches.length >= 2) {
      console.log(`[Audience step ${stepId}] P4 found:`, matches);
      return matches.slice(0, 5);
    }
  }

  const fallback = text.split('\n')
    .map((l) => l.replace(/^[\s*#\d.)🥇🥈🥉—\-–:«»]+/, '').replace(/\*+/g, '').trim())
    .filter((l) => l.length > 10 && l.length < 120)
    .slice(0, 5);
  console.warn(`[Audience step ${stepId}] fallback lines:`, fallback, '\nRaw:', text.slice(0, 300));
  return fallback;
}

function filterOutQuestions(options: string[]): string[] {
  return options.filter((opt) => {
    if (opt.includes('?')) return false;
    if (/^(кто|что|как|когда|почему|зачем|какой|какая|какие|уточни|можете|расскажи|поясни)/i.test(opt)) return false;
    return true;
  });
}

function buildFallbackOptions(stepId: number, positioning: PositioningData | null): string[] {
  const audience = positioning?.audience || 'основная аудитория проекта';
  const problem = positioning?.problem || 'ключевая проблема';
  const result = positioning?.result || 'желаемый результат';

  if (stepId === 3) {
    return [
      `${audience}: высокая срочность проблемы «${problem}»`,
      `${audience}: уже пробовали решить проблему, но не получили ${result}`,
      `${audience}: осознали проблему и готовы к работе`,
    ];
  }

  if (stepId === 5) {
    return [
      `Нужен быстрый первый шаг по теме «${problem}»`,
      `Есть повторяющийся сценарий, который мешает получить ${result}`,
      `Нужна понятная система действий без перегруза`,
    ];
  }

  return [
    `Как справиться с проблемой «${problem}»`,
    `Что делать, чтобы получить ${result}`,
    `С чего начать работу над этой задачей`,
  ];
}

// ── Mock content (fallback when AI unavailable) ────────────────────────────────

// ── Main component ─────────────────────────────────────────────────────────────

export default function Strategy() {
  const navigate         = useNavigate();
  const completeAudience = useProgressStore((st) => st.completeAudience);
  const activeProjectId  = useProjectsStore((st) => st.activeProjectId) ?? 'default';
  const activeProjectName = useProjectsStore(
    (st) => st.projects.find((p) => p.id === st.activeProjectId)?.name ?? 'Проект',
  );
  const unpackingProfile = useUnpackingStore((st) => st.profileData);

  const audienceSave  = useAudienceStore((st) => st.save);
  const audienceReset = useAudienceStore((st) => st.reset);
  const audienceGet   = useAudienceStore((st) => st.get);
  const audienceModel = useModelStore((st) => st.getSettings('audience').claudeModel);
  const isHaiku = audienceModel === 'claude-haiku-4-5-20251001';

  const [stepStatuses,  setStepStatuses]  = useState<StepStatus[]>(() => STEPS.map(() => 'idle'));
  const [docEntries,    setDocEntries]    = useState<DocEntry[]>([]);
  const [isRunning,     setIsRunning]     = useState(false);
  const [completed,     setCompleted]     = useState(false);
  const [pdfLoading,    setPdfLoading]    = useState(false);
  const [pdfError,      setPdfError]      = useState(false);
  const [aiError,       setAiError]       = useState<string | null>(null);
  const [failedStepId,  setFailedStepId]  = useState<number | null>(null);
  const [positioningData, setPositioningData] = useState<PositioningData | null>(null);

  const resolveChoiceRef  = useRef<((v: string) => void) | null>(null);
  const abortRef          = useRef<{ aborted: boolean }>({ aborted: false });
  const isRetryingRef     = useRef(false);
  const answersRef        = useRef<Partial<AudienceAnswers>>({});
  const docColRef         = useRef<HTMLDivElement>(null);
  const docEndRef         = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  // ── Scroll tracking ──────────────────────────────────────────────────────────

  useEffect(() => {
    const el = docColRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolledUpRef.current = el.scrollTop + el.clientHeight < el.scrollHeight - 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      docEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [docEntries]);

  useEffect(() => () => { abortRef.current.aborted = true; }, []);

  // ── DB persistence ───────────────────────────────────────────────────────────

  const saveProgress = useCallback(async (answers: Partial<AudienceAnswers>, done: boolean) => {
    if (!activeProjectId || activeProjectId === 'default') return;
    try {
      await projectsApi.saveStrategy(activeProjectId, {
        answers: answers as Record<string, string>,
        completed: done,
      });
    } catch {
      // silent — localStorage is primary
    }
  }, [activeProjectId]);

  const persistAudienceProgress = useCallback((answers: Partial<AudienceAnswers>, done: boolean) => {
    if (activeProjectId && activeProjectId !== 'default') {
      audienceSave(activeProjectId, answers, done);
    }
    void saveProgress(answers, done);
  }, [activeProjectId, audienceSave, saveProgress]);

  // ── Load project state ───────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    setPositioningData(null);

    if (!activeProjectId || activeProjectId === 'default') return () => { alive = false; };

    projectsApi.getStrategy(activeProjectId)
      .then((dbData) => {
        if (!alive || !dbData) return;
        const remotePositioning = (dbData as Record<string, unknown>).positioningData as PositioningData | undefined;
        setPositioningData(remotePositioning ?? null);
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [activeProjectId]);

  useEffect(() => {
    abortRef.current.aborted = true;
    abortRef.current = { aborted: false };
    setIsRunning(false);

    const localData = audienceGet(activeProjectId);
    if (localData.completed) {
      answersRef.current = localData.answers ?? {};
      reconstructDoc(localData.answers);
      setStepStatuses(STEPS.map(() => 'done'));
      setCompleted(true);
      return;
    }

    // Restore partial progress from localStorage
    if (localData.answers && Object.keys(localData.answers).length > 0) {
      answersRef.current = localData.answers ?? {};
      restorePartialDoc(localData.answers);
      return;
    }

    if (activeProjectId && activeProjectId !== 'default') {
      projectsApi.getStrategy(activeProjectId)
        .then((dbData) => {
          if (!dbData) return;
          const remoteAnswers   = (dbData as Record<string, unknown>).answers as Partial<AudienceAnswers> | undefined;
          const remoteCompleted = (dbData as Record<string, unknown>).completed as boolean | undefined;
          if (remoteAnswers && remoteCompleted) {
            audienceSave(activeProjectId, remoteAnswers as AudienceAnswers, true);
            answersRef.current = remoteAnswers;
            reconstructDoc(remoteAnswers);
            setStepStatuses(STEPS.map(() => 'done'));
            setCompleted(true);
            completeAudience();
          } else if (remoteAnswers && Object.keys(remoteAnswers).length > 0) {
            audienceSave(activeProjectId, remoteAnswers, false);
            answersRef.current = remoteAnswers;
            restorePartialDoc(remoteAnswers);
          }
        })
        .catch(() => {});
    }

    setDocEntries([]);
    setStepStatuses(STEPS.map(() => 'idle'));
    setCompleted(false);
  }, [activeProjectId]); // eslint-disable-line

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function reconstructDoc(answers: Partial<AudienceAnswers> | undefined | null) {
    if (!answers || typeof answers !== 'object') return;
    const entries: DocEntry[] = [];
    for (const step of STEPS) {
      if (step.type === 'auto' && step.answerKey) {
        const content = (answers as Record<string, string>)[step.answerKey] ?? '';
        if (content) {
          entries.push({
            stepId: step.id, type: 'text', title: STEP_TITLES[step.id],
            fullText: content, displayedText: content, isTyping: false,
          });
        }
      } else if (step.type === 'choice' && step.choiceKey) {
        const chosen = (answers as Record<string, string>)[step.choiceKey] ?? '';
        if (chosen) {
          entries.push({
            stepId: step.id, type: 'choice', title: STEP_TITLES[step.id],
            fullText: '', displayedText: '', isTyping: false, options: [], chosen,
          });
        }
      }
    }
    entries.push({
      stepId: 99, type: 'text', title: STEP_TITLES[99],
      fullText: COMPLETION_TEXT, displayedText: COMPLETION_TEXT, isTyping: false,
    });
    setDocEntries(entries);
  }

  function restorePartialDoc(answers: Partial<AudienceAnswers>) {
    const entries: DocEntry[] = [];
    const statuses = STEPS.map(() => 'idle' as StepStatus);
    for (const step of STEPS) {
      const ans = answers as Record<string, string>;
      if (step.type === 'auto' && step.answerKey) {
        const content = ans[step.answerKey] ?? '';
        if (content) {
          entries.push({ stepId: step.id, type: 'text', title: STEP_TITLES[step.id], fullText: content, displayedText: content, isTyping: false });
          statuses[step.id - 1] = 'done';
        }
      } else if (step.type === 'choice' && step.choiceKey) {
        const chosen = ans[step.choiceKey] ?? '';
        if (chosen) {
          entries.push({ stepId: step.id, type: 'choice', title: STEP_TITLES[step.id], fullText: '', displayedText: '', isTyping: false, options: [], chosen });
          statuses[step.id - 1] = 'done';
        }
      }
    }
    setDocEntries(entries);
    setStepStatuses(statuses);
  }

  function addDocEntry(entry: DocEntry) {
    setDocEntries((prev) => [...prev, entry]);
  }

  function updateDocEntry(stepId: number, patch: Partial<DocEntry>) {
    setDocEntries((prev) => prev.map((e) => (e.stepId === stepId ? { ...e, ...patch } : e)));
  }

  function typeText(stepId: number, text: string, abort: { aborted: boolean }): Promise<void> {
    return new Promise<void>((resolve) => {
      const totalChars   = text.length;
      const targetMs     = Math.min(3500, Math.max(900, totalChars * 5));
      const intervalMs   = 16;
      const charsPerTick = Math.max(1, Math.ceil(totalChars / (targetMs / intervalMs)));
      let charIdx = 0;

      const timer = setInterval(() => {
        if (abort.aborted) {
          clearInterval(timer);
          setDocEntries((prev) =>
            prev.map((e) => (e.stepId === stepId ? { ...e, displayedText: text, isTyping: false } : e)),
          );
          resolve();
          return;
        }
        charIdx = Math.min(charIdx + charsPerTick, totalChars);
        setDocEntries((prev) =>
          prev.map((e) =>
            e.stepId === stepId
              ? { ...e, displayedText: text.slice(0, charIdx), isTyping: charIdx < totalChars }
              : e,
          ),
        );
        if (charIdx >= totalChars) {
          clearInterval(timer);
          resolve();
        }
      }, intervalMs);
    });
  }

  function waitForChoice(): Promise<string> {
    return new Promise<string>((resolve) => {
      resolveChoiceRef.current = resolve;
    });
  }

  // ── Main analysis flow ───────────────────────────────────────────────────────

  async function runAnalysis(fromStepId = 1) {
    const abort   = abortRef.current;
    const answers: Partial<AudienceAnswers> = { ...answersRef.current };
    setAiError(null);
    setFailedStepId(null);

    const profileCtx = Object.entries(unpackingProfile)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 150)}`)
      .join('\n')
      .slice(0, 800);
    const positioningCtx = positioningData
      ? [
        positioningData.statement ? `Базовое позиционирование: ${positioningData.statement}` : '',
        positioningData.role ? `Роль эксперта: ${positioningData.role}` : '',
        positioningData.audience ? `Широкая аудитория: ${positioningData.audience}` : '',
        positioningData.problem ? `Главная тема/проблема: ${positioningData.problem}` : '',
        positioningData.result ? `Желаемый результат клиента: ${positioningData.result}` : '',
      ].filter(Boolean).join('\n')
      : '';
    const mergedProfile = {
      ...unpackingProfile,
      ...(positioningData?.role ? { specialization: positioningData.role } : {}),
      ...(positioningData?.audience ? { typicalClient: positioningData.audience } : {}),
      ...(positioningData?.problem ? { uniqueApproach: positioningData.problem } : {}),
      ...(positioningData?.result ? { keyResult: positioningData.result } : {}),
      ...(positioningData?.statement ? { positioning: positioningData.statement } : {}),
    };
    const projectContext = [
      activeProjectName,
      positioningCtx ? `Базовый вектор позиционирования:\n${positioningCtx}` : '',
      profileCtx ? `Информация о психологе:\n${profileCtx}` : '',
    ].filter(Boolean).join('\n\n');

    const claudeModel = useModelStore.getState().getSettings('audience').claudeModel;

    for (const step of STEPS) {
      if (abort.aborted) break;
      if (step.id < fromStepId) continue;

      if (step.type === 'auto') {
        setStepStatuses((prev) => prev.map((st, i) => (i === step.id - 1 ? 'running' : st)));
        if (abort.aborted) break;

        let content: string;
        try {
          const prompt = buildStepPrompt(step.id, answers, projectContext);
          const resp = await aiApi.chat({
            model: 'claude',
            claudeModel,
            section: 'audience',
            message: prompt,
            conversationHistory: [],
            unpackingProfile: mergedProfile,
            projectName: activeProjectName,
          });
          content = resp.content;
        } catch (err: unknown) {
          console.error('[AI audience step', step.id, ']:', err);
          toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
          setAiError('Ошибка соединения с AI');
          setFailedStepId(step.id);
          setIsRunning(false);
          return;
        }

        if (abort.aborted) break;

        addDocEntry({
          stepId: step.id, type: 'text', title: STEP_TITLES[step.id],
          fullText: content, displayedText: '', isTyping: true, options: undefined, chosen: undefined,
        });
        await typeText(step.id, content, abort);
        if (abort.aborted) break;

        if (step.answerKey) {
          answers[step.answerKey] = content;
          answersRef.current = { ...answers };
        }
        setStepStatuses((prev) => prev.map((st, i) => (i === step.id - 1 ? 'done' : st)));
        persistAudienceProgress(answers, false);
        await delay(200);

      } else {
        setStepStatuses((prev) => prev.map((st, i) => (i === step.id - 1 ? 'choice' : st)));
        const prevKey = step.id === 3 ? 'top3segments' : step.id === 5 ? 'subsegments' : 'requests';
        const prevContent = (answers as Record<string, string>)[prevKey] ?? '';
        console.log(`[Audience] choice step ${step.id}, prevContent length=${prevContent.length}`);

        let options: string[] = [];
        if (prevContent) {
          const raw = parseChoiceOptions(step.id, prevContent);
          options = filterOutQuestions(raw);

          if (options.length < 2 && !isRetryingRef.current) {
            console.warn(`[Audience step ${step.id}] only ${options.length} options, retrying strict`);
            isRetryingRef.current = true;
            try {
              const sourceStepId = step.id === 3 ? 2 : step.id === 5 ? 4 : 7;
              const strictPrompt = buildStepPrompt(sourceStepId, answers, projectContext, true);
              const retryResp = await aiApi.chat({
                model: 'claude',
                claudeModel,
                section: 'audience',
                message: strictPrompt,
                conversationHistory: [],
                unpackingProfile: mergedProfile,
                projectName: activeProjectName,
              });
              const retryRaw = parseChoiceOptions(step.id, retryResp.content);
              const retryOptions = filterOutQuestions(retryRaw);
              if (retryOptions.length >= 2) {
                options = retryOptions;
                const prevAnsKey = step.id === 3 ? 'top3segments' : step.id === 5 ? 'subsegments' : 'requests';
                answers[prevAnsKey as keyof AudienceAnswers] = retryResp.content;
                answersRef.current = { ...answers };
                updateDocEntry(sourceStepId, { fullText: retryResp.content, displayedText: retryResp.content });
                persistAudienceProgress(answers, false);
              }
            } catch {
              console.warn(`[Audience step ${step.id}] strict retry failed`);
            } finally {
              isRetryingRef.current = false;
            }
          }
        }

        if (options.length < 2) {
          options = buildFallbackOptions(step.id, positioningData);
        }

        console.log(`[Audience step ${step.id}] options:`, options);
        addDocEntry({
          stepId: step.id, type: 'choice', title: STEP_TITLES[step.id],
          fullText: '', displayedText: '', isTyping: false, options, chosen: undefined,
        });

        const chosen = await waitForChoice();
        if (abort.aborted) break;

        if (step.choiceKey) {
          answers[step.choiceKey] = chosen;
          answersRef.current = { ...answers };
        }
        updateDocEntry(step.id, { chosen });
        setStepStatuses((prev) => prev.map((st, i) => (i === step.id - 1 ? 'done' : st)));
        persistAudienceProgress(answers, false);
        await delay(300);
      }
    }

    if (!abort.aborted) {
      addDocEntry({
        stepId: 99, type: 'text', title: STEP_TITLES[99],
        fullText: COMPLETION_TEXT, displayedText: '', isTyping: true,
      });
      await typeText(99, COMPLETION_TEXT, abort);

      completeAudience();
      persistAudienceProgress(answers, true);
      setCompleted(true);
    }

    setIsRunning(false);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleStartAnalysis() {
    if (isRunning) return;
    abortRef.current = { aborted: false };
    answersRef.current = {};
    setDocEntries([]);
    setStepStatuses(STEPS.map(() => 'idle'));
    setCompleted(false);
    setFailedStepId(null);
    setAiError(null);
    setIsRunning(true);
    void runAnalysis(1);
  }

  function retryStep(stepId: number) {
    const sourceStepId = stepId === 3 ? 2 : stepId === 5 ? 4 : stepId === 8 ? 7 : stepId;
    const newAnswers = { ...answersRef.current };
    STEPS
      .filter((s) => s.id >= sourceStepId)
      .forEach((s) => {
        if (s.answerKey) delete newAnswers[s.answerKey];
        if (s.choiceKey) delete newAnswers[s.choiceKey];
      });
    answersRef.current = newAnswers;
    setStepStatuses((prev) => prev.map((st, i) => STEPS[i].id >= sourceStepId ? 'idle' : st));
    setDocEntries((prev) => prev.filter((e) => e.stepId < sourceStepId));
    setFailedStepId(null);
    setAiError(null);
    abortRef.current = { aborted: false };
    setIsRunning(true);
    void runAnalysis(sourceStepId);
  }

  function handleConfirmChoice(value: string) {
    resolveChoiceRef.current?.(value);
    resolveChoiceRef.current = null;
  }

  function handleReset() {
    abortRef.current.aborted = true;
    resolveChoiceRef.current?.('');
    resolveChoiceRef.current = null;
    answersRef.current = {};
    setIsRunning(false);
    setDocEntries([]);
    setStepStatuses(STEPS.map(() => 'idle'));
    setCompleted(false);
    setFailedStepId(null);
    setAiError(null);
    audienceReset(activeProjectId);
    persistAudienceProgress({}, false);
    toast('Анализ сброшен', { icon: '↺' });
  }

  async function handlePdf() {
    setPdfLoading(true);
    try {
      const data = audienceGet(activeProjectId);
      const a    = data.answers as Partial<AudienceAnswers>;
      const answers: Record<string, string> = Object.fromEntries(
        Object.entries(a).filter(([, v]) => typeof v === 'string' && v)
      );
      await downloadStrategyPdf(activeProjectName || 'Проект', answers);
    } catch (err) {
      console.error('[PDF]', err);
      const msg = err instanceof Error ? err.message : 'Ошибка генерации PDF';
      toast.error(msg);
      setPdfError(true);
      setTimeout(() => setPdfError(false), 3000);
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const runBtnDisabled = isRunning || completed;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#fff' }}>

      {/* ── Left: steps panel ───────────────────────────────────────────────── */}
      <div style={{
        width: 280, flexShrink: 0, backgroundColor: '#F5F4F0',
        borderRight: '1px solid #E5E3DC', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px' }}>
            Целевая аудитория
          </h2>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>12-шаговый AI-анализ</p>

          {!completed && (
            <button
              onClick={handleStartAnalysis}
              disabled={runBtnDisabled}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                backgroundColor: runBtnDisabled ? '#F0EEE8' : '#D4A847',
                color: runBtnDisabled ? '#bbb' : '#fff',
                fontSize: 13, fontWeight: 500, cursor: runBtnDisabled ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {isRunning ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 12 }}>⟳</span>
                  Анализ...
                </>
              ) : '▶ Запустить анализ'}
            </button>
          )}

          {aiError && (
            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 6,
              backgroundColor: 'rgba(220,60,60,0.08)', border: '1px solid rgba(220,60,60,0.2)',
              fontSize: 11, color: '#c03030',
            }}>
              ⚠️ {aiError}
            </div>
          )}
        </div>

        {/* Steps list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {STEPS.map((step, i) => {
            const status = stepStatuses[i];
            return (
              <div
                key={step.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 8px', borderRadius: 6, marginBottom: 2,
                  backgroundColor: status === 'running' || status === 'choice' ? 'rgba(212,168,71,0.1)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>
                  {status === 'idle'    && <span style={{ color: '#ccc' }}>○</span>}
                  {status === 'running' && <span style={{ color: '#D4A847', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
                  {status === 'done'    && <span>✅</span>}
                  {status === 'choice'  && <span>👆</span>}
                </span>
                <span style={{
                  fontSize: 12, color: status === 'idle' ? '#aaa' : '#1a1a1a',
                  fontWeight: status === 'running' || status === 'choice' ? 500 : 400,
                  flex: 1,
                }}>
                  {step.id}. {step.label}
                </span>
                {status === 'choice' && (
                  <span style={{ fontSize: 10, color: '#D4A847', fontWeight: 500 }}>выбор</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom actions */}
        {(isRunning || completed || failedStepId !== null) && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E3DC', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completed ? (
              <>
                <button
                  onClick={() => void handlePdf()}
                  disabled={pdfLoading}
                  style={{
                    padding: '9px 0', borderRadius: 8, border: '1px solid #E5E3DC',
                    background: '#fff', color: pdfError ? '#c03030' : '#555',
                    fontSize: 12, cursor: 'pointer', width: '100%',
                  }}
                >
                  {pdfLoading ? '⏳ Генерирую...' : pdfError ? '❌ Ошибка PDF' : '⬇️ Скачать PDF'}
                </button>
                <button
                  onClick={() => navigate('/strategy/utp')}
                  style={{
                    padding: '9px 0', borderRadius: 8, border: 'none',
                    background: '#D4A847', color: '#fff',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%',
                  }}
                >
                  Перейти к УТП →
                </button>
                <button
                  onClick={handleReset}
                  style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 11, cursor: 'pointer', padding: 0 }}
                >
                  ↺ Начать заново
                </button>
              </>
            ) : (
              <button
                onClick={handleReset}
                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 11, cursor: 'pointer', padding: 0 }}
              >
                ↺ Сбросить
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Right: document column ──────────────────────────────────────────── */}
      <div
        ref={docColRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {/* Doc header */}
        <div style={{
          padding: '20px 28px 16px', borderBottom: '1px solid #F0EEE8',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Мета-упаковка</h2>
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{activeProjectName} · {today}</p>
          </div>
        </div>

        {/* Doc body */}
        <div style={{ flex: 1, padding: '24px 28px 40px' }}>
          {isHaiku && (
            <div style={{
              background: 'rgba(212,168,71,0.08)', border: '1px solid rgba(212,168,71,0.3)',
              borderRadius: 8, padding: '8px 14px', marginBottom: 16,
              fontSize: 12, color: '#9a7020', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ⚠️ Для анализа ЦА рекомендуется Sonnet или Opus — Haiku может не справиться с длинным контекстом
            </div>
          )}

          {docEntries.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 320, gap: 16, textAlign: 'center',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, backgroundColor: '#F5F4F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>🧠</div>
              <p style={{ fontSize: 14, color: '#888', maxWidth: 360, lineHeight: 1.6 }}>
                Нажмите «Запустить анализ» — ИИ автоматически проработает все 12 шагов стратегии на основе вашего позиционирования.
              </p>
            </div>
          ) : (
            <>
              {failedStepId !== null && (
                <div style={{
                  padding: 16, background: 'rgba(220,60,60,0.06)',
                  border: '1px solid rgba(220,60,60,0.2)', borderRadius: 12, marginBottom: 16, textAlign: 'center',
                }}>
                  <p style={{ color: '#c03030', marginBottom: 12, fontSize: 13 }}>
                    ⚠️ Не удалось выполнить шаг. Попробуйте ещё раз.
                  </p>
                  <button
                    onClick={() => retryStep(failedStepId)}
                    style={{
                      background: '#D4A847', border: 'none', borderRadius: 8,
                      padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    🔄 Повторить шаг
                  </button>
                </div>
              )}

              {docEntries.map((entry) => {
                if (entry.type === 'text') {
                  return (
                    <div
                      key={entry.stepId}
                      style={{
                        background: '#F5F4F0', borderRadius: 12, padding: '16px 20px',
                        marginBottom: 16,
                      }}
                    >
                      <div style={{
                        fontSize: 10, fontWeight: 600, color: '#999',
                        textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10,
                      }}>
                        {entry.title}
                      </div>
                      {entry.isTyping ? (
                        <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {entry.displayedText}
                          <span style={{ opacity: 0.6, animation: 'blink 1s step-end infinite' }}>|</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.7 }}>
                          <ReactMarkdown>{entry.fullText}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  );
                }

                if (entry.chosen) {
                  return (
                    <div
                      key={entry.stepId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 8, marginBottom: 10,
                        background: '#F5F4F0', fontSize: 13, color: '#1a1a1a',
                      }}
                    >
                      <span>✅</span>
                      <span>
                        {entry.stepId === 3 ? 'Выбранный сегмент' :
                         entry.stepId === 5 ? 'Выбранный подсегмент' :
                         'Выбранный запрос'}:{' '}
                        <strong>{entry.chosen}</strong>
                      </span>
                    </div>
                  );
                }

                return (
                  <ChoiceCard
                    key={entry.stepId}
                    title={STEP_TITLES[entry.stepId]}
                    options={entry.options ?? []}
                    onConfirm={handleConfirmChoice}
                  />
                );
              })}
              <div ref={docEndRef} />
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
