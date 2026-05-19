import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { NavLink } from 'react-router-dom';
import { SplitEditor, SplitItem } from '../../components/SplitEditor/SplitEditor';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { useContentApi } from '../../hooks/useContentApi';
import { exportToDocx } from '../../utils/exportDocx';
import { ModelBar } from '../../components/MessageInput/MessageInput';
import { aiApi } from '../../api/ai';
import { useModelStore } from '../../store/model.store';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { contentGenerationKey, useContentGenerationStore } from '../../store/content-generation.store';
import s from './Articles.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'vc' | 'dzen' | 'habr' | 'linkedin' | 'medium' | 'spark' | 'corporate' | 'seo' | 'telegram';
type ArticleType = 'story' | 'case' | 'analytics' | 'opinion' | 'review' | 'instruction' | 'guide' | 'seoArticle' | 'trends' | 'mistakes' | 'framework' | 'listicle' | 'research' | 'comparison' | 'educational';
type CtaType  = 'telegram' | 'leadmagnet' | 'consultation' | 'subscribe' | 'soft';
type Tone = 'editorial' | 'analytical' | 'journalistic' | 'premium' | 'conversational' | 'provocative' | 'intellectual';
type Depth = 'short' | 'medium' | 'deep' | 'pillar';
type Phase    = 'step1' | 'step2-loading' | 'step2' | 'generating' | 'editor';

interface StrategyData {
  chosenSegment?:    string;
  chosenSubsegment?: string;
}

interface SavedArticle {
  id:            string;
  platform:      Platform;
  articleType?:  ArticleType;
  tone?:         Tone;
  depth?:        Depth;
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

const PLATFORM_OPTIONS: { key: Platform; emoji: string; label: string; desc: string }[] = [
  { key: 'vc',        emoji: '💼', label: 'VC.ru',        desc: 'Аналитика, кейсы, цифры, business tone' },
  { key: 'dzen',      emoji: '📰', label: 'Дзен',         desc: 'Storytelling, эмоциональное удержание, высокая читаемость' },
  { key: 'habr',      emoji: '🧩', label: 'Habr',         desc: 'Системность, глубина, структура, экспертиза' },
  { key: 'linkedin',  emoji: '💼', label: 'LinkedIn',     desc: 'Thought leadership, professional insights, authority' },
  { key: 'medium',    emoji: '✍️', label: 'Medium',       desc: 'Editorial essays, storytelling, intellectual clarity' },
  { key: 'spark',     emoji: '⚡', label: 'Spark',        desc: 'Бизнес-опыт, стартапы, выводы, дискуссии' },
  { key: 'corporate', emoji: '🏢', label: 'Корп. блог',   desc: 'Экспертность бренда, доверие, evergreen-контент' },
  { key: 'seo',       emoji: '🌐', label: 'SEO Blog',     desc: 'Поисковый трафик, структура, FAQ, long-tail запросы' },
  { key: 'telegram',  emoji: '💬', label: 'Telegram',     desc: 'Telegram longread, сильный голос автора, удержание' },
];

const PLATFORM_ICONS: Record<Platform, string> = {
  vc: '💼', dzen: '📰', habr: '🧩', linkedin: '💼', medium: '✍️', spark: '⚡', corporate: '🏢', seo: '🌐', telegram: '💬',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  vc: 'VC.ru',
  dzen: 'Дзен',
  habr: 'Habr',
  linkedin: 'LinkedIn Articles',
  medium: 'Medium',
  spark: 'Spark',
  corporate: 'Корпоративный блог',
  seo: 'SEO Blog',
  telegram: 'Telegram longread',
};

const ARTICLE_TYPE_OPTIONS: { key: ArticleType; label: string }[] = [
  { key: 'story', label: 'История' },
  { key: 'case', label: 'Кейс' },
  { key: 'analytics', label: 'Аналитика' },
  { key: 'opinion', label: 'Opinion' },
  { key: 'review', label: 'Разбор' },
  { key: 'instruction', label: 'Инструкция' },
  { key: 'guide', label: 'Гайд' },
  { key: 'seoArticle', label: 'SEO-статья' },
  { key: 'trends', label: 'Тренды' },
  { key: 'mistakes', label: 'Ошибки' },
  { key: 'framework', label: 'Framework' },
  { key: 'listicle', label: 'Подборка' },
  { key: 'research', label: 'Исследование' },
  { key: 'comparison', label: 'Comparison' },
  { key: 'educational', label: 'Educational' },
];

const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = Object.fromEntries(
  ARTICLE_TYPE_OPTIONS.map((item) => [item.key, item.label]),
) as Record<ArticleType, string>;

const TONE_OPTIONS: { key: Tone; label: string }[] = [
  { key: 'editorial', label: 'Editorial' },
  { key: 'analytical', label: 'Analytical' },
  { key: 'journalistic', label: 'Journalistic' },
  { key: 'premium', label: 'Premium' },
  { key: 'conversational', label: 'Conversational' },
  { key: 'provocative', label: 'Provocative' },
  { key: 'intellectual', label: 'Intellectual' },
];

const DEPTH_OPTIONS: { key: Depth; label: string }[] = [
  { key: 'short', label: 'Short' },
  { key: 'medium', label: 'Medium' },
  { key: 'deep', label: 'Deep' },
  { key: 'pillar', label: 'Pillar content' },
];

interface TopicOption {
  id: string;
  title: string;
  details: string;
  score: number;
  saved: boolean;
}

const FACTURE_HINTS = [
  '1. Что вы видели на практике? Какие кейсы, ошибки и выводы были?',
  '2. Что сейчас происходит у ЦА? Какие страхи, убеждения и ошибки мешают?',
  '3. Какие тренды, конфликты или странности рынка вы замечаете?',
  '4. С чем вы не согласны в рынке и какую авторскую позицию хотите показать?',
  '5. Какой главный вывод и какое действие должны остаться после статьи?',
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
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const { openAddModal } = useContentPlanStore();
  const { saveItem: saveToApi } = useContentApi({ projectId: activeProjectId, type: 'ARTICLE' });

  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? '');
  const getSettings = useModelStore((s) => s.getSettings);
  const { mergedProfile } = useProjectMarketingContext();
  const generationTask = useContentGenerationStore((s) => s.tasks[contentGenerationKey(activeProjectId, 'articles')]);
  const startGenerationTask = useContentGenerationStore((s) => s.startTask);
  const finishGenerationTask = useContentGenerationStore((s) => s.finishTask);

  const strat = (useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers) ?? {}) as StrategyData;
  const hasStrategy = !!(strat.chosenSegment || strat.chosenSubsegment);

  // Articles
  const [articles, setArticles]     = useState<SavedArticle[]>(() => loadArticles(activeProjectId));
  const [selectedId, setSelectedId] = useState<string | null>(() => loadArticles(activeProjectId)[0]?.id ?? null);

  // Phase
  const [phase, setPhase] = useState<Phase>(() =>
    loadArticles(activeProjectId).length > 0 ? 'editor' : 'step1',
  );

  // Step 1
  const [platform,    setPlatform]    = useState<Platform>('vc');
  const [articleType, setArticleType] = useState<ArticleType>('analytics');
  const [tone,        setTone]        = useState<Tone>('editorial');
  const [depth,       setDepth]       = useState<Depth>('deep');
  const [ctaType,     setCtaType]     = useState<CtaType>('soft');
  const [botKeyword,  setBotKeyword]  = useState('');

  // Step 2
  const [topics,        setTopics]        = useState<TopicOption[]>([]);
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

  function parseTopics(content: string): TopicOption[] {
    const chunks = content
      .split(/\n(?=\s*(?:\d+[\).\]]|[-*])\s+)/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    const source = chunks.length >= 5 ? chunks : content.split('\n').map((line) => line.trim()).filter((line) => line.length > 20);

    return source.slice(0, 30).map((chunk, index) => {
      const clean = chunk.replace(/^\s*(?:[-*]|\d+[\).\]])\s*/, '').trim();
      const [firstLine, ...rest] = clean.split('\n').map((line) => line.trim()).filter(Boolean);
      const title = (firstLine || clean).replace(/\*\*/g, '').slice(0, 180);
      return {
        id: `topic-${Date.now()}-${index}`,
        title,
        details: rest.join('\n') || clean,
        score: Math.max(58, 96 - Math.floor(index * 1.4)),
        saved: false,
      };
    });
  }

  function updateTopic(id: string, patch: Partial<TopicOption>) {
    setTopics((items) => items.map((topic) => (topic.id === id ? { ...topic, ...patch } : topic)));
  }

  // ── Step 1 → Step 2 ──────────────────────────────────────────────────────────
  async function handleGenerateThemes() {
    setPhase('step2-loading');
    try {
      const settings = getSettings('articles');
      const seg      = strat.chosenSegment ?? strat.chosenSubsegment ?? '';
      const prompt   = `Сгенерируй 20 сильных тем для Articles Engine в Luma IQ.

Тип статьи: ${ARTICLE_TYPE_LABELS[articleType]}
Площадка: ${PLATFORM_LABELS[platform]}
Тон: ${tone}
Глубина: ${depth}
${seg ? `Целевой сегмент: ${seg}` : ''}
Формат площадки: ${PLATFORM_OPTIONS.find((p) => p.key === platform)?.desc ?? ''}

Требования:
- темы должны быть привязаны к текущему проекту, эксперту, ЦА, позиционированию, продуктам и воронке;
- не используй нишу психологии, если текущий проект не про психологию;
- темы должны работать как editorial / SEO / PR материал, а не generic блог;
- каждая тема должна иметь angle, SEO intent, pain point и curiosity gap;
- отсортируй темы по потенциалу.

Формат каждой темы:
1. Заголовок: ...
Подзаголовок: ...
Angle: ...
SEO intent: ...
Для кого: ...
Почему будут читать: ...
Pain point: ...
Curiosity gap: ...
Scores: SEO / CTR / Authority / Share / Lead — [0-100]

Не объясняй логику.`;

      const resp = await aiApi.chat({
        model: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        section: 'articles',
        message: prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile: mergedProfile as Record<string, string>,
      });

      const parsed = parseTopics(resp.content);

      if (parsed.length === 0) {
        toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
        return;
      }
      setTopics(parsed);
      setSelectedTheme(parsed[0]?.title ?? '');
      setFacture('');
    } catch (err) {
      console.error('[Articles] themes AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      return;
    }
    setPhase('step2');
  }

  // ── Step 2 → Editor ──────────────────────────────────────────────────────────
  async function handleGenerateArticle() {
    startGenerationTask(activeProjectId, 'articles', 'Пишу статью', selectedTheme || 'Формирую структуру и текст статьи');
    setPhase('generating');
    try {
      const settings = getSettings('articles');
      const seg      = strat.chosenSegment ?? strat.chosenSubsegment ?? '';
      const selectedTopic = topics.find((topic) => topic.title === selectedTheme);
      const ctaText  = {
        telegram: 'CTA: мягко пригласить в Telegram',
        leadmagnet: `CTA: получить лидмагнит, написав слово «${botKeyword || 'СТАРТ'}»`,
        consultation: 'CTA: записаться на разбор / консультацию',
        subscribe: 'CTA: подписаться на автора',
        soft: 'CTA: мягкий editorial CTA без давления',
      }[ctaType];

      const prompt = `Создай профессиональную экспертную статью для Articles Engine в Luma IQ.

Тип статьи: ${ARTICLE_TYPE_LABELS[articleType]}
Площадка: ${PLATFORM_LABELS[platform]}
Тон: ${tone}
Глубина: ${depth}
Тема: ${selectedTheme}
${selectedTopic?.details ? `Детали темы:\n${selectedTopic.details}` : ''}
${seg ? `Целевой сегмент: ${seg}` : ''}
${facture.trim() ? `Фактура эксперта:\n${facture.trim()}` : ''}
${ctaText}

Перед написанием оцени фактуру.
Если фактуры недостаточно для сильной статьи, верни только блок “Нужна фактура” и 7 конкретных уточняющих вопросов.

Если фактуры достаточно, создай:
1. Заголовок 20–30 слов
2. Подзаголовок
3. Лид-текст
4. 3–5 вариантов outline / narrative arcs кратко
5. Полную статью в markdown с H2/H3
6. SEO block: primary keyword, secondary keywords, search intent, semantic entities, long-tail keywords
7. Meta title, meta description, slug
8. FAQ block
9. Internal linking ideas / next content
10. CTA
11. Article scoring: readability, authority, SEO, emotional retention, editorial quality, CTR, share, lead potential

Требования:
- не используй нишу психологии, если текущий проект не про психологию;
- статья должна быть редакционной, журналистской, экспертной и не похожей на AI;
- органично используй SEO без keyword stuffing;
- добавь фактуру, примеры, авторскую позицию, рыночный контекст и выводы;
- адаптируй структуру под площадку ${PLATFORM_LABELS[platform]};
- не пиши generic SEO-мусор, воду и инфоцыганскую подачу.

Не объясняй логику. Сразу выдавай готовый результат.`;

      const resp = await aiApi.chat({
        model: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        section: 'articles',
        message: prompt,
        conversationHistory: [],
        projectName,
        unpackingProfile: mergedProfile as Record<string, string>,
      });

      const content = resp.content.trim() || buildArticle(platform, selectedTheme, ctaType, botKeyword, facture);
      const id    = `art-${Date.now()}`;
      const title = `${selectedTheme.slice(0, 50)}… · ${PLATFORM_LABELS[platform]}`;
      const now   = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
      const newArticle: SavedArticle = {
        id, platform, articleType, tone, depth, ctaType, botKeyword,
        content, editedContent: '', editedTitle: title, createdAt: now,
      };
      const next = [newArticle, ...articles];
      updateArticles(next);
      setSelectedId(id);
      setPhase('editor');
      void saveToApi({ title, content, platform: PLATFORM_LABELS[platform] });
    } catch (err) {
      console.warn('[Articles] generate AI error:', err);
      toast.error('Неполадки со связью. Попробуйте обновить страницу и интернет соединение.');
      setPhase('step2');
    } finally {
      finishGenerationTask(activeProjectId, 'articles');
    }
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
    void exportToDocx(title, content, title || 'article');
  }

  function goToStep1() {
    setPlatform('vc');
    setArticleType('analytics');
    setTone('editorial');
    setDepth('deep');
    setCtaType('soft');
    setBotKeyword('');
    setTopics([]);
    setSelectedTheme('');
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
          <button className={s.actionBtn} onClick={() => { const st = getEditorState(art); openAddModal({ type: 'article', title: st.title, content: st.content, preview: st.content.split('\n').filter(Boolean).slice(0,2).join('\n'), platform: art.platform, projectId: activeProjectId ?? undefined, sourceId: art.id }); }}>
            📅 В контент-план
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
        <p className={s.loadingText}>Генерирую и оцениваю темы...</p>
      </div>
    );
  }

  if (phase === 'generating' || generationTask) {
    return (
      <div className={s.loadingScreen}>
        <span className={s.loadingEmoji}>✍️</span>
        <p className={s.loadingText}>{generationTask?.title ?? 'Пишу статью... это займёт несколько секунд'}</p>
        <p className={s.loadingSub}>{generationTask?.detail ?? 'Формирую структуру и блоки статьи'}</p>
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

        <div className={s.section}>
          <div className={s.sectionTitle}>Тип статьи</div>
          <div className={s.chipGroup}>
            {ARTICLE_TYPE_OPTIONS.map(t => (
              <button
                key={t.key}
                className={`${s.chip}${articleType === t.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setArticleType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

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

        <div className={s.section}>
          <div className={s.sectionTitle}>Тон</div>
          <div className={s.chipGroup}>
            {TONE_OPTIONS.map(t => (
              <button
                key={t.key}
                className={`${s.chip}${tone === t.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setTone(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>Глубина статьи</div>
          <div className={s.chipGroup}>
            {DEPTH_OPTIONS.map(d => (
              <button
                key={d.key}
                className={`${s.chip}${depth === d.key ? ' ' + s.chipActive : ''}`}
                onClick={() => setDepth(d.key)}
              >
                {d.label}
              </button>
            ))}
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
            <button
              className={`${s.chip}${ctaType === 'consultation' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('consultation')}
            >
              📞 Консультация
            </button>
            <button
              className={`${s.chip}${ctaType === 'subscribe' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('subscribe')}
            >
              ✉️ Подписка
            </button>
            <button
              className={`${s.chip}${ctaType === 'soft' ? ' ' + s.chipActive : ''}`}
              onClick={() => setCtaType('soft')}
            >
              🧭 Soft CTA
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
          <button className={s.primaryBtn} onClick={() => void handleGenerateThemes()}>
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
        <div className={s.sectionTitle}>Выберите тему статьи</div>
        <div className={s.sectionSub}>
          ИИ предложил {topics.length} тем для «{PLATFORM_LABELS[platform]}» с angle, SEO intent и оценкой потенциала.
        </div>
        <div className={s.themeList}>
          {topics.map((topic) => (
            <div key={topic.id} className={`${s.themeItem}${selectedTheme === topic.title ? ' ' + s.themeItemActive : ''}`}>
              <button className={s.themeRadio} onClick={() => setSelectedTheme(topic.title)}>
                {selectedTheme === topic.title ? '◉' : '○'}
              </button>
              <button
                className={s.themeText}
                style={{ flex: 1, background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }}
                onClick={() => setSelectedTheme(topic.title)}
              >
                <strong>{topic.title}</strong>
                {topic.details && <span style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)' }}>{topic.details.slice(0, 420)}</span>}
              </button>
              <span className={s.badge}>Score {topic.score}</span>
              <button className={s.actionBtn} onClick={() => updateTopic(topic.id, { saved: !topic.saved })}>
                {topic.saved ? 'Сохранена' : 'Сохранить'}
              </button>
            </div>
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
            placeholder="Расскажите о практике, кейсах, ошибках аудитории, рыночном контексте, спорной позиции, цифрах, примерах и главном выводе статьи..."
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
        <ModelBar section="articles" />
      </div>

      <div className={s.btnRow}>
        <button className={s.secondaryBtn} onClick={() => setPhase('step1')}>← Назад</button>
        <button
          className={s.primaryBtn}
          disabled={facture.trim().length < 30}
          onClick={() => void handleGenerateArticle()}
        >
          Написать статью →
        </button>
      </div>
    </div>
  );
}
