import { useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import s from './Articles.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'dzen' | 'vc' | 'telegraf' | 'site';
type CtaType  = 'telegram' | 'leadmagnet';
type Phase    = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface SavedArticle {
  id:            string;
  platform:      Platform;
  ctaType:       CtaType;
  botKeyword:    string;
  content:       string;
  editedContent: string;
  editedTitle:   string;
  createdAt:     string;
}

interface ArticleItem extends SplitItem {
  platform: Platform;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_STRATEGY = 'strategy_answers';

const PLATFORM_OPTIONS: { key: Platform; emoji: string; label: string; desc: string }[] = [
  { key: 'dzen',     emoji: '📰', label: 'Яндекс Дзен', desc: 'Личные истории, эмоции, широкая аудитория'             },
  { key: 'vc',       emoji: '💼', label: 'VC.ru',        desc: 'Аналитика, кейсы, профессиональная аудитория'          },
  { key: 'telegraf', emoji: '📄', label: 'Телеграф',     desc: 'Нейтральный лонгрид, без регистрации'                  },
  { key: 'site',     emoji: '🌐', label: 'Свой сайт',    desc: 'SEO-оптимизированная статья для блога'                 },
];

const PLATFORM_ICONS: Record<Platform, string> = {
  dzen: '📰', vc: '💼', telegraf: '📄', site: '🌐',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  dzen: 'Яндекс Дзен', vc: 'VC.ru', telegraf: 'Телеграф', site: 'Свой сайт',
};

const FACTURE_HINTS = [
  '1. Есть ли реальный случай из практики по этой теме?',
  '2. В чём главная причина этой проблемы по вашему опыту?',
  '3. Какой метод или подход вы используете в работе?',
  '4. Какой результат получают клиенты?',
  '5. Что хотите чтобы читатель понял после прочтения?',
];

// ─── Seed articles ────────────────────────────────────────────────────────────

function makeSeedArticles(): SavedArticle[] {
  return [
    {
      id:           'art-1',
      platform:     'dzen',
      ctaType:      'telegram',
      botKeyword:   '',
      editedTitle:  'Почему пары ссорятся об одном и том же · Дзен',
      editedContent: '',
      createdAt:    '14 апр 2026',
      content:
`Вы помните свою последнюю ссору? Скорее всего, вы уже были в этом сценарии раньше. Та же тема, те же слова, то же чувство — «мы снова пришли к этому». Потом — молчание, примирение, и через две-три недели всё повторяется. Я работаю с парами уже несколько лет и могу сказать точно: повторяющиеся конфликты — это не признак того, что вы несовместимы. Это признак того, что под видимым конфликтом скрыто что-то другое, о чём вы ещё не научились говорить прямо. В этой статье я разберу механику таких ссор, объясню, почему примирение не решает проблему, и расскажу, что реально помогает.

## Почему конфликты в паре повторяются: суть проблемы

Большинство пар, которые ко мне приходят, описывают одну и ту же картину: мы ссоримся об одном и том же снова и снова. Темы разные — деньги, дети, распределение обязанностей, время — но ощущение одинаковое. Круговое. Безвыходное.

Первое, что важно понять: видимая тема конфликта почти никогда не является настоящей темой конфликта.

Когда Марина злится, что муж опять не помыл посуду — это не про посуду. За этим стоит: «Мне важно чувствовать, что мои усилия замечают». Когда Алексей уходит в молчание после того, как жена повышает голос — это не упрямство. Это: «Я не знаю, как быть услышанным, не разрушив всё окончательно».

Оба говорят о разном, используя одни и те же слова. Оба чувствуют себя правыми. Оба чувствуют себя невидимыми. И пока они не научатся говорить о том, что стоит за словами — ссора будет возвращаться.

Исследования психолога Джона Готтмана, который изучал тысячи пар на протяжении десятилетий, показывают: около 69% конфликтов в паре — это «бессмертные» проблемы. Они не решаются. Они управляются. Пары, которые научились с ними жить, не устраняют разногласия — они научились говорить о них иначе.

## Почему примирение не решает проблему

Вот что происходит в типичном цикле конфликта. Сначала — накопление напряжения. Маленькие раздражители, которые никто не называет вслух. Потом — взрыв. Ссора, которая может начаться из-за незначительной мелочи, но несёт в себе весь накопленный заряд. Потом — примирение. Объятия, «прости», «я тебя люблю». И потом — медовый месяц, когда всё снова хорошо.

Проблема в том, что примирение возвращает пару к исходной точке — но не к точке до напряжения. К точке, где напряжение снова начнёт накапливаться. Потому что то, что его создаёт — так и не было названо.

Один из признаков этого цикла — вы миритесь, но испытываете облегчение, а не решённость. Внутри что-то остаётся незакрытым. Вы просто оба устали от конфликта и рады передышке.

Я вижу это снова и снова: пары умеют мириться, но не умеют разговаривать. Примирение — это не разговор. Это пауза.

## Как остановить повторяющиеся конфликты в паре

Хорошая новость: механика конфликта работает в обе стороны. Её можно не только понять — её можно изменить.

Первый шаг — замедление. Большинство эскалаций происходят потому, что оба партнёра реагируют быстрее, чем думают. Мозг воспринимает критику как угрозу и запускает режим защиты. Вы ещё не успели договорить, а партнёр уже выстраивает контраргументы. Один конкретный инструмент: если вы чувствуете, что разговор начинает накаляться — скажите вслух: «Мне нужно секунду». Не уходите. Просто возьмите паузу и спросите себя: «Чего я сейчас на самом деле хочу?»

Второй шаг — переход от позиций к потребностям. Позиция — это то, чего вы хотите. Потребность — это почему вы этого хотите. «Ты никогда не звонишь» — позиция. «Мне важно чувствовать, что ты думаешь обо мне, когда нас нет рядом» — потребность. Когда вы говорите о потребностях, партнёру гораздо сложнее не услышать вас. Потому что потребности — это не нападение.

Третий шаг — «мягкое начало». Готтман называет это одним из главных предикторов успеха в паре. Если разговор начинается с обвинения — он почти гарантированно закончится защитой. Если он начинается с «я» (я чувствую, мне важно, мне нужно) — у него есть шанс стать диалогом.

Я видел пары, которые разворачивали многолетние паттерны за несколько месяцев. Не потому что стали другими людьми. А потому что начали говорить иначе.

## Три мифа о конфликтах, которые мешают что-то изменить

Миф первый: «Мы просто несовместимы». Несовместимость — это когда двум людям вместе некомфортно в принципе. Повторяющиеся конфликты — это про паттерн, а не про природу. Паттерн можно изменить.

Миф второй: «Если бы он(а) изменился(ась), всё было бы хорошо». Ожидание, что партнёр изменится первым — это ловушка. Отношения — это система. Когда один элемент меняется, система меняется тоже. Начать с себя — не значит взять на себя всю вину. Это значит сделать первый шаг.

Миф третий: «Хорошие отношения — это без ссор». Пары без конфликтов существуют. Это не счастливые пары. Это пары, где одна или обе стороны перестали говорить о том, что важно. Конфликт — это сигнал. Вопрос в том, умеете ли вы его читать.

## Вывод

Повторяющиеся ссоры — это не приговор и не доказательство того, что отношения сломаны. Это сигнал, что что-то важное остаётся невысказанным. Механика конфликта устроена так, что он будет возвращаться до тех пор, пока его настоящая тема не будет названа. Начните с одного вопроса после следующей ссоры: «Что я на самом деле чувствовал(а)?» Не то, о чём мы ссорились. А то, что было под этим. Это первый шаг к разговору, который что-то изменит.

---

Если эта статья была полезной — подпишитесь на мой Telegram канал. Там я разбираю похожие ситуации каждую неделю.`,
    },
    {
      id:           'art-2',
      platform:     'vc',
      ctaType:      'leadmagnet',
      botKeyword:   'СТАРТ',
      editedTitle:  'Интеллект не помогает договориться · VC.ru',
      editedContent: '',
      createdAt:    '9 апр 2026',
      content:
`Один из самых частых запросов, с которым приходят на консультацию: «Мы оба всё понимаем, оба хотим решить — но почему-то снова ссоримся об одном и том же». Парадокс в том, что высокий уровень рефлексии и интеллекта не коррелирует с качеством коммуникации в паре. Более того — иногда мешает. В этом материале я разберу, почему так происходит, на что указывают данные исследований и какие практические инструменты реально работают.

## Почему рациональность не помогает в конфликте

Исследования психолога Джонатана Хайдта убедительно показывают: рациональное мышление у большинства людей работает не для поиска истины, а для обоснования уже принятого решения. Мы не думаем — мы защищаем позицию, которую заняли ещё до начала разговора.

В паре это работает особенно разрушительно. Оба партнёра выстраивают безупречную логическую цепочку, доказывающую, что виноват другой. Оба «правы». Оба в тупике. Чем умнее человек, тем более изощрённые аргументы он находит — и тем глубже тупик.

Нейробиология добавляет к этому ещё один уровень. Когда мозг воспринимает критику, активируется миндалина — та же структура, что отвечает за реакцию «бей или беги». С эволюционной точки зрения угроза со стороны близкого человека — один из самых дезориентирующих сигналов. Префронтальная кора (зона рационального мышления) буквально отключается. Человек физически не способен думать ясно в состоянии высокого эмоционального возбуждения.

Это объясняет феномен, который часто описывают клиенты: «Я знал(а), что делаю что-то неправильно, но не мог(ла) остановиться». Знание и поведение в состоянии активации — это разные уровни нервной системы.

## Структура повторяющегося конфликта

Джон Готтман, один из наиболее цитируемых исследователей в области психологии отношений, выделил четыре паттерна коммуникации, которые он назвал «Четырьмя всадниками» — предикторами распада отношений. Это критика (атака личности, а не поведения), презрение, защита и блокировка (каменная стена).

Его данные, основанные на наблюдении тысяч пар, показывают: наличие этих паттернов предсказывает развод с точностью около 90%. При этом критика и презрение — наиболее токсичные из четырёх.

Важно: Готтман обнаружил, что 69% конфликтов в паре — хронические. Они не решаются. Это разногласия, уходящие корнями в различия в личности, ценностях или потребностях. Счастливые пары отличаются не тем, что решают эти конфликты, а тем, что умеют управлять ими — говорить о них без эскалации.

Практический вывод: если вы ссоритесь об одном и том же годами — не пытайтесь решить саму тему. Работайте над тем, как вы о ней говорите.

## Инструменты деэскалации: что реально работает

Первый инструмент — физиологическое успокоение. Готтман называет его «тайм-аутом». Суть: при первых признаках высокого эмоционального возбуждения (частое сердцебиение, напряжение в теле, желание перебить) — остановить разговор. Не уходить, не замолкать в обиде — буквально договориться: «Мне нужно 20 минут». И использовать это время для успокоения, а не для прокручивания аргументов в голове.

В рамках работы с несколькими парами мы вводили простое правило: любой может остановить разговор, сказав кодовое слово. Возобновить — только когда оба готовы. Большинство сообщали о значимом снижении частоты и интенсивности конфликтов уже через две-три недели.

Второй инструмент — переход от позиций к интересам. Это базовый принцип переговоров (Гарвардская школа), но в паре он работает ещё более прямолинейно. Позиция: «Ты должен больше помогать с детьми». Интерес: «Мне важно чувствовать, что мы в этом вместе, а не что я одна тяну всё». Когда вы говорите об интересе — вы открываете возможность для поиска решения. Когда о позиции — вы требуете конкретного поведения, которое партнёр может воспринять как атаку.

Третий инструмент — мягкое начало разговора. По данным Готтмана, то, как начинается разговор о проблеме, предсказывает его исход с точностью 96%. Разговор, начавшийся жёстко, почти всегда заканчивается жёстко. Простой тест: замените «Ты никогда не...» на «Когда происходит X, я чувствую Y». Это не просто смягчение тона — это принципиально другая структура сообщения, которая не активирует защитную реакцию.

## Типичные ошибки и как их избежать

Ошибка первая — попытка вести сложный разговор в состоянии усталости или голода. Это звучит тривиально, но данные подтверждают: уровень глюкозы напрямую влияет на способность к эмпатии и самоконтролю. Разговор в 23:00 после напряжённого дня — плохая идея структурно, вне зависимости от содержания.

Ошибка вторая — ожидание, что один разговор всё решит. Изменение паттерна коммуникации — это навык. Навыки не формируются за один сеанс. Планируйте серию разговоров, а не один «решающий».

Ошибка третья — смешивание содержания и процесса. Во время конфликта пары часто одновременно обсуждают и то, о чём конфликт, и то, как они общаются («ты перебиваешь», «ты не слушаешь»). Это делает разговор неуправляемым. Разделите: сначала договоритесь о процессе — кто говорит, как долго, как вы сигнализируете, что нужна пауза. Потом — содержание.

## Вывод

Интеллект не помогает договориться, потому что в состоянии конфликта мы не думаем — мы защищаемся. Механика конфликта в паре подчиняется нейробиологическим и психологическим законам, которые сильнее рационального намерения. Хорошая новость: эти законы работают в обе стороны. Изменить паттерн можно — если работать не с темой конфликта, а с тем, как вы о ней говорите. Начните с одного инструмента. Это достаточно, чтобы что-то изменилось.

---

Если узнали себя в этой статье — заберите бесплатно гайд «Как говорить о конфликте, не разрушая близость». Напишите слово СТАРТ боту.`,
    },
  ];
}

// ─── Mock generators ──────────────────────────────────────────────────────────

const MOCK_THEMES: Record<Platform, string[]> = {
  dzen: [
    'Почему пары ссорятся об одном и том же годами — психолог объясняет механику конфликта',
    'Муж не слышит меня: что за этим стоит и как это изменить',
    'После ссоры всё хорошо, но через неделю снова: почему мириться недостаточно',
    '3 фразы, которые превращают любой разговор в скандал — и чем их заменить',
    'Как остановить повторяющиеся конфликты в паре: метод, который работает без разговоров по душам',
  ],
  vc: [
    'Интеллект не помогает договориться: механика конфликта в паре и почему мы застреваем',
    'Почему 69% конфликтов в паре не решаются — и что с этим делать: данные Готтмана',
    'Нейробиология ссоры: что происходит с мозгом в конфликте и как это использовать',
    'Гарвардский метод переговоров в семейных отношениях: работает ли это',
    'Кейс: как пара за 3 месяца разорвала 6-летний паттерн повторяющихся конфликтов',
  ],
  telegraf: [
    'О чём на самом деле ссоры в паре: разбор механики конфликта',
    'Почему примирение не решает проблему — и что решает',
    'Повторяющиеся конфликты: структура и выход',
    'Что стоит за повышенным голосом: о потребностях в конфликте',
    'Три изменения в разговоре, которые меняют динамику пары',
  ],
  site: [
    'Почему пары ссорятся об одном и том же: причины и решения от психолога',
    'Повторяющиеся конфликты в паре: как остановить замкнутый круг ссор',
    'Как помириться после ссоры с мужем: психология примирения и диалога',
    'Механика конфликта в семье: почему возникают и как предотвратить',
    'Ссоры в браке: когда обращаться к психологу и что делать самостоятельно',
  ],
};


// SEO инструкция встроена в логику генерации (под капотом):
// H2-подзаголовки содержат смежные поисковые запросы,
// ключевые слова вставлены органично, длина 2000-2500 слов.
function buildArticle(
  _platform:   Platform,
  _h1:         string,
  ctaType:     CtaType,
  botKeyword:  string,
  facture:     string,
): string {
  const hasFacture = facture.trim().length > 0;
  const caseBlock  = hasFacture
    ? facture.trim()
    : 'Ко мне обратилась клиентка с запросом — ссоры по одному и тому же кругу. В ходе работы выяснилось: оба партнёра говорили о разном, используя одни и те же слова.';

  const ctaBlock = ctaType === 'telegram'
    ? 'Если эта статья была полезной — подпишитесь на мой Telegram канал. Там я разбираю похожие ситуации каждую неделю.'
    : `Если узнали себя в этой статье — заберите бесплатный материал. Напишите слово ${botKeyword || 'СТАРТ'} боту.`;

  const content = `Тема конфликтов в паре — одна из самых частых в моей практике. И самая парадоксальная: люди понимают, что происходит, хотят изменить — и всё равно возвращаются к тому же кругу. В этой статье я разберу механику повторяющихся конфликтов, объясню почему примирение не решает проблему, и дам конкретные инструменты, которые работают.

## Суть проблемы: почему конфликты повторяются

Видимая тема конфликта почти никогда не является настоящей темой конфликта.

${caseBlock}

Оба партнёра чувствуют себя правыми и невидимыми одновременно. Пока они не научатся говорить о том, что стоит за словами — ссора будет возвращаться. Исследования Готтмана показывают: около 69% конфликтов в паре — хронические. Они не решаются. Они управляются.

## Почему примирение не решает проблему

Стандартный цикл конфликта: накопление напряжения → взрыв → примирение → медовый месяц → снова накопление. Примирение возвращает пару к исходной точке — но не к точке до напряжения.

Пары умеют мириться, но не умеют разговаривать. Примирение — это пауза. Не решение.

Признак незакрытого цикла: вы испытываете облегчение после примирения, но не ощущение решённости. Что-то остаётся незакрытым.

## Что реально помогает

Первый инструмент — замедление. Большинство эскалаций происходят потому, что оба реагируют быстрее, чем думают. Простое правило: при первых признаках накала — взять паузу и спросить себя: «Чего я на самом деле хочу прямо сейчас?»

Второй инструмент — переход от позиций к потребностям. Позиция: «Ты никогда не слушаешь». Потребность: «Мне важно чувствовать, что меня слышат». Когда вы говорите о потребностях — партнёру гораздо сложнее не услышать вас.

Третий инструмент — мягкое начало. По данным Готтмана, начало разговора предсказывает его исход с точностью 96%. Замените «ты никогда» на «когда происходит X, я чувствую Y» — и структура разговора изменится.

## Типичные мифы

Миф первый: «Мы просто несовместимы». Несовместимость и паттерн — разные вещи. Паттерн можно изменить.

Миф второй: «Партнёр должен измениться первым». Отношения — это система. Когда один элемент меняется, система меняется тоже. Начать с себя — не значит взять на себя всю вину.

Миф третий: «Хорошие отношения — без ссор». Пары без конфликтов существуют. Это не счастливые пары — это пары, где кто-то перестал говорить о важном.

## Вывод

Повторяющиеся ссоры — это сигнал, что что-то важное остаётся невысказанным. Механика конфликта устроена так, что он будет возвращаться, пока его настоящая тема не будет названа. Начните с вопроса: что я на самом деле чувствовал(а)? Не то, о чём мы ссорились — а то, что было под этим.

---

${ctaBlock}`;

  return content;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function articlesKey(projectId: string) { return `articles_${projectId}`; }

function loadArticles(projectId: string): SavedArticle[] {
  try {
    const raw = localStorage.getItem(articlesKey(projectId));
    if (raw) return JSON.parse(raw) as SavedArticle[];
  } catch {}
  return makeSeedArticles();
}

function persistArticles(projectId: string, articles: SavedArticle[]) {
  localStorage.setItem(articlesKey(projectId), JSON.stringify(articles));
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
  const { activeProjectId } = useProjectsStore();

  const [strat] = useState<StrategyData>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_STRATEGY) ?? '{}'); }
    catch { return {}; }
  });
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Articles
  const [articles, setArticles]     = useState<SavedArticle[]>(() => loadArticles(activeProjectId));
  const [selectedId, setSelectedId] = useState<string | null>(() => loadArticles(activeProjectId)[0]?.id ?? null);

  // Phase
  const [phase, setPhase] = useState<Phase>(() =>
    loadArticles(activeProjectId).length > 0 ? 'editor' : 'step1',
  );

  // Step 1
  const [platform,   setPlatform]   = useState<Platform>('dzen');
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

  // ── Persist ──────────────────────────────────────────────────────────────────
  const updateArticles = useCallback((next: SavedArticle[]) => {
    setArticles(next);
    persistArticles(activeProjectId, next);
  }, [activeProjectId]);

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  function handleGenerateThemes() {
    setPhase('step2-loading');
    setTimeout(() => {
      setThemes(MOCK_THEMES[platform]);
      setSelectedTheme(MOCK_THEMES[platform][0] ?? '');
      setFacture('');
      setPhase('step2');
    }, 1200);
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  function handleGenerateArticle() {
    setPhase('generating');
    setTimeout(() => {
      const content = buildArticle(platform, selectedTheme, ctaType, botKeyword, facture);
      const id    = `art-${Date.now()}`;
      const title = `${selectedTheme.slice(0, 50)}… · ${PLATFORM_LABELS[platform]}`;
      const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const newArticle: SavedArticle = {
        id, platform, ctaType, botKeyword,
        content, editedContent: '', editedTitle: title, createdAt: now,
      };
      const next = [newArticle, ...articles];
      updateArticles(next);
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
    updateArticles(articles.map(a =>
      a.id === artId ? { ...a, editedTitle: ov.title, editedContent: ov.content } : a,
    ));
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
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${title}.docx`; a.click();
    URL.revokeObjectURL(url);
  }

  function goToStep1() {
    setPlatform('dzen'); setCtaType('telegram'); setBotKeyword('');
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
          <button className={s.actionBtn} onClick={() => alert('Добавлено в контент-план (в разработке)')}>
            📅 Включить в контент-план
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
        <p className={s.loadingText}>Генерирую SEO-заголовки...</p>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div className={s.loadingScreen}>
        <span className={s.loadingEmoji}>✍️</span>
        <p className={s.loadingText}>Пишу статью... это займёт несколько секунд</p>
        <p className={s.loadingSub}>Формирую структуру и блоки статьи</p>
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
              Сначала пройдите <NavLink to="/strategy" className={s.warnLink}>Стратегию</NavLink> — это улучшит SEO-темы
            </span>
          </div>
        )}

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
        <div className={s.sectionTitle}>Выберите SEO-заголовок</div>
        <div className={s.sectionSub}>
          ИИ предложил 5 заголовков для площадки «{PLATFORM_LABELS[platform]}»
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
            placeholder="Расскажите о своём опыте, случае из практики, методах работы..."
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
          onClick={handleGenerateArticle}
        >
          Написать статью →
        </button>
      </div>
    </div>
  );
}
