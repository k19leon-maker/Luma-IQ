import { useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import s from './VideoScripts.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Duration = '8' | '10' | '12';
type CtaType  = 'telegram' | 'leadmagnet';
type Phase    = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface SavedScript {
  id:            string;
  duration:      Duration;
  ctaType:       CtaType;
  botKeyword:    string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
}

interface ScriptItem extends SplitItem {
  duration: Duration;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_STRATEGY = 'strategy_answers';

const DURATION_OPTIONS: { key: Duration; label: string; desc: string }[] = [
  { key: '8',  label: '8 мин',  desc: 'Компактный формат: крючок → проблема → кейс → решение → призыв' },
  { key: '10', label: '10 мин', desc: 'Стандартный формат с углублённой практикой'                      },
  { key: '12', label: '12 мин', desc: 'Расширенный формат с работой с возражениями'                     },
];

const DURATION_LABELS: Record<Duration, string> = {
  '8': '8 мин', '10': '10 мин', '12': '12 мин',
};

const FACTURE_HINTS = [
  '1. Есть ли реальный кейс из практики по этой теме?',
  '2. С каким запросом приходит клиент — как он формулирует проблему?',
  '3. Какой инсайт или разворот чаще всего меняет ситуацию?',
  '4. Какой инструмент или технику вы используете?',
  '5. Какой результат получают клиенты после работы с вами?',
];

// ─── Seed scripts ─────────────────────────────────────────────────────────────

function makeSeedScripts(): SavedScript[] {
  return [
    {
      id:           'vs-1',
      duration:     '8',
      ctaType:      'telegram',
      botKeyword:   '',
      editedTitle:  'Почему пары ссорятся об одном и том же · 8 мин',
      editedContent: '',
      createdAt:    '14 апр 2026',
      content:
`СЦЕНАРИЙ YOUTUBE-ВИДЕО: «Почему пары ссорятся об одном и том же»
Хронометраж: ~8 минут

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [0:00–0:40] — КРЮЧОК (40 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Вы ссоритесь. Потом миритесь. Потом снова ссоритесь — об одном и том же. Звучит знакомо? Если это про вас — оставайтесь. Потому что сегодня я объясню, почему это происходит. И нет, дело не в том, что вы несовместимы.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [0:40–2:20] — ПРОБЛЕМА (100 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Вот что происходит в большинстве пар. Есть видимая тема конфликта — посуда, деньги, время. И есть настоящая тема — то, что за ней стоит. И эти две темы почти никогда не совпадают.

Когда один партнёр злится из-за посуды, он на самом деле говорит: «Мне важно чувствовать, что меня видят». Когда другой уходит в молчание — он говорит: «Я не знаю, как быть услышанным, не разрушив всё».

Оба правы. Оба чувствуют себя невидимыми. И пока они спорят о посуде — настоящий разговор так и не происходит.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [2:20–4:30] — КЕЙС КЛИЕНТА (130 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 КЕЙС КЛИЕНТА:
Ко мне пришли Маша и Игорь. Вместе четыре года. Ссорятся по одному и тому же кругу — раз в три-четыре недели, почти всегда об одном. Поверхностно — об организации быта. Глубже — о том, кто кому чем обязан.

Когда я спросил Машу: «Чего ты на самом деле хочешь в этом разговоре?» — она замолчала. Потом сказала: «Хочу, чтобы он сам замечал, что нужна помощь. Без моих просьб».

Когда я спросил Игоря — он сказал: «Я хочу, чтобы мне доверяли, что я справлюсь по-своему».

Оба хотели признания. Но просили о нём через претензии. Поэтому партнёр слышал нападение — а не запрос.

📹 НА КАМЕРУ:
Это и есть суть повторяющихся конфликтов. Не противоречие между людьми. А противоречие между языком претензии и языком потребности.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [4:30–6:30] — РЕШЕНИЕ (120 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Три вещи, которые реально меняют динамику.

Первое — замедление. Большинство эскалаций происходят потому, что оба реагируют быстрее, чем думают. Одно конкретное правило: при первых признаках накала — скажите вслух: «Мне нужна секунда». Не уходите. Просто возьмите паузу.

Второе — переход от позиций к потребностям. «Ты никогда не слушаешь» — это позиция. «Мне важно чувствовать, что меня слышат» — это потребность. Когда вы говорите о потребностях — партнёру сложнее не услышать вас.

Третье — мягкое начало. Исследователь пар Джон Готтман показал: начало разговора предсказывает его исход с точностью 96%. Замените «ты никогда» на «когда происходит X, я чувствую Y». Это не просто смягчение тона — это принципиально другая структура.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [6:30–7:30] — ПРАКТИКА (60 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Упражнение на сегодня. Вспомните последнюю ссору. Ответьте на три вопроса:
— Что я чувствовал(а) на самом деле?
— Какая потребность за этим стояла?
— Как я мог(ла) назвать её прямо — без претензии?

Запишите. Буквально пять минут. Это первый шаг к разговору, который что-то изменит.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [7:30–8:00] — ПРИЗЫВ К ДЕЙСТВИЮ (30 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Если это видео было полезным — поставьте лайк. Каждый лайк помогает алгоритму показывать этот контент тем, кому он нужен. Подпишитесь на канал — я публикую практичные инструменты для отношений каждую неделю. Ссылка на мой Telegram в описании.`,
    },
    {
      id:           'vs-2',
      duration:     '12',
      ctaType:      'leadmagnet',
      botKeyword:   'БЛИЗОСТЬ',
      editedTitle:  'Невысказанные ожидания разрушают отношения · 12 мин',
      editedContent: '',
      createdAt:    '8 апр 2026',
      content:
`СЦЕНАРИЙ YOUTUBE-ВИДЕО: «Невысказанные ожидания разрушают отношения»
Хронометраж: ~12 минут

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [0:00–1:00] — КРЮЧОК (60 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Есть один тип конфликта, который разрушает отношения не шумом, а тишиной. Когда один партнёр ждёт — а другой не знает, что ждут. Когда есть чёткое представление о том, как должно быть — и никто об этом не сказал вслух.

Сегодня говорим о невысказанных ожиданиях. О том, почему они возникают, почему их так сложно назвать — и что с этим делать. Оставайтесь до конца — там будет конкретная практика.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [1:00–3:30] — ПРОБЛЕМА И КОНТЕКСТ (150 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Откуда берутся невысказанные ожидания? Из трёх источников.

Первый — детский опыт. В семье, где вы выросли, было принято определённое распределение ролей, определённый уровень внимания, определённый способ выражать заботу. Вы не выбирали эту модель — вы просто её усвоили. И несёте во взрослые отношения.

Второй — романтический нарратив. Культура рассказывает нам: если это «тот самый» человек — он поймёт без слов. Просить — значит, что-то не так. Настоящая любовь читает между строк. Это красиво в кино. В жизни это создаёт системную проблему: оба ждут, никто не говорит.

Третий — страх уязвимости. Назвать ожидание вслух — значит рискнуть. Рискнуть услышать «нет», или «мне это неважно», или просто не получить то, о чём попросил. Гораздо «безопаснее» не говорить — и злиться, что партнёр не догадался.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [3:30–6:00] — КЕЙС КЛИЕНТА (150 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 КЕЙС КЛИЕНТА:
Маша и Игорь — вместе четыре года. Умные, рефлексирующие люди. Ссорятся по одним и тем же сценариям с самого начала. Маша чувствует, что Игорь не вкладывается в отношения. Игорь чувствует, что каждый его поступок оценивается и оказывается недостаточным.

На одной из сессий я попросил каждого написать: «Что значит для меня быть в хороших отношениях?» Не как должен вести себя партнёр — а что лично для них означает «хорошие отношения».

Маша написала: «Вместе планировать будущее, инициировать совместный досуг, замечать мелочи». Игорь написал: «Доверие, отсутствие критики, свобода быть собой».

Они прочитали друг другу. Первый раз за четыре года. Оба молчали минуту. Потом Маша сказала: «Я не знала, что тебе важна свобода. Я думала, ты просто не хочешь». Игорь сказал: «Я не понимал, что ты ждёшь инициативы. Я думал, если тебе нужно — ты скажешь».

📹 НА КАМЕРУ:
Четыре года ссор. Один лист бумаги. Это не метафора — это буквально то, что произошло.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [6:00–8:30] — ИНСТРУМЕНТЫ (150 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Что конкретно помогает работать с невысказанными ожиданиями.

Инструмент первый — «Карта ожиданий». Каждый партнёр отдельно пишет: в каких ситуациях мне важна поддержка, как я предпочитаю, чтобы меня поддерживали, что для меня означает близость. Потом вы обмениваетесь и обсуждаете. Без оценок, без «ты должен был знать». Просто как информация.

Инструмент второй — «Запрос вместо претензии». Прежде чем сказать что-то, что начинается с «ты», задайте себе вопрос: «Чего я на самом деле хочу?» И скажите это напрямую. Не «ты никогда не звонишь» — а «мне важно, чтобы ты иногда писал первым в течение дня».

Инструмент третий — «Регулярный check-in». Раз в неделю, 15 минут, два вопроса: «Что было хорошо в эту неделю?» и «Что я хочу в следующую?» Это создаёт привычку называть ожидания до того, как они превращаются в претензии.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [8:30–10:30] — ПРАКТИКА (120 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Конкретное задание для вас.

Шаг первый: возьмите последний конфликт. Ответьте на вопрос: «Чего я ждал(а) от партнёра в этой ситуации?» Не что он сделал не так — а чего конкретно вы ожидали.

Шаг второй: спросите себя: «Я это называл(а) вслух?» Именно так — прямо и конкретно. Не намекал(а), не ожидал(а), что поймут — а называл(а) вслух.

Шаг третий: если нет — попробуйте сказать это сейчас. Не в формате претензии. В формате информации: «Мне важно вот это. Как тебе такой формат?»

Это непросто. Уязвимость — это навык, который нужно тренировать. Но это единственный способ выйти из круга невысказанных ожиданий.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [10:30–11:30] — РАБОТА С ВОЗРАЖЕНИЯМИ (60 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Знаю, что у части из вас сейчас есть мысль: «Но я же говорил(а). Он(а) всё равно не слышит».

Это отдельная тема — когда запрос есть, но его не слышат. Здесь важно различать: не слышат, потому что не хотят — или потому что не умеют? Часто оказывается второе. И тогда работа идёт уже не с желанием — а с навыком слышать.

Если это ваш случай — напишите в комментариях слово «СЛЫШАТЬ». Я сделаю отдельное видео про то, как говорить так, чтобы тебя услышали.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱ [11:30–12:00] — ПРИЗЫВ К ДЕЙСТВИЮ (30 сек)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📹 НА КАМЕРУ:
Если видео было полезным — поставьте лайк. Это помогает каналу расти.

И заберите бесплатный гайд «Карта ожиданий» — это шаблон для упражнения, о котором я рассказал. Напишите слово БЛИЗОСТЬ моему боту — ссылка в описании. Я пришлю гайд прямо в Telegram.`,
    },
  ];
}

// ─── Mock generators ──────────────────────────────────────────────────────────

const MOCK_THEMES: Record<Duration, string[]> = {
  '8': [
    'Почему пары ссорятся об одном и том же — объясняю механику за 8 минут',
    'Что стоит за молчанием партнёра: разбор для тех, кто устал угадывать',
    'Три фразы, которые превращают разговор в ссору — и чем их заменить',
    'Как остановить конфликт до эскалации: инструмент, который работает за 60 секунд',
    'Почему «прости» не помогает: о примирении без решения',
  ],
  '10': [
    'Невысказанные ожидания: откуда они берутся и как о них говорить',
    'Цикл конфликта в паре: как выйти из повторяющегося сценария ссор',
    'Что такое «мягкое начало» и почему это важнее аргументов в споре',
    'Потребности vs позиции: переход, который меняет динамику отношений',
    'Почему умные пары всё равно ссорятся: нейробиология конфликта',
  ],
  '12': [
    'Невысказанные ожидания разрушают отношения: разбор с кейсом',
    'Четыре всадника по Готтману: какие паттерны убивают отношения',
    'Как говорить о конфликте, не разрушая близость: полный разбор',
    'Привязанность и конфликт: почему те, кого мы любим, нас так задевают',
    'Когда терапия пары помогает — а когда нет: честный разговор',
  ],
};

function buildScript(
  duration: Duration,
  theme:    string,
  ctaType:  CtaType,
  botKeyword: string,
  facture:  string,
): string {
  const hasFacture = facture.trim().length > 0;
  const caseBlock  = hasFacture
    ? facture.trim()
    : 'Ко мне обратилась пара с запросом — повторяющиеся ссоры по одному кругу. В ходе работы выяснилось: оба говорили о разном, используя одни и те же слова. Когда каждый назвал свою потребность прямо — цикл начал разрушаться.';

  const ctaBlock = ctaType === 'telegram'
    ? 'Если видео было полезным — поставьте лайк и подпишитесь на канал. Ссылка на мой Telegram в описании — там я публикую практичные инструменты каждую неделю.'
    : `Заберите бесплатный материал — напишите слово ${botKeyword || 'СТАРТ'} моему боту. Ссылка в описании под видео.`;

  const timings8 = [
    ['0:00–0:40', 'КРЮЧОК (40 сек)'],
    ['0:40–2:20', 'ПРОБЛЕМА (100 сек)'],
    ['2:20–4:30', 'КЕЙС КЛИЕНТА (130 сек)'],
    ['4:30–6:30', 'РЕШЕНИЕ (120 сек)'],
    ['6:30–7:30', 'ПРАКТИКА (60 сек)'],
    ['7:30–8:00', 'ПРИЗЫВ К ДЕЙСТВИЮ (30 сек)'],
  ];
  const timings10 = [
    ['0:00–0:50', 'КРЮЧОК (50 сек)'],
    ['0:50–2:30', 'ПРОБЛЕМА (100 сек)'],
    ['2:30–5:00', 'КЕЙС КЛИЕНТА (150 сек)'],
    ['5:00–7:30', 'РЕШЕНИЕ (150 сек)'],
    ['7:30–9:30', 'ПРАКТИКА (120 сек)'],
    ['9:30–10:00', 'ПРИЗЫВ К ДЕЙСТВИЮ (30 сек)'],
  ];
  const timings12 = [
    ['0:00–1:00', 'КРЮЧОК (60 сек)'],
    ['1:00–3:30', 'ПРОБЛЕМА И КОНТЕКСТ (150 сек)'],
    ['3:30–6:00', 'КЕЙС КЛИЕНТА (150 сек)'],
    ['6:00–8:30', 'ИНСТРУМЕНТЫ (150 сек)'],
    ['8:30–10:30', 'ПРАКТИКА (120 сек)'],
    ['10:30–11:30', 'РАБОТА С ВОЗРАЖЕНИЯМИ (60 сек)'],
    ['11:30–12:00', 'ПРИЗЫВ К ДЕЙСТВИЮ (30 сек)'],
  ];
  const timings = duration === '8' ? timings8 : duration === '10' ? timings10 : timings12;

  const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  const blocks = timings.map(([time, title], i) => {
    let body = '';
    if (i === 0) {
      body = `📹 НА КАМЕРУ:\nСегодня поговорим на тему: «${theme}». Это важная тема — и я хочу разобрать её так, чтобы у вас остался конкретный инструмент. Оставайтесь до конца.`;
    } else if (title.startsWith('ПРОБЛЕМА')) {
      body = `📹 НА КАМЕРУ:\nВидимая причина конфликтов — почти никогда не настоящая. За ней стоит невысказанная потребность. Пока пара спорит о поверхностном — настоящий разговор так и не происходит.`;
    } else if (title.startsWith('КЕЙС')) {
      body = `👤 КЕЙС КЛИЕНТА:\n${caseBlock}\n\n📹 НА КАМЕРУ:\nЭто типичная динамика. Не конфликт между людьми — а конфликт между языком претензии и языком потребности.`;
    } else if (title.startsWith('РЕШЕНИЕ') || title.startsWith('ИНСТРУМЕНТЫ')) {
      body = `📹 НА КАМЕРУ:\nТри инструмента, которые реально работают:\n\n1. Замедление — взять паузу при первых признаках накала.\n2. Переход от позиций к потребностям — «ты никогда» → «мне важно».\n3. Мягкое начало — разговор, начавшийся с «я чувствую», заканчивается иначе.`;
    } else if (title.startsWith('ПРАКТИКА')) {
      body = `📹 НА КАМЕРУ:\nВспомните последнюю ссору. Три вопроса:\n— Что я чувствовал(а) на самом деле?\n— Какая потребность за этим стояла?\n— Как я мог(ла) назвать её прямо?\n\nЗапишите. Пять минут — и у вас будет материал для другого разговора.`;
    } else if (title.startsWith('РАБОТА С ВОЗРАЖЕНИЯМИ')) {
      body = `📹 НА КАМЕРУ:\nЕсли вы думаете «я говорил(а), но меня не слышат» — это отдельная тема. Часто оказывается: не слышат не потому что не хотят, а потому что не умеют. Напишите в комментариях — сделаю отдельное видео.`;
    } else {
      body = `📹 НА КАМЕРУ:\n${ctaBlock}`;
    }

    return `${divider}\n⏱ [${time}] — ${title}\n${divider}\n\n${body}`;
  });

  return `СЦЕНАРИЙ YOUTUBE-ВИДЕО: «${theme}»\nХронометраж: ~${duration} минут\n\n${blocks.join('\n\n')}`;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function scriptsKey(projectId: string) { return `video_scripts_${projectId}`; }

function loadScripts(projectId: string): SavedScript[] {
  try {
    const raw = localStorage.getItem(scriptsKey(projectId));
    if (raw) return JSON.parse(raw) as SavedScript[];
  } catch {}
  return makeSeedScripts();
}

function persistScripts(projectId: string, scripts: SavedScript[]) {
  localStorage.setItem(scriptsKey(projectId), JSON.stringify(scripts));
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ['Настройка', 'Тема и фактура', 'Готовый сценарий'];
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

export default function VideoScripts() {
  const { activeProjectId } = useProjectsStore();

  const [strat] = useState<StrategyData>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_STRATEGY) ?? '{}'); }
    catch { return {}; }
  });
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Scripts
  const [scripts,    setScripts]    = useState<SavedScript[]>(() => loadScripts(activeProjectId));
  const [selectedId, setSelectedId] = useState<string | null>(() => loadScripts(activeProjectId)[0]?.id ?? null);

  // Phase
  const [phase, setPhase] = useState<Phase>(() =>
    loadScripts(activeProjectId).length > 0 ? 'editor' : 'step1',
  );

  // Step 1
  const [duration,   setDuration]   = useState<Duration>('10');
  const [ctaType,    setCtaType]    = useState<CtaType>('telegram');
  const [botKeyword, setBotKeyword] = useState('');

  // Step 2
  const [themes,        setThemes]        = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState('');
  const [facture,       setFacture]       = useState('');
  const [inputMode,     setInputMode]     = useState<'text' | 'voice'>('text');
  const [isListening,   setIsListening]   = useState(false);
  const recognitionRef = useRef<any>(null);

  // Editor unsaved changes
  const [editMap, setEditMap] = useState<Record<string, { title: string; content: string }>>({});

  // ── Persist ───────────────────────────────────────────────────────────────────
  const updateScripts = useCallback((next: SavedScript[]) => {
    setScripts(next);
    persistScripts(activeProjectId, next);
  }, [activeProjectId]);

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  function handleGenerateThemes() {
    setPhase('step2-loading');
    setTimeout(() => {
      setThemes(MOCK_THEMES[duration]);
      setSelectedTheme(MOCK_THEMES[duration][0] ?? '');
      setFacture('');
      setPhase('step2');
    }, 1200);
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  function handleGenerateScript() {
    setPhase('generating');
    setTimeout(() => {
      const content = buildScript(duration, selectedTheme, ctaType, botKeyword, facture);
      const id      = `vs-${Date.now()}`;
      const title   = `${selectedTheme.slice(0, 50)}… · ${DURATION_LABELS[duration]}`;
      const now     = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const newScript: SavedScript = {
        id, duration, ctaType, botKeyword,
        content, editedContent: '', editedTitle: title, createdAt: now,
      };
      const next = [newScript, ...scripts];
      updateScripts(next);
      setSelectedId(id);
      setPhase('editor');
    }, 2000);
  }

  // ── Voice input ───────────────────────────────────────────────────────────────
  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(' ');
      setFacture(prev => prev ? `${prev} ${t}` : t);
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start(); setIsListening(true);
  }

  // ── Editor helpers ────────────────────────────────────────────────────────────
  function getEditorState(sc: SavedScript) {
    const ov = editMap[sc.id];
    return {
      title:   ov?.title   ?? sc.editedTitle,
      content: ov?.content ?? (sc.editedContent || sc.content),
    };
  }

  function setEditorField(scId: string, field: 'title' | 'content', value: string) {
    setEditMap(prev => {
      const sc  = scripts.find(s => s.id === scId)!;
      const cur = prev[scId] ?? { title: sc.editedTitle, content: sc.editedContent || sc.content };
      return { ...prev, [scId]: { ...cur, [field]: value } };
    });
  }

  function handleSave(scId: string) {
    const ov = editMap[scId];
    if (!ov) return;
    updateScripts(scripts.map(sc =>
      sc.id === scId ? { ...sc, editedTitle: ov.title, editedContent: ov.content } : sc,
    ));
    setEditMap(prev => { const n = { ...prev }; delete n[scId]; return n; });
  }

  function handleCopy(scId: string) {
    const sc = scripts.find(s => s.id === scId);
    if (sc) navigator.clipboard.writeText(getEditorState(sc).content);
  }

  function handleDownload(scId: string) {
    const sc = scripts.find(s => s.id === scId);
    if (!sc) return;
    const { title, content } = getEditorState(sc);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${title}.docx`; a.click();
    URL.revokeObjectURL(url);
  }

  function goToStep1() {
    setDuration('10'); setCtaType('telegram'); setBotKeyword('');
    setPhase('step1');
  }

  // ── SplitEditor items ─────────────────────────────────────────────────────────
  const splitItems: ScriptItem[] = scripts.map(sc => ({
    id:       sc.id,
    icon:     '🎬',
    title:    sc.editedTitle,
    meta:     `${DURATION_LABELS[sc.duration]} · ${sc.createdAt}`,
    preview:  (sc.editedContent || sc.content).slice(0, 120),
    duration: sc.duration,
  }));

  // ── Editor right panel ────────────────────────────────────────────────────────
  function renderEditor(item: ScriptItem | null) {
    if (!item) {
      return (
        <div className={s.emptyEditor}>
          <span className={s.emptyIcon}>🎬</span>
          <span className={s.emptyText}>Выберите сценарий слева</span>
        </div>
      );
    }
    const sc              = scripts.find(s => s.id === item.id)!;
    const { title, content } = getEditorState(sc);
    const hasChanges      = !!editMap[sc.id];

    return (
      <div className={s.editorPanel}>
        <div className={s.editorHeader}>
          <input
            className={s.editorTitleInput}
            value={title}
            onChange={e => setEditorField(sc.id, 'title', e.target.value)}
          />
          <div className={s.editorMeta}>
            <span className={s.badge}>🎬 {DURATION_LABELS[sc.duration]}</span>
          </div>
        </div>

        <textarea
          className={s.editorTextarea}
          value={content}
          onChange={e => setEditorField(sc.id, 'content', e.target.value)}
        />

        <div className={s.editorActions}>
          <button className={s.actionBtn} onClick={() => handleCopy(sc.id)}>Копировать</button>
          <button className={s.actionBtn} onClick={() => alert('Добавлено в контент-план (в разработке)')}>
            📅 Включить в контент-план
          </button>
          <button
            className={`${s.actionBtn} ${s.actionBtnPrimary}${!hasChanges ? ' ' + s.actionBtnDisabled : ''}`}
            onClick={() => handleSave(sc.id)}
            disabled={!hasChanges}
          >
            Сохранить
          </button>
          <button className={s.actionBtn} onClick={() => handleDownload(sc.id)}>Скачать .docx</button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === 'step2-loading') {
    return (
      <div className={s.loadingScreen}>
        <div className={s.loadingSpinner} />
        <p className={s.loadingText}>Генерирую темы для видео...</p>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div className={s.loadingScreen}>
        <span className={s.loadingSpinner} />
        <p className={s.loadingText}>Пишу сценарий... это займёт несколько секунд</p>
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
        listTitle="Сценарии"
        listHeaderAction={
          <button className={s.newArticleBtn} onClick={goToStep1}>+ Создать</button>
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
          </div>
        ) : (
          <div className={s.warnBanner}>
            <span>⚠️</span>
            <span>
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит темы видео
            </span>
          </div>
        )}

        {/* Duration */}
        <div className={s.section}>
          <div className={s.sectionTitle}>Хронометраж</div>
          <div className={s.chipGroup}>
            {DURATION_OPTIONS.map(d => (
              <button
                key={d.key}
                className={`${s.chip}${duration === d.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setDuration(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className={s.typeDesc}>
            {DURATION_OPTIONS.find(d => d.key === duration)?.desc}
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
          </div>
          {ctaType === 'leadmagnet' && (
            <div style={{ marginTop: 12 }}>
              <span className={s.sectionSub}>Кодовое слово для бота</span>
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
          {scripts.length > 0 && (
            <button className={s.secondaryBtn} onClick={() => setPhase('editor')}>
              ← Назад к сценариям
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
        <div className={s.sectionTitle}>Выберите тему видео</div>
        <div className={s.sectionSub}>
          ИИ предложил 5 тем для формата «{DURATION_LABELS[duration]}»
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

      {/* Facture */}
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
            placeholder="Расскажите о своём опыте, случае из практики, кейсе клиента..."
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
          {facture.trim().length < 50 && (
            <span className={s.factureCounterWarn}>(минимум 50)</span>
          )}
        </div>
      </div>

      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button
          className={s.primaryBtn}
          disabled={facture.trim().length < 50}
          onClick={handleGenerateScript}
        >
          Написать сценарий →
        </button>
      </div>
    </div>
  );
}
