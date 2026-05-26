import { useState, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { ModelBar } from '../../components/MessageInput/MessageInput';
import { aiApi } from '../../api/ai';
import { useModelStore } from '../../store/model.store';
import type { ContentItem } from '../../api/content.api';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import { isMigrated, markMigrated, metadataString, readLegacyObjectWithProjectFallback } from '../../utils/generatedContentPersistence';
import s from './ChatbotChains.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Format = 'article' | 'video';
type Phase  = 'step1' | 'generating' | 'step2';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface ChainMessage {
  id:            string;
  index:         number;
  part:          1 | 2 | 3;
  role:          string;
  dayDelay:      number;
  content:       string;
  editedContent: string;
}

interface StoredChain {
  dbId?:           string;
  format:          Format;
  botName:         string;
  meetingSchedule: string;
  messages:        ChainMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: 'ЧАСТЬ 1 — ЛИД-МАГНИТ',
  2: 'ЧАСТЬ 2 — МИНИ-ПРОДУКТ',
  3: 'ЧАСТЬ 3 — ВСТРЕЧА',
};

const MSG_DEFS: Array<{ index: number; part: 1|2|3; role: string; dayDelay: number }> = [
  { index: 1,  part: 1, role: 'Приветствие',    dayDelay: 0  },
  { index: 2,  part: 1, role: 'Боль',            dayDelay: 1  },
  { index: 3,  part: 1, role: 'Инсайт',          dayDelay: 2  },
  { index: 4,  part: 1, role: 'История клиента', dayDelay: 3  },
  { index: 5,  part: 1, role: 'Дожим',           dayDelay: 4  },
  { index: 6,  part: 2, role: 'Переход',         dayDelay: 5  },
  { index: 7,  part: 2, role: 'Проблема глубже', dayDelay: 6  },
  { index: 8,  part: 2, role: 'Продукт',         dayDelay: 7  },
  { index: 9,  part: 2, role: 'Возражение',      dayDelay: 9  },
  { index: 10, part: 2, role: 'Призыв',          dayDelay: 10 },
  { index: 11, part: 3, role: 'Анонс',           dayDelay: 12 },
  { index: 12, part: 3, role: 'Ценность',        dayDelay: 14 },
  { index: 13, part: 3, role: 'Последний шанс',  dayDelay: 16 },
];

// ─── Seed chain ───────────────────────────────────────────────────────────────

function makeSeedChain(): StoredChain {
  const msgs: ChainMessage[] = [
    {
      id: 'c1', index: 1, part: 1, role: 'Приветствие', dayDelay: 0,
      content:
`Привет! Рада, что вы здесь 👋

Я отправлю вам несколько коротких сообщений — они помогут разобраться, почему одни и те же ссоры повторяются снова и снова.

Сначала — самое важное.

Получите статью «5 причин почему пары ссорятся об одном и том же» — пришлю прямо сейчас.

👇 Нажмите «Получить статью»`,
      editedContent: '',
    },
    {
      id: 'c2', index: 2, part: 1, role: 'Боль', dayDelay: 1,
      content:
`Скажите честно — вы узнаёте эту ситуацию?

Поссорились. Помирились. Прошло две-три недели — и всё сначала. Та же тема, те же слова, то же ощущение: «ну вот опять».

Это не значит, что вы несовместимы. Это значит, что за видимым конфликтом есть кое-что другое.

Именно об этом — статья.

Прочитали? Что отозвалось больше всего?`,
      editedContent: '',
    },
    {
      id: 'c3', index: 3, part: 1, role: 'Инсайт', dayDelay: 2,
      content:
`Один из главных инсайтов из статьи:

Видимая тема конфликта — почти никогда не настоящая тема конфликта.

Когда партнёр злится из-за посуды — за этим стоит: «Мне важно, чтобы ты замечал мои усилия».

Когда уходит в молчание — это: «Я не знаю, как быть услышанным, не разрушив всё».

Оба говорят о разном. Используя одни и те же слова.

Узнаёте?`,
      editedContent: '',
    },
    {
      id: 'c4', index: 4, part: 1, role: 'История клиента', dayDelay: 3,
      content:
`Расскажу про Машу и Игоря (с разрешения).

Вместе 4 года. Ссорились по одному кругу раз в три недели. Маша чувствовала: Игорь не вкладывается. Игорь чувствовал: каждый его шаг оказывается недостаточным.

Я попросила каждого написать: «Что значит для меня быть в хороших отношениях?»

Маша: «Планировать будущее вместе, замечать мелочи».
Игорь: «Доверие. Свобода быть собой».

Они прочитали это друг другу. Первый раз за 4 года.

Маша: «Я не знала, что тебе важна свобода».
Игорь: «Я не понимал, что ты ждёшь инициативы».

4 года ссор — один лист бумаги.`,
      editedContent: '',
    },
    {
      id: 'c5', index: 5, part: 1, role: 'Дожим', dayDelay: 4,
      content:
`Последнее сообщение о статье.

Если вы её прочитали — у вас уже есть понимание, почему конфликты повторяются.

Но понимание и изменение — это разные вещи.

Следующий шаг — научиться говорить о потребностях прямо. Без претензий. Без обид.

Именно этому посвящён мой интенсив «Первый шаг» — 3 часа практики.

Расскажу о нём завтра.`,
      editedContent: '',
    },
    {
      id: 'c6', index: 6, part: 2, role: 'Переход', dayDelay: 5,
      content:
`Как и обещала — рассказываю.

Я провожу интенсив «Первый шаг». Это 3 часа живой работы — не лекция. Мы разбираем реальные ситуации, практикуем инструменты, делаем первый шаг из замкнутого круга конфликтов.

Для кого это:
— Разговоры о проблемах превращаются в новые ссоры
— Вы понимаете, что идёт не так, но не знаете с чего начать
— Хотите изменить динамику, но не знаете как

Завтра расскажу подробнее.`,
      editedContent: '',
    },
    {
      id: 'c7', index: 7, part: 2, role: 'Проблема глубже', dayDelay: 6,
      content:
`Вот что я вижу снова и снова.

Люди понимают, что происходит. Читают книги, знают теорию. И всё равно ссорятся.

Потому что понимание — один уровень. Изменение паттерна — другой.

Паттерн живёт в теле, в рефлексах, в автоматических реакциях. Его нельзя «понять» — его нужно практиковать.

Именно поэтому интенсив — это практика. Не слова.

3 часа работы = годы сэкономленного времени на одинаковые ссоры.`,
      editedContent: '',
    },
    {
      id: 'c8', index: 8, part: 2, role: 'Продукт', dayDelay: 7,
      content:
`Интенсив «Первый шаг» — что внутри:

✦ Разбор вашей конкретной ситуации
✦ Техника «потребность вместо претензии»
✦ Как начать трудный разговор без эскалации
✦ Практика «мягкого начала» по Готтману
✦ Упражнение «карта ожиданий» для пары

Формат: онлайн, 3 часа, живое взаимодействие.

Стоимость: [цена]
Ближайшая дата: [дата]

Вопросы — пишите сюда.`,
      editedContent: '',
    },
    {
      id: 'c9', index: 9, part: 2, role: 'Возражение', dayDelay: 9,
      content:
`Знаю, что у некоторых сейчас мысль: «Три часа — это много».

Давайте честно.

Средняя пара ссорится об одном и том же 6 лет до того, как обратиться за помощью. Это примерно 300 ссор. Каждая — час напряжения, молчание, примирение, снова.

3 часа практики против 300 часов одинаковых конфликтов.

Это не много. Это мало.`,
      editedContent: '',
    },
    {
      id: 'c10', index: 10, part: 2, role: 'Призыв', dayDelay: 10,
      content:
`Регистрация на интенсив «Первый шаг» открыта.

Мест немного — работаю в небольших группах, чтобы каждый получил внимание.

Если чувствуете, что пора что-то изменить — это сигнал.

👉 [ссылка на оплату или запись]

Если есть вопросы — напишите. Отвечу лично.`,
      editedContent: '',
    },
    {
      id: 'c11', index: 11, part: 3, role: 'Анонс', dayDelay: 12,
      content:
`Хочу пригласить вас на кое-что особенное.

Каждую пятницу в 19:00 МСК я провожу живой разбор «Психология отношений: разбор ситуаций».

Это не вебинар. Живой разговор, где я разбираю реальные вопросы от подписчиков.

Бесплатно. Каждую пятницу.

В эту пятницу: как говорить о конфликте, не разрушая близость.

Хотите прийти?`,
      editedContent: '',
    },
    {
      id: 'c12', index: 12, part: 3, role: 'Ценность', dayDelay: 14,
      content:
`Зачем приходить на разбор, если можно просто читать?

Читая — вы получаете информацию. На разборе — видите как это работает на живых ситуациях. Ваших или похожих.

Плюс: можно задать вопрос анонимно. Я разберу его вживую.

Несколько человек после разборов говорили: «Один вопрос изменил то, как я думаю об этом».

Следующая встреча — в пятницу в 19:00 МСК.

👉 [ссылка на трансляцию]`,
      editedContent: '',
    },
    {
      id: 'c13', index: 13, part: 3, role: 'Последний шанс', dayDelay: 16,
      content:
`Напоминание — сегодня пятница.

В 19:00 МСК начинается разбор «Как говорить о конфликте, не разрушая близость».

Присоединяйтесь — бесплатно, 60 минут.

После эфира отвечаю на вопросы в чате.

👉 [ссылка]

Не сможете прийти — напишите «ЗАПИСЬ», пришлю ссылку после эфира.`,
      editedContent: '',
    },
  ];

  return {
    format: 'article',
    botName: '',
    meetingSchedule: 'каждую пятницу в 19:00 МСК',
    messages: msgs,
  };
}

// ─── Mock chain generator ─────────────────────────────────────────────────────

function buildChain(
  format: Format,
  botName: string,
  meetingSchedule: string,
  strat: StrategyData | null,
): ChainMessage[] {
  const formatLabel = format === 'article' ? 'статью' : 'видео-урок';
  const seg   = strat?.chosenSegment?.split('\n')[0]?.slice(0, 60) ?? 'клиент';
  const meet  = meetingSchedule.trim() || 'каждую пятницу в 19:00';
  const bot   = botName.trim();

  const texts: Record<number, string> = {
    1: `Привет!${bot ? ` Это бот «${bot}»` : ''} 👋\n\nЗдесь я буду делиться инструментами, которые реально помогают ${seg}.\n\nНачнём с главного — получите ${formatLabel} прямо сейчас.\n\n👇 Нажмите «Получить»`,
    2: `Вы замечали такое?\n\nЧувствуете, что что-то не так — но не можете точно назвать что. Пробовали разные подходы, но ситуация возвращается.\n\nЭто не ваша вина. Это паттерн.\n\nИменно о нём — ${formatLabel}. Прочитали/посмотрели?`,
    3: `Ключевой инсайт из ${format === 'article' ? 'статьи' : 'видео'}:\n\nВидимая проблема — почти никогда не настоящая проблема.\n\nЗа ней всегда стоит невысказанная потребность. Пока её не назовёшь прямо — ситуация будет повторяться.\n\nЭто меняет всё.`,
    4: `История из практики (с разрешения).\n\nКо мне обратился клиент с запросом — ситуация казалась безвыходной. Несколько сессий, одно упражнение — и паттерн начал разрушаться.\n\nКлиент сказал: «Я наконец чувствую себя собой».\n\nЭто работает.`,
    5: `Последнее сообщение о ${format === 'article' ? 'статье' : 'видео'}.\n\nЕсли вы с ним познакомились — у вас уже есть понимание. Но понимание и изменение — разные вещи.\n\nСледующий шаг — практика.\n\nРасскажу о ней завтра.`,
    6: `Как и обещала — рассказываю.\n\nЯ провожу интенсив — 3 часа живой работы. Не лекция, а практика: разбираем вашу ситуацию, отрабатываем конкретные инструменты.\n\nДля кого: те, кто понимает что происходит — но не может изменить.\n\nЗавтра расскажу подробнее.`,
    7: `Вот почему одного понимания недостаточно.\n\nПаттерны живут в теле, в рефлексах. Их нельзя изменить через чтение — только через практику.\n\nИменно поэтому интенсив — это практика в безопасном пространстве.\n\n3 часа = годы сэкономленного времени.`,
    8: `Интенсив «Первый шаг» — что внутри:\n\n✦ Разбор вашей ситуации\n✦ Ключевые инструменты изменения\n✦ Практика в группе\n✦ Материалы для продолжения\n\nФормат: онлайн, 3 часа.\nСтоимость: [цена]\nДата: [дата]\n\nВопросы — пишите сюда.`,
    9: `Если у вас мысль «это не для меня» — давайте разберём.\n\n«Слишком дорого» — сколько стоит год одинаковых конфликтов?\n«Нет времени» — 3 часа один раз или бесконечный круг?\n«Не поможет» — понимаю. Первая сессия бесплатная.\n\nКаков ваш главный вопрос?`,
    10: `Регистрация открыта.\n\nМест немного — работаю в небольших группах.\n\nЕсли чувствуете что пора — это сигнал.\n\n👉 [ссылка на запись]\n\nЕсть вопросы — напишите. Отвечу лично.`,
    11: `Хочу пригласить вас на кое-что.\n\nКаждую неделю (${meet}) я провожу живой разбор.\n\nЭто не вебинар. Живой разговор, реальные ситуации, реальные ответы.\n\nБесплатно.\n\nВ эту встречу — тема из вашей области.\n\nХотите прийти?`,
    12: `Зачем приходить, если можно просто читать?\n\nЧитая — вы получаете информацию. На разборе — видите как это применяется к живым ситуациям.\n\nПлюс: можно задать вопрос анонимно.\n\nСледующая встреча — ${meet}.\n\n👉 [ссылка]`,
    13: `Напоминание — сегодня встреча.\n\n${meet} начинается разбор.\n\nБесплатно. Присоединяйтесь.\n\n👉 [ссылка]\n\nНе сможете — напишите «ЗАПИСЬ», пришлю ссылку после.`,
  };

  return MSG_DEFS.map(def => ({
    id:            `gen-${def.index}`,
    index:         def.index,
    part:          def.part,
    role:          def.role,
    dayDelay:      def.dayDelay,
    content:       texts[def.index] ?? '',
    editedContent: '',
  }));
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function chainKey(projectId: string) { return `chatbot_chain_${projectId}`; }

function loadChain(projectId: string): StoredChain | null {
  return readLegacyObjectWithProjectFallback<StoredChain>(chainKey(projectId), projectId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lineCount(text: string): number {
  return text.trim() === '' ? 0 : text.split('\n').length;
}

function formatDayDelay(d: number): string {
  if (d === 0) return 'Отправить сразу при подписке';
  return `Отправить через ${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}`;
}

function buildFullText(messages: ChainMessage[]): string {
  const parts = [1, 2, 3] as const;
  return parts.map(part => {
    const label = PART_LABELS[part];
    const partMsgs = messages.filter(m => m.part === part);
    const body = partMsgs.map(m => {
      const text = m.editedContent || m.content;
      return `Сообщение ${m.index} — ${m.role} | День ${m.dayDelay}\n\n${text}`;
    }).join('\n\n---\n\n');
    return `=== ${label} ===\n\n${body}`;
  }).join('\n\n\n');
}

function isChainMessageArray(value: unknown): value is ChainMessage[] {
  return Array.isArray(value) && value.every((item) =>
    typeof item === 'object' &&
    item !== null &&
    typeof (item as ChainMessage).id === 'string' &&
    typeof (item as ChainMessage).content === 'string',
  );
}

function parseMessagesFromText(content: string): ChainMessage[] {
  const chunks = content.split(/\n\n---\n\n/g).map((part) => part.trim()).filter(Boolean);
  return MSG_DEFS.map((def, index) => ({
    id: `db-msg-${def.index}`,
    index: def.index,
    part: def.part,
    role: def.role,
    dayDelay: def.dayDelay,
    content: chunks[index]?.replace(/^Сообщение\s+\d+\s*/i, '').trim() ?? '',
    editedContent: '',
  }));
}

function chainFromDb(item: ContentItem): StoredChain {
  const rawMessages = item.metadata?.messages;
  const messages = isChainMessageArray(rawMessages) ? rawMessages : parseMessagesFromText(item.content);
  return {
    dbId: item.id,
    format: metadataString(item, 'format', 'article') as Format,
    botName: metadataString(item, 'botName', ''),
    meetingSchedule: metadataString(item, 'meetingSchedule', ''),
    messages,
  };
}

function chainMetadata(chain: StoredChain): Record<string, unknown> {
  return {
    format: chain.format,
    botName: chain.botName,
    meetingSchedule: chain.meetingSchedule,
    messages: chain.messages,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatbotChains() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const { openAddModal } = useContentPlanStore();
  const { dbItems, loaded: dbLoaded, saveItem: saveToApi, updateItem: updateInApi } = useContentApi({ projectId: activeProjectId, type: 'CHATBOT_CHAIN' });

  const getSettings = useModelStore((s) => s.getSettings);
  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'chatbot-chains')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Phase
  const [phase, setPhase] = useState<Phase>('step1');

  // Step 1 state
  const [format,          setFormat]          = useState<Format>('article');
  const [botName,         setBotName]         = useState('');
  const [meetingSchedule, setMeetingSchedule] = useState('');

  // Step 2 state
  const [chain,      setChain]      = useState<StoredChain>(makeSeedChain());
  const [activeId,   setActiveId]   = useState<string>('c1');

  // Unsaved edits per message
  const [editMap, setEditMap] = useState<Record<string, string>>({});

  // ── Persist ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeProjectId || !dbLoaded) return;

    const dbChain = dbItems[0] ? chainFromDb(dbItems[0]) : null;
    if (dbChain) {
      setChain(dbChain);
      setActiveId(dbChain.messages[0]?.id ?? '');
      setPhase('step2');
      return;
    }

    const legacy = loadChain(activeProjectId);
    if (legacy && !isMigrated(activeProjectId, 'chatbot-chain')) {
      setChain(legacy);
      setActiveId(legacy.messages[0]?.id ?? '');
      setPhase('step2');
      void saveToApi({
        title: `Цепочка бота: ${legacy.botName || 'Telegram'}`,
        content: buildFullText(legacy.messages),
        platform: 'Telegram',
        metadata: chainMetadata(legacy),
      }).then((item) => {
        if (item) setChain((current) => ({ ...current, dbId: item.id }));
      });
      markMigrated(activeProjectId, 'chatbot-chain');
      return;
    }

    const seed = makeSeedChain();
    setChain(seed);
    setActiveId(seed.messages[0]?.id ?? 'c1');
    setPhase('step1');
  }, [activeProjectId, dbItems, dbLoaded, saveToApi]);

  const updateChain = useCallback((next: StoredChain) => {
    setChain(next);
  }, []);

  useEffect(() => {
    const entries = Object.entries(editMap);
    if (entries.length === 0 || !chain.dbId) return;
    const timer = window.setTimeout(() => {
      const next: StoredChain = {
        ...chain,
        messages: chain.messages.map((message) => (
          editMap[message.id] !== undefined
            ? { ...message, editedContent: editMap[message.id] }
            : message
        )),
      };
      void updateInApi(chain.dbId!, {
        content: buildFullText(next.messages),
        metadata: chainMetadata(next),
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [chain, editMap, updateInApi]);

  // ── Generate ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!activeProjectId) {
      return;
    }
    startGenerationTask(activeProjectId, 'chatbot-chains', 'Пишу цепочку сообщений', 'Собираю структуру Telegram-воронки');
    setPhase('generating');
    try {
      const settings    = getSettings('chatbot-chains');
      const seg         = strat.chosenSegment ?? strat.chosenSubsegment ?? 'аудитория психолога';
      const formatLabel = format === 'article' ? 'статью' : 'видео-урок';
      const meet        = meetingSchedule.trim() || 'каждую пятницу в 19:00';
      const bot         = botName.trim() || 'Telegram-бот';

      const prompt = `Сгенерируй 13 Telegram-постов для раздела “Цепочка сообщений” в Luma IQ.

Бот: ${bot}
Целевой сегмент: ${seg}
Формат лид-магнита: ${formatLabel}
Расписание еженедельных встреч: ${meet}

Логика цепочки:
1–5 — продать изучение лидмагнита: приветствие, боль, инсайт, история/пример, дожим к изучению материала.
6–10 — продать следующее действие: мини-продукт, заявку, консультацию или переход по ссылке.
11–13 — вернуть аудиторию и усилить действие: приглашение, ценность, напоминание/последний шанс.

Требования:
- Каждое сообщение должно быть полноценным Telegram-постом.
- Средняя длина одного поста: 250–450 слов.
- Первые 2 строки должны цеплять внимание.
- Каждый пост должен вести к следующему действию.
- Используй живой Telegram-native стиль, короткие абзацы, жирные акценты.
- В плейсхолдерах для цены/даты оставь [цена], [дата], [ссылка]

Формат ответа строго:
1. [Заголовок поста]
[готовый текст поста]

2. [Заголовок поста]
[готовый текст поста]

И так до 13.

Не объясняй логику. Не добавляй комментарии. Сразу выдавай готовые посты.`;

      const resp = await aiApi.startWorkflow('chatbot.chain.generate', {
        projectId: activeProjectId,
        provider: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        inputs: {
          botName: bot,
          segment: seg,
          leadMagnetFormat: formatLabel,
          meetingSchedule: meet,
          prompt,
        },
      });

      // Parse 13 messages from response
      const rawLines = resp.content.split(/\n+/);
      const msgTexts: string[] = [];
      let current = '';
      for (const line of rawLines) {
        const match = line.match(/^(\d+)[\.\)]\s*(.*)/);
        if (match) {
          if (current.trim()) msgTexts.push(current.trim());
          current = match[2] ?? '';
        } else {
          current += (current ? '\n' : '') + line;
        }
      }
      if (current.trim()) msgTexts.push(current.trim());

      const messages: ChainMessage[] = MSG_DEFS.map((def, i) => ({
        id:            `gen-${def.index}`,
        index:         def.index,
        part:          def.part,
        role:          def.role,
        dayDelay:      def.dayDelay,
        content:       msgTexts[i] ?? buildChain(format, botName, meetingSchedule, hasStrategy ? strat : null)[i]?.content ?? '',
        editedContent: '',
      }));

      const newChain: StoredChain = { format, botName, meetingSchedule, messages };
      updateChain(newChain);
      setActiveId(messages[0]?.id ?? '');
      setEditMap({});
      setPhase('step2');
      const fullText = messages.map((m, i) => `Сообщение ${i + 1}\n${m.content}`).join('\n\n---\n\n');
      void saveToApi({
        title: `Цепочка бота: ${bot}`,
        content: fullText,
        platform: 'Telegram',
        metadata: {
          ...chainMetadata(newChain),
          workflowRunId: resp.workflowRunId,
          workflowStepId: resp.workflowStepId,
          artifactId: resp.artifactId,
          generationId: resp.generationId,
        },
      }).then((item) => {
        if (item) setChain((current) => ({ ...current, dbId: item.id }));
      });
    } catch (err) {
      console.warn('[ChatbotChains] AI error, using fallback:', err);
      const messages = buildChain(format, botName, meetingSchedule, hasStrategy ? strat : null);
      const newChain: StoredChain = { format, botName, meetingSchedule, messages };
      updateChain(newChain);
      setActiveId(messages[0]?.id ?? '');
      setEditMap({});
      setPhase('step2');
      const fullText = messages.map((m, i) => `Сообщение ${i + 1}\n${m.content}`).join('\n\n---\n\n');
      void saveToApi({
        title: `Цепочка бота: ${botName || 'Telegram'}`,
        content: fullText,
        platform: 'Telegram',
        metadata: chainMetadata(newChain),
      }).then((item) => {
        if (item) setChain((current) => ({ ...current, dbId: item.id }));
      });
    } finally {
      finishGenerationTask(activeProjectId, 'chatbot-chains');
    }
  }

  function handleNewChain() {
    setFormat('article');
    setBotName('');
    setMeetingSchedule('');
    setPhase('step1');
  }

  // ── Editor helpers ────────────────────────────────────────────────────────

  function getContent(msg: ChainMessage): string {
    return editMap[msg.id] ?? (msg.editedContent || msg.content);
  }

  function setContent(id: string, value: string) {
    setEditMap(prev => ({ ...prev, [id]: value }));
  }

  function handleSave(msg: ChainMessage) {
    const text = editMap[msg.id];
    if (text === undefined) return;
    const next: StoredChain = {
      ...chain,
      messages: chain.messages.map(m =>
        m.id === msg.id ? { ...m, editedContent: text } : m,
      ),
    };
    updateChain(next);
    if (next.dbId) {
      void updateInApi(next.dbId, {
        content: buildFullText(next.messages),
        metadata: chainMetadata(next),
      });
    }
    setEditMap(prev => { const n = { ...prev }; delete n[msg.id]; return n; });
  }

  function handleCopyOne(msg: ChainMessage) {
    navigator.clipboard.writeText(getContent(msg)).catch(() => undefined);
  }

  function handleCopyAll() {
    navigator.clipboard.writeText(buildFullText(chain.messages)).catch(() => undefined);
  }

  function handleDownload() {
    const text = buildFullText(chain.messages);
    void exportToDocx('Цепочка Telegram-бота', text, 'telegram-chain');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── Loading ───────────────────────────────────────────────────────────────

  if (phase === 'generating' || generationTask) {
    return (
      <div className={s.root}>
        <div className={s.loadingScreen}>
          <div className={s.loadingSpinner} />
          <p className={s.loadingText}>✉️ {generationTask?.title ?? 'Пишу цепочку сообщений...'}</p>
        </div>
      </div>
    );
  }

  // ── Step 2: chain editor ──────────────────────────────────────────────────

  if (phase === 'step2') {
    const activeMsg = chain.messages.find(m => m.id === activeId) ?? chain.messages[0] ?? null;
    const parts = ([1, 2, 3] as const);

    return (
      <div className={s.root}>
        <div className={s.editorRoot}>

          {/* Left panel */}
          <div className={s.leftPanel}>
            <div className={s.leftTop}>
              <div className={s.leftTopTitle}>13 сообщений</div>
              <div className={s.leftTopActions}>
                <button className={s.topActionBtn} onClick={handleCopyAll}>
                  📋 Копировать
                </button>
                <button className={s.topActionBtn} onClick={() => openAddModal({ type: 'chatbot', title: chain.format === 'article' ? 'Цепочка бота (статья)' : 'Цепочка бота (видео)', platform: 'Telegram', projectId: activeProjectId ?? undefined, content: buildFullText(chain.messages) })}>
                  📅 В план
                </button>
                <button className={s.topActionBtn} onClick={handleDownload}>
                  💾 .docx
                </button>
                <button className={s.newChainBtn} onClick={handleNewChain}>
                  + Новая
                </button>
              </div>
            </div>

            <div className={s.leftScroll}>
              {parts.map(part => (
                <div key={part}>
                  <div className={s.groupHeader}>{PART_LABELS[part]}</div>
                  {chain.messages
                    .filter(m => m.part === part)
                    .map(msg => (
                      <button
                        key={msg.id}
                        className={`${s.msgItem}${msg.id === activeId ? ' ' + s.msgItemActive : ''}`}
                        onClick={() => setActiveId(msg.id)}
                      >
                        <span className={s.msgNum}>{msg.index}</span>
                        <span className={s.msgRole}>{msg.role}</span>
                      </button>
                    ))
                  }
                </div>
              ))}
            </div>
          </div>

          {/* Right panel */}
          <div className={s.rightPanel}>
            {!activeMsg ? (
              <div className={s.emptyRight}>
                <span className={s.emptyIcon}>✉️</span>
                <span>Выберите сообщение слева</span>
              </div>
            ) : (
              <MessageEditor
                key={activeMsg.id}
                msg={activeMsg}
                content={getContent(activeMsg)}
                hasUnsaved={editMap[activeMsg.id] !== undefined}
                onChange={v => setContent(activeMsg.id, v)}
                onSave={() => handleSave(activeMsg)}
                onCopy={() => handleCopyOne(activeMsg)}
              />
            )}
          </div>

        </div>
      </div>
    );
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────

  return (
    <div className={s.root}>
      <div className={s.page}>

        <div className={s.stepper}>
          <div className={s.stepItem}>
            <div className={`${s.stepDot} ${s.stepDotActive}`}>1</div>
            <span className={`${s.stepLabel} ${s.stepLabelActive}`}>Настройка</span>
          </div>
          <div className={s.stepLine} />
          <div className={s.stepItem}>
            <div className={s.stepDot}>2</div>
            <span className={s.stepLabel}>Готовая цепочка</span>
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24 }}>
          Настройка цепочки сообщений
        </h2>

        {/* Strategy badges */}
        {hasStrategy ? (
          <div className={s.strategyBanner}>
            <span className={s.strategyLabel}>Из стратегии:</span>
            {strat.chosenSegment    && <span className={s.badge}>{strat.chosenSegment.split('\n')[0]?.slice(0, 60)}</span>}
            {strat.chosenSubsegment && <span className={s.badge}>{strat.chosenSubsegment.split('\n')[0]?.slice(0, 60)}</span>}
          </div>
        ) : (
          <div className={s.warnBanner}>
            <span>⚠️</span>
            <span>
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит тексты сообщений
            </span>
          </div>
        )}

        {/* Format */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Формат лид-магнита</div>
          <div className={s.chipGroup}>
            <button
              className={`${s.chip}${format === 'article' ? ' ' + s.chipActive : ''}`}
              onClick={() => setFormat('article')}
            >
              📄 Текстовая статья
            </button>
            <button
              className={`${s.chip}${format === 'video' ? ' ' + s.chipActive : ''}`}
              onClick={() => setFormat('video')}
            >
              🎬 Видео-урок
            </button>
          </div>
        </div>

        {/* Funnel structure */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Структура воронки</div>
          <div className={s.sectionSub}>13 сообщений, разбитых на три смысловых блока</div>
          <div className={s.funnelBlocks}>
            <div className={s.funnelBlock}>
              <span className={s.funnelIcon}>📨</span>
              <div className={s.funnelBody}>
                <div className={s.funnelBlockTitle}>Сообщения 1–5 — Лид-магнит</div>
                <div className={s.funnelBlockDesc}>
                  Продают прочитать {format === 'article' ? 'статью' : 'видео-урок'}: приветствие, боль, инсайт, история клиента, дожим
                </div>
              </div>
            </div>
            <div className={s.funnelBlock}>
              <span className={s.funnelIcon}>📨</span>
              <div className={s.funnelBody}>
                <div className={s.funnelBlockTitle}>Сообщения 6–10 — Мини-продукт</div>
                <div className={s.funnelBlockDesc}>
                  Продают интенсив или диагностику: переход, проблема глубже, продукт, возражение, призыв
                </div>
              </div>
            </div>
            <div className={s.funnelBlock}>
              <span className={s.funnelIcon}>📨</span>
              <div className={s.funnelBody}>
                <div className={s.funnelBlockTitle}>Сообщения 11–13 — Еженедельная встреча</div>
                <div className={s.funnelBlockDesc}>
                  Продают участие в живых разборах: анонс, ценность, последний шанс
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Optional fields */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Детали (опционально)</div>
          <div className={s.inputGroup}>
            <div>
              <div className={s.inputLabel}>Название вашего бота или канала</div>
              <input
                className={s.textInput}
                placeholder="Например: @psyholog_bot или Психолог Анна"
                value={botName}
                onChange={e => setBotName(e.target.value)}
              />
            </div>
            <div>
              <div className={s.inputLabel}>Дата еженедельной встречи</div>
              <input
                className={s.textInput}
                placeholder="Например: каждую пятницу в 19:00 МСК"
                value={meetingSchedule}
                onChange={e => setMeetingSchedule(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className={s.btnRow}>
          {chain.dbId && (
            <button
              className={s.primaryBtn}
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1.5px solid var(--border)' }}
              onClick={() => setPhase('step2')}
            >
              ← К текущей цепочке
            </button>
          )}
          <button className={s.primaryBtn} onClick={() => void handleGenerate()}>
            Сгенерировать все 13 сообщений →
          </button>
        </div>
        <ModelBar section="chatbot-chains" />

      </div>
    </div>
  );
}

// ─── MessageEditor ────────────────────────────────────────────────────────────

interface MessageEditorProps {
  msg:         ChainMessage;
  content:     string;
  hasUnsaved:  boolean;
  onChange:    (v: string) => void;
  onSave:      () => void;
  onCopy:      () => void;
}

function MessageEditor({ msg, content, hasUnsaved, onChange, onSave, onCopy }: MessageEditorProps) {
  const lines = lineCount(content);
  const inTarget = lines >= 3 && lines <= 7;
  const overLimit = lines > 7;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className={s.editorHeader}>
        <div className={s.editorTitle}>
          Сообщение {msg.index} — {msg.role}
        </div>
        <div className={s.editorDelay}>{formatDayDelay(msg.dayDelay)}</div>
      </div>

      <div className={s.editorBody}>
        <textarea
          className={s.editorTextarea}
          value={content}
          onChange={e => onChange(e.target.value)}
          placeholder="Текст сообщения..."
        />
        <div className={s.lineCounter}>
          <span
            className={
              lines === 0 ? '' :
              inTarget    ? s.lineCountGood :
              overLimit   ? s.lineCountWarn : ''
            }
          >
            {lines} строк
          </span>
          <span>· цель: 3–7 строк</span>
        </div>
      </div>

      <div className={s.editorFooter}>
        <button className={s.actionBtn} onClick={onCopy}>
          📋 Копировать
        </button>
        <button
          className={`${s.actionBtn}${hasUnsaved ? ' ' + s.actionBtnPrimary : ''}`}
          onClick={onSave}
          disabled={!hasUnsaved}
        >
          💾 Сохранить
        </button>
      </div>
    </div>
  );
}
