import { Fragment, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import FormattedText from '../../components/FormattedText/FormattedText';
import { MessageActions, MessageInput } from '../../components/MessageInput/MessageInput';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useModelStore } from '../../store/model.store';
import { aiApi } from '../../api/ai';
import { downloadStrategyPdf } from '../../api/strategy.api';
import { projectsApi } from '../../api/projects.api';
import { buildAudienceMaterial } from '../../utils/projectMaterials';
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

interface StepChatMessage {
  role: 'user' | 'assistant';
  content: string;
  stepTitle: string;
  stepId: number;
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
  { id: 8,  label: 'ТОП 3 запроса',           type: 'auto',   answerKey: 'top3requests' },
  { id: 9,  label: 'Выбор запроса',           type: 'choice', choiceKey: 'chosenRequest' },
  { id: 10, label: 'Болезненные вопросы',     type: 'auto',   answerKey: 'painfulQuestions' },
  { id: 11, label: 'Сокровенные желания',     type: 'auto',   answerKey: 'deepDesires' },
  { id: 12, label: 'Конечный результат',      type: 'auto',   answerKey: 'finalResult' },
  { id: 13, label: 'Что бесит больше всего',  type: 'auto',   answerKey: 'corePains' },
];

const STEP_TITLES: Record<number, string> = {
  1:  'ТОП 10 СЕГМЕНТОВ ЦА',
  2:  'ТОП 3 СЕГМЕНТА ПО ВОСТРЕБОВАННОСТИ',
  3:  'ВЫБОР СЕГМЕНТА',
  4:  '5 ПОДСЕГМЕНТОВ',
  5:  'ВЫБОР ПОДСЕГМЕНТА',
  6:  'СПИСОК «ХОЧУ»',
  7:  '10 ЗАПРОСОВ СЕГМЕНТА',
  8:  'ТОП 3 ЗАПРОСА',
  9:  'ВЫБОР ЗАПРОСА',
  10: 'БОЛЕЗНЕННЫЕ ВОПРОСЫ',
  11: 'СОКРОВЕННЫЕ ЖЕЛАНИЯ',
  12: 'КОНЕЧНЫЙ РЕЗУЛЬТАТ',
  13: 'ЧТО БЕСИТ БОЛЬШЕ ВСЕГО',
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
  const ctx  = `Контекст проекта:\n${projectContext || 'Контекст пока не заполнен.'}\n\n`;
  const baseRules = [
    'Работай строго на основе контекста проекта, выбранных ответов и текущего шага.',
    'Не подставляй психологию, коучинг или любую другую нишу, если она прямо не следует из контекста.',
    'Пиши конкретно для ниши пользователя, без универсальных клише и без абстрактного маркетингового языка.',
    'Если данных мало, делай аккуратные гипотезы из контекста, но не проси уточнений.',
  ].join('\n');
  const expertRole = [
    'Роль на этом шаге: ты отвечаешь как сам эксперт/проект пользователя.',
    'У тебя 25 лет практического опыта в этой нише, большая клиентская база и глубокое понимание реальных ситуаций клиентов.',
    'Ты видишь рынок изнутри: кто покупает, у кого боль острее, кто быстрее принимает решение и где выше коммерческий потенциал.',
  ].join('\n');
  const clientRole = [
    'Роль на этом шаге: ты НЕ маркетолог и НЕ эксперт. Ты выбранный клиент.',
    `Выбранный сегмент: ${seg || 'не указан'}.`,
    `Выбранный подсегмент: ${sub || 'не указан'}.`,
    `Выбранный запрос: ${req || 'не указан'}.`,
    'Пиши языком обычного клиента: просто, живо, от первого лица, без терминов, без экспертных диагнозов и без красивых маркетинговых формулировок.',
  ].join('\n');
  const expertCtx = `${ctx}${baseRules}\n\n${expertRole}\n\n`;
  const clientCtx = `${ctx}${baseRules}\n\n${clientRole}\n\n`;
  const strictPrefix = strict
    ? 'ВАЖНО: Выдай ТОЛЬКО пронумерованный список. Никаких вопросов. Никаких уточнений. Только список в точном формате ниже.\n\n'
    : '';
  switch (stepId) {
    case 1:  return expertCtx + 'Сгенерируй 10 сегментов целевой аудитории. Сегменты должны быть коммерчески осмысленными: разные ситуации, разные мотивы покупки, разные уровни срочности боли. Для каждого сегмента укажи: название сегмента, ситуацию «Когда:», желание «Хочу:» и цель «Чтобы:». Формат строго: «Сегмент N — **[название]**». Строго 10 сегментов.';
    case 2:  return expertCtx + strictPrefix + `Из этих 10 сегментов:\n${answers.segments ?? ''}\n\nВыбери ТОП 3 сегмента по сумме факторов: острота боли, платежеспособность, срочность запроса, понятность оффера и вероятность покупки. Никаких вопросов, никаких уточнений.\nФормат СТРОГО (только это, ничего лишнего):\n🥇 Сегмент 1 — [название]\n[1–2 предложения почему]\n🥈 Сегмент 2 — [название]\n[1–2 предложения почему]\n🥉 Сегмент 3 — [название]\n[1–2 предложения почему]`;
    case 4:  return expertCtx + strictPrefix + `Для выбранного сегмента «${seg}» выдай ТОЛЬКО список из 5 подсегментов. Подсегменты должны отличаться конкретной ситуацией, мотивацией и покупательской готовностью.\nФормат СТРОГО (только это, ничего лишнего):\nПодсегмент 1 — [название]\nКогда: ...\nХочу: ...\nЧтобы: ...\nПодсегмент 2 — [название]\nКогда: ...\nХочу: ...\nЧтобы: ...\n(и так далее до Подсегмент 5)`;
    case 6:  return expertCtx + `Для подсегмента «${sub}» составь список «ХОЧУ» — 10–12 конкретных желаний клиентов. Формулируй так, как клиенты реально говорят на консультации, в заявке, в переписке или в голове. Начинай каждый пункт с «• Хочу».`;
    case 7:  return expertCtx + strictPrefix + `Для сегмента «${seg}» (подсегмент: «${sub}») выдай ТОЛЬКО список из 10 конкретных запросов, с которыми клиент мог бы прийти к эксперту. Запросы должны быть живыми, покупательскими и привязанными к ситуации подсегмента.\nФормат СТРОГО (только список, ничего лишнего):\n1. [запрос на живом языке клиента]\n2. [запрос]\n...\n10. [запрос]`;
    case 8:  return expertCtx + strictPrefix + `Из этих 10 запросов:\n${answers.requests ?? ''}\n\nОпредели ТОП 3 запроса по срочности, боли, частоте встречаемости и вероятности покупки. Покажи короткую логику выбора.\nФормат СТРОГО:\n🥇 Запрос 1 — [формулировка запроса]\n[1–2 предложения почему]\n🥈 Запрос 2 — [формулировка запроса]\n[1–2 предложения почему]\n🥉 Запрос 3 — [формулировка запроса]\n[1–2 предложения почему]`;
    case 10: return clientCtx + 'Напиши 8–10 болезненных вопросов, которые я как клиент задаю себе внутри по выбранному запросу. Каждый вопрос должен звучать как реальная мысль в голове. Начинай каждый пункт с «•».';
    case 11: return clientCtx + 'Опиши 6–8 сокровенных желаний, которые я как клиент обычно не произношу вслух, но очень хочу получить. Пиши от первого лица: «Я хочу...», «Мне хочется...», «Я мечтаю...». Начинай каждый пункт с «•».';
    case 12: return clientCtx + 'Сформулируй одним живым предложением главный конечный результат, к которому я как клиент хочу прийти. Не пиши «после работы с экспертом/психологом/специалистом». Опиши именно желаемое изменение в моей жизни, бизнесе или ситуации.';
    case 13: return clientCtx + 'Напиши монолог от первого лица (150–250 слов): что меня больше всего бесит, изматывает и уже достало в этой ситуации. Максимально живо, эмоционально и на языке клиента. Без заголовков.';
    default: return expertCtx + `Шаг ${stepId}: продолжи анализ целевой аудитории.`;
  }
}

function stripMd(s: string): string {
  return s.replace(/\*+/g, '').replace(/__/g, '').trim();
}

function parseChoiceOptions(stepId: number, text: string): string[] {
  if (stepId === 9) {
    const requestOptions = parseRequestChoiceOptions(text);
    if (requestOptions.length >= 2) return requestOptions;
  }

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
      /(?:^|\n)\s*\*{0,2}[🥇🥈🥉]\s*\*{0,2}\s*(?:(?:сегмент|запрос|вариант)\s+\d+\s*[—\-–]\s*)?([^\n*:]{3,})/gim,
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

function cleanChoiceLine(line: string): string {
  return stripMd(line)
    .replace(/^[\s#.)🥇🥈🥉—\-–:«»]+/, '')
    .replace(/^(?:топ\s*)?(?:сегмент|подсегмент|запрос|вариант)\s*\d*\s*[—\-–:.)]*/i, '')
    .replace(/^[«"“”]+|[»"“”]+$/g, '')
    .trim();
}

function parseRequestChoiceOptions(text: string): string[] {
  const matches: string[] = [];
  const push = (value: string | undefined) => {
    const cleaned = cleanChoiceLine(value ?? '').split(/\s+—\s+почему/i)[0].trim();
    if (cleaned.length >= 8 && cleaned.length <= 180 && !/^(почему|логика|вывод|итого)/i.test(cleaned)) {
      matches.push(cleaned);
    }
  };

  for (const m of text.matchAll(/(?:^|\n)\s*[🥇🥈🥉]\s*(?:\*{0,2}(?:запрос\s*\d*)\*{0,2}\s*[—\-–:])?\s*([^\n]+)/gim)) {
    push(m[1]);
  }

  if (matches.length < 2) {
    for (const m of text.matchAll(/(?:^|\n)\s*(?:\d+[.)]|[-•])\s*(?:\*{0,2}(?:запрос\s*\d*)\*{0,2}\s*[—\-–:])?\s*([^\n]+)/gim)) {
      push(m[1]);
    }
  }

  if (matches.length < 2) {
    for (const m of text.matchAll(/(?:^|\n)\s*\*{0,2}запрос\s*\d+\*{0,2}\s*[—\-–:]\s*([^\n]+)/gim)) {
      push(m[1]);
    }
  }

  return Array.from(new Set(matches)).slice(0, 3);
}

function filterOutQuestions(options: string[]): string[] {
  return options.filter((opt) => {
    if (opt.includes('?')) return false;
    if (/^(кто|что|как|когда|почему|зачем|какой|какая|какие|уточни|можете|расскажи|поясни)/i.test(opt)) return false;
    return true;
  });
}

function normalizeChoiceOptions(stepId: number, text: string): string[] {
  const options = parseChoiceOptions(stepId, text);
  return stepId === 9 ? options : filterOutQuestions(options);
}

function buildChoiceOptionsFallback(
  stepId: number,
  answers: Partial<AudienceAnswers>,
  positioning: PositioningData | null,
): string[] {
  if (stepId === 9) {
    const fromTop = parseRequestChoiceOptions(answers.top3requests ?? '');
    if (fromTop.length >= 2) return fromTop;

    const fromRequests = parseRequestChoiceOptions(answers.requests ?? '');
    if (fromRequests.length >= 2) return fromRequests.slice(0, 3);

    return [
      'Самый срочный запрос клиента',
      'Запрос с самой сильной эмоциональной болью',
      'Запрос, по которому клиент быстрее готов купить решение',
    ];
  }

  return buildFallbackOptions(stepId, positioning);
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

function isAffirmativeChoice(text: string): boolean {
  return /^(да|ок|окей|выбираю|хочу выбрать|берем|берём|подтверждаю|согласен|согласна|продолжаем|продолжай|готов|готова|готов продолжать|готова продолжать|двигаемся дальше|идем дальше|идём дальше|давай дальше)/i.test(text.trim());
}

function looksLikeContinueIntent(text: string): boolean {
  return /(продолж|готов|дальше|двигаемся|идем|идём|выбираю|берем|берём|подтверждаю)/i.test(text.trim());
}

function extractChoiceCandidate(text: string, stepId: number): string | null {
  const bold = [...text.matchAll(/\*\*([^*\n]{4,140})\*\*/g)].map((m) => m[1].trim()).filter(Boolean);
  if (bold.length) return bold[bold.length - 1];

  const quoted = [...text.matchAll(/[«"]([^»"\n]{4,140})[»"]/g)].map((m) => m[1].trim()).filter(Boolean);
  if (quoted.length) return quoted[quoted.length - 1];

  const label = stepId === 3 ? 'сегмент' : stepId === 5 ? 'подсегмент' : 'запрос';
  const byLabel = text.match(new RegExp(`${label}\\s*[—:-]\\s*([^\\n.?!]{4,140})`, 'i'))?.[1]?.trim();
  if (byLabel) return byLabel;

  const direct = text
    .replace(/^(добавь|добавить|предложи|хочу выбрать|выбираю|берем|берём)\s+/i, '')
    .replace(new RegExp(`^${label}\\s*`, 'i'), '')
    .trim();
  if (direct.length >= 8 && direct.length <= 140 && !direct.includes('?')) return direct;

  return null;
}

function previousChoiceSourceKey(stepId: number): keyof AudienceAnswers | null {
  if (stepId === 3) return 'top3segments';
  if (stepId === 5) return 'subsegments';
  if (stepId === 9) return 'top3requests';
  return null;
}

function nextStepId(stepId: number): number {
  const index = STEPS.findIndex((step) => step.id === stepId);
  return STEPS[index + 1]?.id ?? 99;
}

function firstIncompleteStepId(answers: Partial<AudienceAnswers>): number {
  const ans = answers as Record<string, string | undefined>;
  const next = STEPS.find((step) => {
    if (step.answerKey) return !ans[step.answerKey];
    if (step.choiceKey) return !ans[step.choiceKey];
    return false;
  });
  return next?.id ?? 1;
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
  const getSettings = useModelStore((st) => st.getSettings);
  const unpackingProfile = useUnpackingStore((st) => st.profileData);

  const audienceSave  = useAudienceStore((st) => st.save);
  const audienceReset = useAudienceStore((st) => st.reset);
  const audienceGet   = useAudienceStore((st) => st.get);
  const upsertMaterial = useMaterialsStore((st) => st.upsertMaterial);

  const [stepStatuses,  setStepStatuses]  = useState<StepStatus[]>(() => STEPS.map(() => 'idle'));
  const [docEntries,    setDocEntries]    = useState<DocEntry[]>([]);
  const [isRunning,     setIsRunning]     = useState(false);
  const [completed,     setCompleted]     = useState(false);
  const [pdfLoading,    setPdfLoading]    = useState(false);
  const [pdfError,      setPdfError]      = useState(false);
  const [aiError,       setAiError]       = useState<string | null>(null);
  const [failedStepId,  setFailedStepId]  = useState<number | null>(null);
  const [positioningData, setPositioningData] = useState<PositioningData | null>(null);
  const [stepChatMessages, setStepChatMessages] = useState<StepChatMessage[]>([]);
  const [stepChatInput, setStepChatInput] = useState('');
  const [stepChatLoading, setStepChatLoading] = useState(false);
  const [pendingCustomChoice, setPendingCustomChoice] = useState<string | null>(null);

  const resolveChoiceRef  = useRef<((v: string) => void) | null>(null);
  const abortRef          = useRef<{ aborted: boolean }>({ aborted: false });
  const isRetryingRef     = useRef(false);
  const answersRef        = useRef<Partial<AudienceAnswers>>({});
  const docColRef         = useRef<HTMLDivElement>(null);
  const docEndRef         = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const buildRuntimeContext = useCallback(() => {
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
      profileCtx ? `Информация об эксперте:\n${profileCtx}` : '',
    ].filter(Boolean).join('\n\n');

    return { projectContext, mergedProfile };
  }, [activeProjectName, positioningData, unpackingProfile]);

  async function runAudienceWorkflow(prompt: string, mergedProfile: Record<string, string>): Promise<string> {
    const settings = getSettings('audience');
    const resp = await aiApi.startWorkflow('strategy.audience.generate', {
      projectId: activeProjectId,
      provider: settings.provider,
      openaiModel: settings.openaiModel,
      claudeModel: settings.claudeModel,
      inputs: {
        prompt,
        activeProjectName,
        unpackingProfile: mergedProfile,
      },
    });
    return resp.content;
  }

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
      // keep in-memory progress; next successful save will persist to DB
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

    // Restore partial progress from in-memory store while DB request is loading
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
    let waitingChoiceId: number | null = null;
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
        } else if (waitingChoiceId === null) {
          const sourceKey = previousChoiceSourceKey(step.id);
          const source = sourceKey ? ans[sourceKey] ?? '' : '';
          const nextStepHasAnswer = STEPS
            .filter((s) => s.id > step.id)
            .some((s) => (s.answerKey && ans[s.answerKey]) || (s.choiceKey && ans[s.choiceKey]));

          if (source && !nextStepHasAnswer) {
            const options = normalizeChoiceOptions(step.id, source);
            entries.push({
              stepId: step.id,
              type: 'choice',
              title: STEP_TITLES[step.id],
              fullText: '',
              displayedText: '',
              isTyping: false,
              options: options.length >= 2 ? options : buildChoiceOptionsFallback(step.id, answers, positioningData),
              chosen: undefined,
            });
            statuses[step.id - 1] = 'choice';
            waitingChoiceId = step.id;
          }
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

    const { projectContext, mergedProfile } = buildRuntimeContext();

    for (const step of STEPS) {
      if (abort.aborted) break;
      if (step.id < fromStepId) continue;

      if (step.type === 'auto') {
        setStepStatuses((prev) => prev.map((st, i) => (i === step.id - 1 ? 'running' : st)));
        if (abort.aborted) break;

        let content: string;
        try {
          const prompt = buildStepPrompt(step.id, answers, projectContext);
          content = await runAudienceWorkflow(prompt, mergedProfile);
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
        const prevKey = step.id === 3 ? 'top3segments' : step.id === 5 ? 'subsegments' : 'top3requests';
        const prevContent = (answers as Record<string, string>)[prevKey] ?? '';
        console.log(`[Audience] choice step ${step.id}, prevContent length=${prevContent.length}`);

        let options: string[] = [];
        if (prevContent) {
          options = normalizeChoiceOptions(step.id, prevContent);

          if (options.length < 2 && !isRetryingRef.current) {
            console.warn(`[Audience step ${step.id}] only ${options.length} options, retrying strict`);
            isRetryingRef.current = true;
            try {
              const sourceStepId = step.id === 3 ? 2 : step.id === 5 ? 4 : 8;
              const strictPrompt = buildStepPrompt(sourceStepId, answers, projectContext, true);
              const retryContent = await runAudienceWorkflow(strictPrompt, mergedProfile);
              const retryOptions = normalizeChoiceOptions(step.id, retryContent);
              if (retryOptions.length >= 2) {
                options = retryOptions;
                const prevAnsKey = step.id === 3 ? 'top3segments' : step.id === 5 ? 'subsegments' : 'top3requests';
                answers[prevAnsKey as keyof AudienceAnswers] = retryContent;
                answersRef.current = { ...answers };
                updateDocEntry(sourceStepId, { fullText: retryContent, displayedText: retryContent });
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
          options = buildChoiceOptionsFallback(step.id, answers, positioningData);
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
      upsertMaterial(activeProjectId, buildAudienceMaterial(answers));
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
    setStepChatMessages([]);
    setPendingCustomChoice(null);
    setIsRunning(true);
    void runAnalysis(1);
  }

  function handleContinueAnalysis() {
    if (isRunning || completed) return;
    const pendingChoice = docEntries.find((entry) => entry.type === 'choice' && !entry.chosen);
    if (pendingChoice) {
      toast('Сначала выберите вариант, чтобы продолжить', { icon: '👆' });
      return;
    }

    const fromStepId = firstIncompleteStepId(answersRef.current);
    abortRef.current = { aborted: false };
    setFailedStepId(null);
    setAiError(null);
    setPendingCustomChoice(null);
    setIsRunning(true);
    void runAnalysis(fromStepId);
  }

  function retryStep(stepId: number) {
    const sourceStepId = stepId === 3 ? 2 : stepId === 5 ? 4 : stepId === 9 ? 8 : stepId;
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
    setStepChatMessages([]);
    setPendingCustomChoice(null);
    abortRef.current = { aborted: false };
    setIsRunning(true);
    void runAnalysis(sourceStepId);
  }

  function handleConfirmChoice(value: string) {
    if (resolveChoiceRef.current) {
      resolveChoiceRef.current(value);
      resolveChoiceRef.current = null;
      setPendingCustomChoice(null);
      return;
    }

    const choiceEntry = [...docEntries].reverse().find((entry) => entry.type === 'choice' && !entry.chosen);
    const step = choiceEntry ? STEPS.find((item) => item.id === choiceEntry.stepId) : null;
    if (!choiceEntry || !step?.choiceKey) {
      setPendingCustomChoice(null);
      return;
    }

    const answers = { ...answersRef.current, [step.choiceKey]: value };
    answersRef.current = answers;
    updateDocEntry(step.id, { chosen: value });
    setStepStatuses((prev) => prev.map((st, i) => (STEPS[i].id === step.id ? 'done' : st)));
    persistAudienceProgress(answers, false);
    abortRef.current = { aborted: false };
    setIsRunning(true);
    void runAnalysis(step.id + 1);
    setPendingCustomChoice(null);
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
    setStepChatMessages([]);
    setStepChatInput('');
    setPendingCustomChoice(null);
    audienceReset(activeProjectId);
    persistAudienceProgress({}, false);
    toast('Анализ сброшен', { icon: '↺' });
  }

  async function handleStepChat() {
    const question = stepChatInput.trim();
    if (!question || stepChatLoading) return;

    const currentEntry = [...docEntries].reverse().find((entry) => entry.stepId !== 99);
    const stepTitle = currentEntry ? STEP_TITLES[currentEntry.stepId] : 'ЦЕЛЕВАЯ АУДИТОРИЯ';
    const stepId = currentEntry?.stepId ?? 0;
    const isChoicePending = Boolean(currentEntry?.type === 'choice' && !currentEntry.chosen);
    const questionCandidate = currentEntry && isChoicePending
      ? extractChoiceCandidate(question, currentEntry.stepId)
      : null;
    const currentResult = currentEntry
      ? currentEntry.chosen
        ? `Выбор пользователя: ${currentEntry.chosen}`
        : currentEntry.fullText
      : 'Результатов по шагам пока нет.';
    const history = stepChatMessages.slice(-8).map((msg) => ({
      role: msg.role,
      content: `[${msg.stepTitle}] ${msg.content}`,
    }));
    const { projectContext, mergedProfile } = buildRuntimeContext();

    const userMsg: StepChatMessage = { role: 'user', content: question, stepTitle, stepId };

    if (isChoicePending && pendingCustomChoice && isAffirmativeChoice(question)) {
      setStepChatMessages((prev) => [
        ...prev,
        userMsg,
        {
          role: 'assistant',
          content: `Чтобы продолжить с вариантом «${pendingCustomChoice}», нажмите кнопку “Продолжить с ним” ниже. Если это была просто идея, выберите один из вариантов выше или обсудите еще.`,
          stepTitle,
          stepId,
        },
      ]);
      setStepChatInput('');
      return;
    }

    if (isChoicePending && looksLikeContinueIntent(question)) {
      setStepChatMessages((prev) => [
        ...prev,
        userMsg,
        {
          role: 'assistant',
          content: pendingCustomChoice
            ? `Вижу вариант из переписки: «${pendingCustomChoice}». Я не буду выбирать его автоматически. Нажмите “Продолжить с ним”, если точно хотите работать с ним, или выберите один из вариантов выше.`
            : 'Чтобы продолжить, выберите один из вариантов выше. Если хотите добавить свой вариант, напишите его явно.',
          stepTitle,
          stepId,
        },
      ]);
      setStepChatInput('');
      return;
    }

    if (questionCandidate) {
      setPendingCustomChoice(questionCandidate);
    }

    setStepChatMessages((prev) => [...prev, userMsg]);
    setStepChatInput('');
    setStepChatLoading(true);

    try {
      const content = await runAudienceWorkflow([
          `Контекст проекта:\n${projectContext}`,
          `Текущий шаг: ${stepTitle}`,
          `Текущий результат шага:\n${currentResult}`,
          `Вопрос пользователя:\n${question}`,
          isChoicePending
            ? 'Ответь как AI-маркетолог. Если пользователь предлагает новый вариант, кратко оцени его и сформулируй название варианта в жирном формате **...**. Не спрашивай "готов ли продолжать" и не проси написать, когда пользователь будет готов. Если пользователь хочет продолжить, скажи выбрать вариант кнопкой в интерфейсе.'
            : 'Ответь как AI-маркетолог. Если пользователь просит добавить варианты, предложи конкретные дополнительные варианты. Не запускай следующий шаг автоматически.',
          `История переписки:\n${history.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
        ].join('\n\n'), mergedProfile);
      const responseCandidate = currentEntry && isChoicePending
        ? extractChoiceCandidate(content, currentEntry.stepId)
        : null;
      if (responseCandidate) setPendingCustomChoice(responseCandidate);
      setStepChatMessages((prev) => [...prev, { role: 'assistant', content, stepTitle, stepId }]);
    } catch {
      toast.error('Не удалось получить ответ в чате шага');
      setStepChatMessages((prev) => prev.filter((msg) => msg !== userMsg));
    } finally {
      setStepChatLoading(false);
    }
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

  const runBtnDisabled = isRunning || completed;
  const activeStepEntry = [...docEntries].reverse().find((entry) => entry.stepId !== 99);
  const activeStepTitle = activeStepEntry ? STEP_TITLES[activeStepEntry.stepId] : 'ЦЕЛЕВАЯ АУДИТОРИЯ';
  const hasPartialProgress = docEntries.some((entry) => entry.stepId !== 99);
  const hasPendingChoice = docEntries.some((entry) => entry.type === 'choice' && !entry.chosen);
  const primaryActionLabel = isRunning
    ? 'Анализ...'
    : hasPartialProgress
      ? hasPendingChoice
        ? 'Выберите вариант'
        : 'Продолжить анализ'
      : '▶ Запустить анализ';
  const primaryAction = hasPartialProgress ? handleContinueAnalysis : handleStartAnalysis;

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
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>13-шаговый AI-анализ</p>

          {!completed && (
            <button
              onClick={primaryAction}
              disabled={runBtnDisabled || hasPendingChoice}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                backgroundColor: runBtnDisabled || hasPendingChoice ? '#F0EEE8' : '#D4A847',
                color: runBtnDisabled || hasPendingChoice ? '#bbb' : '#fff',
                fontSize: 13, fontWeight: 500, cursor: runBtnDisabled || hasPendingChoice ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {isRunning ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 12 }}>⟳</span>
                  {primaryActionLabel}
                </>
              ) : primaryActionLabel}
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
        style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}
      >
        {/* Chat body */}
        <div ref={docColRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 12px', minHeight: 0 }}>
          {docEntries.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 320, gap: 16, textAlign: 'center', maxWidth: 900, margin: '0 auto',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, backgroundColor: '#F5F4F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}>🧠</div>
              <p style={{ fontSize: 14, color: '#888', maxWidth: 360, lineHeight: 1.6 }}>
                Нажмите «Запустить анализ» — ИИ автоматически проработает 13 шагов стратегии на основе вашего позиционирования.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                const chatForEntry = stepChatMessages.filter((msg) => {
                  const upperBound = nextStepId(entry.stepId);
                  return msg.stepId >= entry.stepId && msg.stepId < upperBound;
                });

                const renderStepChat = chatForEntry.map((msg, idx) => (
                  <div
                    key={`${entry.stepId}-${msg.stepTitle}-${idx}`}
                    style={{
                      display: 'flex',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                      gap: 10,
                      alignItems: 'flex-end',
                    }}
                  >
                    {msg.role === 'assistant' && (
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: '#D4A847', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff',
                      }}>AI</div>
                    )}
                    <div style={{
                      maxWidth: 'min(720px, 74%)', padding: '12px 16px',
                      borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                      background: msg.role === 'user' ? '#1a1a1a' : '#F5F4F0',
                      color: msg.role === 'user' ? '#fff' : '#1a1a1a',
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}>
                      <div style={{ fontSize: 10, color: msg.role === 'user' ? 'rgba(255,255,255,0.55)' : '#888', marginBottom: 4 }}>
                        {msg.role === 'user' ? 'Вы' : 'AI'} · {msg.stepTitle}
                      </div>
                      {msg.role === 'assistant'
                        ? <FormattedText compact>{msg.content}</FormattedText>
                        : <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>}
                      {msg.role === 'assistant' && <MessageActions content={msg.content} compact />}
                    </div>
                  </div>
                ));

                if (entry.type === 'text') {
                  return (
                    <Fragment key={entry.stepId}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          background: '#D4A847', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff',
                        }}>AI</div>
                        <div style={{
                          maxWidth: 'min(720px, 74%)', padding: '12px 16px',
                          borderRadius: '12px 12px 12px 0', background: '#F5F4F0',
                          color: '#1a1a1a', fontSize: 14, lineHeight: 1.6,
                        }}>
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
                            <FormattedText compact>{entry.fullText}</FormattedText>
                          )}
                          {!entry.isTyping && <MessageActions content={entry.fullText} compact />}
                        </div>
                      </div>
                      {renderStepChat}
                    </Fragment>
                  );
                }

                if (entry.chosen) {
                  return (
                    <Fragment key={entry.stepId}>
                      <div style={{ display: 'flex', flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-end' }}>
                        <div style={{
                          maxWidth: 'min(720px, 74%)', padding: '12px 16px',
                          borderRadius: '12px 12px 0 12px', background: '#1a1a1a',
                          color: '#fff', fontSize: 14, lineHeight: 1.6,
                        }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>Выбор пользователя</div>
                          {entry.stepId === 3 ? 'Выбранный сегмент' :
                           entry.stepId === 5 ? 'Выбранный подсегмент' :
                           'Выбранный запрос'}:{' '}
                          <strong>{entry.chosen}</strong>
                        </div>
                      </div>
                      {renderStepChat}
                    </Fragment>
                  );
                }

                return (
                  <Fragment key={entry.stepId}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: '#D4A847', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff',
                      }}>AI</div>
                      <div style={{ maxWidth: 'min(720px, 74%)', width: '100%' }}>
                        <ChoiceCard
                          title={STEP_TITLES[entry.stepId]}
                          options={entry.options ?? []}
                          onConfirm={handleConfirmChoice}
                        />
                      </div>
                    </div>
                    {renderStepChat}
                  </Fragment>
                );
              })}
              {stepChatLoading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: '#D4A847', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff',
                  }}>AI</div>
                  <div style={{
                    display: 'flex', gap: 5, padding: '14px 18px',
                    borderRadius: '12px 12px 12px 0', background: '#F5F4F0',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite 0.2s' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite 0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={docEndRef} />
            </div>
          )}
        </div>

        <div style={{
          flexShrink: 0, borderTop: '1px solid #E5E3DC',
          background: '#fff', padding: '10px 28px 8px',
        }}>
          {activeStepEntry?.type === 'choice' && !activeStepEntry.chosen && pendingCustomChoice && (
            <div style={{
              maxWidth: 900, margin: '0 auto 10px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, padding: '10px 12px',
              border: '1px solid #EAD8A6', borderRadius: 8, background: '#FFF8E7',
              color: '#6F5520', fontSize: 13,
            }}>
              <span>
                Вариант из переписки: <strong>{pendingCustomChoice}</strong>
              </span>
              <button
                onClick={() => handleConfirmChoice(pendingCustomChoice)}
                style={{
                  border: 'none', borderRadius: 7, background: '#D4A847',
                  color: '#fff', padding: '8px 12px', fontWeight: 700, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Продолжить с ним
              </button>
            </div>
          )}
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <MessageInput
              value={stepChatInput}
              onChange={setStepChatInput}
              onSend={() => void handleStepChat()}
              isLoading={stepChatLoading}
              disabled={!activeStepEntry}
              section="audience"
              placeholder={activeStepEntry ? `Спросите по шагу: ${activeStepTitle.toLowerCase()}...` : 'Сначала запустите анализ, затем можно будет уточнять каждый шаг...'}
            />
          </div>
          <div style={{ maxWidth: 900, margin: '5px auto 0', color: '#aaa', fontSize: 10.5, textAlign: 'right' }}>
            Enter — отправить · Shift+Enter — перенос строки
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.85); }
          30% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
