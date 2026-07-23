import {
  buildArticlesPrompt,
  buildAudiencePrompt,
  buildChatbotPrompt,
  buildLeadMagnetPrompt,
  buildMainProductPrompt,
  buildPostsPrompt,
  buildReelsPrompt,
  buildSocialPrompt,
  buildUTPPrompt,
  buildVideoScriptsPrompt,
} from '../dynamic.prompts';
import { contextAppendix, value } from './helpers';
import { PromptConfig } from './types';

function objectValue(inputs: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = inputs[key];
  return current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {};
}

function profileField(profile: Record<string, unknown>, key: string): string {
  const current = profile[key];
  return typeof current === 'string' ? current.trim() : '';
}

function aboutSummarySource(inputs: Record<string, unknown>): string {
  const profile = objectValue(inputs, 'profile');
  return [
    ['Кто эксперт и чем занимается', profileField(profile, 'whoYouAre')],
    ['Кому помогает', profileField(profile, 'targetAudience')],
    ['Продукты и услуги', profileField(profile, 'productsAndServices')],
    ['Экспертность и сильные стороны', profileField(profile, 'expertiseAndStrengths')],
    ['Факты доверия', profileField(profile, 'trustProofs')],
    ['Имя / обращение', profileField(profile, 'name')],
    ['Опыт в годах', profileField(profile, 'experienceYears')],
    ['Формат работы', profileField(profile, 'workFormats')],
    ['Ограничения', profileField(profile, 'antiPreferences')],
    ['Образование и сертификаты', profileField(profile, 'credentials')],
    ['Текст из файлов', profileField(profile, 'uploadedFileText')],
  ]
    .map(([label, text]) => text ? `${label}:\n${text}` : '')
    .filter(Boolean)
    .join('\n\n');
}

const MAIN_PRODUCT_STEPS: Array<{ step: string; label: string; maxTokens: number; minLength: number; task: string }> = [
  {
    step: 'names',
    label: 'Название продукта',
    maxTokens: 1800,
    minLength: 220,
    task: `Сформируй 3 варианта названия флагманского основного продукта.
Название должно отражать результат клиента, а не просто тему.

Формат:
1. **Название** — коротко почему подходит
2. **Название** — коротко почему подходит
3. **Название** — коротко почему подходит`,
  },
  {
    step: 'offer',
    label: 'Оффер',
    maxTokens: 2200,
    minLength: 300,
    task: `Сформулируй главный оффер основного продукта.
Дай 2-3 варианта и в конце выбери рекомендуемый.
Оффер должен быть понятен холодной аудитории и опираться на спрос из целевой аудитории.`,
  },
  {
    step: 'description',
    label: 'Описание продукта',
    maxTokens: 2400,
    minLength: 350,
    task: `Сделай описание основного продукта: для кого, какую проблему решает, как устроен путь, какой результат получает клиент.
Длина: 2-4 коротких абзаца.`,
  },
  {
    step: 'modules',
    label: 'Модули программы',
    maxTokens: 5200,
    minLength: 1000,
    task: `Предложи оптимальное количество модулей для программы. Не фиксируйся на 10.
Сделай программу по модулям.

Для каждого модуля:
- название модуля как job клиента;
- что клиент делает/понимает;
- оффер модуля;
- ключевое содержание;
- результат модуля.`,
  },
  {
    step: 'promise',
    label: 'Продуктовое обещание',
    maxTokens: 1400,
    minLength: 80,
    task: `Сформулируй продуктовое обещание одной сильной офферной фразой.
Длина: 30-40 слов максимум.
Без списка, без markdown, без пересказа модулей.`,
  },
  {
    step: 'edit',
    label: 'Редактирование продукта',
    maxTokens: 1800,
    minLength: 80,
    task: `Выполни правку основного продукта по запросу пользователя.
Если запрос точечный (название, формулировка оффера, цена, формат, отдельный модуль, одно обещание) — НЕ пересобирай весь продукт. Коротко подтверди, что именно изменено, и верни только обновлённый фрагмент.
Полную версию продукта возвращай только если пользователь явно просит пересобрать/переписать весь продукт.`,
  },
];

const buildPositioningLabPrompt = () => `Ты — senior стратег по позиционированию, market strategist и редактор упаковки экспертного бизнеса внутри Luma IQ.

Твоя задача — не вести анкету и не задавать вопросы, а генерировать готовые стратегические материалы на основе уже заполненного брифа проекта.

Критически важно:
- НЕ пиши "ШАГ 1", "ШАГ 2", "ШАГ 3".
- НЕ проси пользователя назвать 3–5 направлений.
- НЕ задавай анкетные вопросы вместо результата.
- НЕ возвращай инструкцию пользователю.
- Если данных не хватает, сделай разумную стратегическую гипотезу на основе доступного контекста и пометь ее как гипотезу.
- Всегда возвращай готовый структурированный результат в формате, который запросил конкретный workflow.
- Пиши только на русском языке.
`.trim();

const getAudienceAnswers = (inputs: Record<string, unknown>) => {
  const answers = inputs.answers && typeof inputs.answers === 'object' ? inputs.answers as Record<string, unknown> : {};
  const read = (key: string) => typeof answers[key] === 'string' ? String(answers[key]) : '';
  return {
    segments: read('segments'),
    chosenSegment: read('chosenSegment'),
    chosenSubsegment: read('chosenSubsegment'),
    requests: read('requests'),
    chosenRequest: read('chosenRequest'),
  };
};

const buildAudienceStepPrompt = (inputs: Record<string, unknown>) => {
  const stepId = Number(inputs.stepId ?? 1);
  if (value(inputs, 'mode') === 'stepChat') {
    const choiceInstruction = inputs.isChoicePending
      ? 'Ответь как AI-маркетолог. Если пользователь предлагает новый вариант, кратко оцени его и сформулируй название варианта в жирном формате **...**. Не спрашивай "готов ли продолжать" и не проси написать, когда пользователь будет готов. Если пользователь хочет продолжить, скажи выбрать вариант кнопкой в интерфейсе.'
      : 'Ответь как AI-маркетолог. Если пользователь просит добавить варианты, предложи конкретные дополнительные варианты. Не запускай следующий шаг автоматически.';
    return `Контекст проекта:
${value(inputs, 'projectContext', 'Контекст пока не заполнен.')}

Текущий шаг: ${value(inputs, 'stepTitle', `Шаг ${stepId}`)}

Текущий результат шага:
${value(inputs, 'currentResult', 'Результатов по шагам пока нет.')}

Вопрос пользователя:
${value(inputs, 'question', 'нет вопроса')}

${choiceInstruction}

История переписки:
${value(inputs, 'history', 'Истории пока нет.')}`;
  }
  const answers = getAudienceAnswers(inputs);
  const seg = (answers.chosenSegment || answers.segments).slice(0, 400);
  const sub = answers.chosenSubsegment.slice(0, 200);
  const req = answers.chosenRequest.slice(0, 200);
  const projectContext = value(inputs, 'projectContext', 'Контекст пока не заполнен.');
  const ctx = `Контекст проекта:\n${projectContext}\n\n`;
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
  const strictPrefix = inputs.strict ? 'ВАЖНО: Выдай ТОЛЬКО пронумерованный список. Никаких вопросов. Никаких уточнений. Только список в точном формате ниже.\n\n' : '';

  switch (stepId) {
    case 1:
      return expertCtx + 'Сгенерируй 10 сегментов целевой аудитории. Сегменты должны быть коммерчески осмысленными: разные ситуации, разные мотивы покупки, разные уровни срочности боли. Для каждого сегмента укажи: название сегмента, ситуацию «Когда:», желание «Хочу:» и цель «Чтобы:». Формат строго: «Сегмент N — **[название]**». Строго 10 сегментов.';
    case 2:
      return expertCtx + strictPrefix + `Из этих 10 сегментов:\n${answers.segments}\n\nВыбери ТОП 3 сегмента по сумме факторов: острота боли, платежеспособность, срочность запроса, понятность оффера и вероятность покупки. Никаких вопросов, никаких уточнений.\nФормат СТРОГО (только это, ничего лишнего):\n🥇 Сегмент 1 — [название]\n[1–2 предложения почему]\n🥈 Сегмент 2 — [название]\n[1–2 предложения почему]\n🥉 Сегмент 3 — [название]\n[1–2 предложения почему]`;
    case 4:
      return expertCtx + strictPrefix + `Для выбранного сегмента «${seg}» выдай ТОЛЬКО список из 5 подсегментов. Подсегменты должны отличаться конкретной ситуацией, мотивацией и покупательской готовностью.\nФормат СТРОГО (только это, ничего лишнего):\nПодсегмент 1 — [название]\nКогда: ...\nХочу: ...\nЧтобы: ...\nПодсегмент 2 — [название]\nКогда: ...\nХочу: ...\nЧтобы: ...\n(и так далее до Подсегмент 5)`;
    case 6:
      return expertCtx + `Для подсегмента «${sub}» составь список «ХОЧУ» — 10–12 конкретных желаний клиентов. Формулируй так, как клиенты реально говорят на консультации, в заявке, в переписке или в голове. Начинай каждый пункт с «• Хочу».`;
    case 7:
      return expertCtx + strictPrefix + `Для сегмента «${seg}» (подсегмент: «${sub}») выдай ТОЛЬКО список из 10 конкретных запросов, с которыми клиент мог бы прийти к эксперту. Запросы должны быть живыми, покупательскими и привязанными к ситуации подсегмента.\nФормат СТРОГО (только список, ничего лишнего):\n1. [запрос на живом языке клиента]\n2. [запрос]\n...\n10. [запрос]`;
    case 8:
      return expertCtx + strictPrefix + `Из этих 10 запросов:\n${answers.requests}\n\nОпредели ТОП 3 запроса по срочности, боли, частоте встречаемости и вероятности покупки. Покажи короткую логику выбора.\nФормат СТРОГО:\n🥇 Запрос 1 — [формулировка запроса]\n[1–2 предложения почему]\n🥈 Запрос 2 — [формулировка запроса]\n[1–2 предложения почему]\n🥉 Запрос 3 — [формулировка запроса]\n[1–2 предложения почему]`;
    case 10:
      return clientCtx + 'Напиши 8–10 болезненных вопросов, которые я как клиент задаю себе внутри по выбранному запросу. Каждый вопрос должен звучать как реальная мысль в голове. Начинай каждый пункт с «•».';
    case 11:
      return clientCtx + 'Опиши 6–8 сокровенных желаний, которые я как клиент обычно не произношу вслух, но очень хочу получить. Пиши от первого лица: «Я хочу...», «Мне хочется...», «Я мечтаю...». Начинай каждый пункт с «•».';
    case 12:
      return clientCtx + 'Сформулируй одним живым предложением главный конечный результат, к которому я как клиент хочу прийти. Не пиши «после работы с экспертом/психологом/специалистом». Опиши именно желаемое изменение в моей жизни, бизнесе или ситуации.';
    case 13:
      return clientCtx + 'Напиши монолог от первого лица (150–250 слов): что меня больше всего бесит, изматывает и уже достало в этой ситуации. Максимально живо, эмоционально и на языке клиента. Без заголовков.';
    default:
      return expertCtx + `Шаг ${stepId}: продолжи анализ целевой аудитории.`;
  }
};

const MINI_PRODUCT_STEPS: Array<{ step: string; label: string; maxTokens: number; minLength: number; task: string }> = [
  { step: 'bestName', label: 'Лучшее название мини-продукта', maxTokens: 2600, minLength: 450, task: 'Дай 10 вариантов названия мини-продукта и выбери рекомендуемый вариант. Названия должны быть связаны с болью и первым результатом, без пустого инфобизнеса.' },
  { step: 'mainOffer', label: 'Главный оффер', maxTokens: 2600, minLength: 450, task: 'Сформулируй 5 вариантов главного оффера мини-продукта и выбери рекомендуемый. Формула: за 7 дней / 3 занятия / конкретный первый результат / без старого болезненного способа.' },
  { step: 'shortDescription', label: 'Краткое описание продукта', maxTokens: 2600, minLength: 450, task: 'Опиши мини-продукт в 2-4 коротких абзацах: для кого, какая узкая задача, почему это можно проработать за 7 дней, какой первый управляемый результат участник получит. Отдельно задай честную границу результата.' },
  { step: 'lesson1', label: '1 занятие', maxTokens: 3400, minLength: 700, task: 'Проработай занятие 1: диагностика и разворот мышления. Верни название, главную задачу, почему важно, что разберём, практику, домашнее задание, артефакт и результат после занятия.' },
  { step: 'lesson2', label: '2 занятие', maxTokens: 3400, minLength: 700, task: 'Проработай занятие 2: новый инструмент/метод и практика. Верни название, главную задачу, почему важно, что разберём, практику, домашнее задание, артефакт и результат после занятия.' },
  { step: 'lesson3', label: '3 занятие', maxTokens: 3400, minLength: 700, task: 'Проработай занятие 3: сборка системы, закрепление и следующий шаг. Верни название, главную задачу, почему важно, что разберём, практику, домашнее задание, артефакт и результат после занятия.' },
  { step: 'sevenDaySchedule', label: 'Расписание на 7 дней', maxTokens: 3200, minLength: 650, task: 'Собери расписание на 7 дней: задача дня, что сделать, сколько времени займёт, что получится на выходе. Дни 1/3/6 — занятия, остальные дни — внедрение и задания.' },
  { step: 'mainResult', label: 'Главный результат', maxTokens: 2400, minLength: 420, task: 'Сформулируй реалистичный первый результат мини-продукта, продуктовое обещание и 5-7 быстрых побед. Не обещай полного решения большой системной проблемы за 7 дней.' },
  { step: 'fit', label: 'Для кого / не для кого', maxTokens: 3000, minLength: 600, task: 'Опиши для кого мини-продукт и кому он не подойдёт через реальные ситуации клиента. Честные границы должны повышать доверие.' },
  { step: 'bonuses', label: 'Бонусы', maxTokens: 3000, minLength: 600, task: 'Предложи 3-5 практичных бонусов. Для каждого: название, что внутри, какое возражение/проблему закрывает, почему полезен, какой быстрый результат даёт.' },
  { step: 'objections', label: 'Возражения и ответы', maxTokens: 3600, minLength: 850, task: 'Опиши 10 ключевых возражений аудитории. Для каждого: возражение, что за ним стоит, как закрыть в тексте, какой элемент продукта закрывает.' },
  { step: 'landingBlock', label: 'Продающий блок для лендинга', maxTokens: 5200, minLength: 1400, task: 'Сформируй продающий блок для лендинга: первый экран, боль, уже пробовали, почему не работает, что будет иначе, программа, результат, формат, эксперт, бонусы, кому подходит/не подходит, FAQ, финальный CTA.' },
  { step: 'telegramPosts', label: '3 Telegram-поста', maxTokens: 5200, minLength: 1400, task: 'Напиши 3 Telegram-поста для продажи мини-продукта: через боль и узнавание, через экспертный разворот, через оффер и приглашение. Каждый пост должен быть готов к публикации.' },
  { step: 'nextProductBridge', label: 'Мост к следующему продукту', maxTokens: 3200, minLength: 650, task: 'Опиши мост к следующему продукту: что участник уже получил, что понял, где проявились более глубокие задачи, почему логично идти дальше, какой следующий продукт решает большую проблему.' },
  { step: 'edit', label: 'Редактирование мини-продукта', maxTokens: 1800, minLength: 80, task: 'Выполни правку мини-продукта по запросу пользователя. Если запрос точечный (название, оффер, занятие, бонус, CTA, цена, формат) — НЕ пересобирай весь мини-продукт. Коротко подтверди изменение и верни только обновлённый фрагмент. Полную версию возвращай только по явной просьбе пересобрать/переписать весь мини-продукт.' },
];

const LEAD_MAGNET_STEPS: Array<{ step: string; maxTokens: number; minLength: number }> = [
  ...[
    'headline', 'subheadline', 'leadText', 'articleMap', 'expertIntro', 'misunderstanding', 'problemCause',
    'triedSolutions', 'failedSolutions', 'bigShift', 'methodModel', 'methodDemo', 'usefulConclusion',
    'articleLimits', 'nextStepBridge', 'nextStepSale', 'firstCta', 'objections', 'extraFormat',
    'urgency', 'finalSummary', 'finalPs', 'finalCta',
  ].map((step) => ({ step, maxTokens: 4200, minLength: 350 })),
  ...['concept', 'hook', 'script', 'practice', 'cta', 'structure', 'content', 'checklist']
    .map((step) => ({ step, maxTokens: step === 'script' || step === 'content' ? 5200 : 3600, minLength: 450 })),
  { step: 'edit', maxTokens: 1800, minLength: 80 },
];

export const CONTENT_WORKFLOW_PROMPTS: PromptConfig[] = [
  {
    id: 'ai.dialog.message.v1',
    version: 'v1',
    feature: 'ai_chat',
    workflow: 'ai.dialog',
    step: 'message',
    model: 'gpt-5.4',
    temperature: 0.65,
    maxTokens: 2600,
    artifactType: 'ai_dialog_message',
    systemPrompt: (context) => `Ты — AI-маркетолог Luma IQ внутри конкретного проекта.

Работай как стратегический помощник по упаковке, продуктам, контенту и воронке.
Отвечай на русском языке, конкретно и по делу.
Опирайся только на selective context проекта ниже, не выдумывай нишу, опыт, цифры или продукты.
Если данных не хватает, задай 1-3 точных уточняющих вопроса.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => {
      const history = Array.isArray(inputs.history)
        ? inputs.history
          .slice(-12)
          .map((item) => {
            const msg = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            return `${value(msg, 'role', 'user')}: ${value(msg, 'content')}`;
          })
          .filter(Boolean)
          .join('\n')
        : '';

      return `История последних сообщений:
${history || 'Пока нет.'}

Сообщение пользователя:
${value(inputs, 'message')}

Ответь как AI-маркетолог проекта.`;
    },
    validationRules: { minLength: 80, maxLength: 9000, structuredOutput: 'text' },
  },
  {
    id: 'posts.topic.generate.v1',
    version: 'v1',
    feature: 'post',
    workflow: 'posts.topic',
    step: 'generate',
    model: 'gpt-5.4',
    temperature: 0.7,
    maxTokens: 2600,
    artifactType: 'post_topics',
    systemPrompt: (context) => buildPostsPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Сгенерируй 10 тем для постов.

Платформа: ${value(inputs, 'platform', 'Telegram')}
Тип поста: ${value(inputs, 'postType', 'экспертный / прогревающий')}
Цель: ${value(inputs, 'goal', 'прогреть аудиторию и привести к следующему шагу')}

Для каждой темы верни:
- заголовок;
- angle;
- pain point;
- CTA direction;
- score 0-100.

${contextAppendix(context)}

Не объясняй логику. Верни только список тем.`,
    validationRules: { minLength: 300, minListItems: 8, structuredOutput: 'list' },
  },
  {
    id: 'posts.post.write.v1',
    version: 'v1',
    feature: 'post',
    workflow: 'posts.post',
    step: 'write',
    model: 'gpt-5.4',
    temperature: 0.7,
    maxTokens: 3600,
    artifactType: 'post',
    systemPrompt: (context) => buildPostsPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Напиши готовый пост.

Платформа: ${value(inputs, 'platform', 'Telegram')}
Тема: ${value(inputs, 'topic')}
Тип: ${value(inputs, 'postType', 'экспертный')}
Цель: ${value(inputs, 'goal', 'следующее действие')}
CTA: ${value(inputs, 'cta', 'нативный CTA')}
Фактура: ${value(inputs, 'facture', 'не указана')}

${contextAppendix(context)}

Верни только готовый пост без комментариев.`,
    validationRules: { minLength: 600, requiredPatterns: ['CTA|призыв|следующ'], structuredOutput: 'text' },
  },
  {
    id: 'reels.hooks.generate.v1',
    version: 'v1',
    feature: 'reel',
    workflow: 'reels.hooks',
    step: 'generate',
    model: 'gpt-5.4',
    temperature: 0.75,
    maxTokens: 4200,
    artifactType: 'reels_hooks',
    systemPrompt: (context) => buildReelsPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Сгенерируй 30 сильных хуков для Reels Engine.

Площадка: ${value(inputs, 'platform', 'Reels')}
Цель: ${value(inputs, 'goal', 'лидмагнит')}
Тон: ${value(inputs, 'tone', 'экспертный')}
Интенсивность: ${value(inputs, 'intensity', 'medium')}

Раздели на:
- высокий приоритет;
- средний приоритет;
- тестовые.

У каждого хука укажи score 0-100 и 2 механики.

${contextAppendix(context)}

Не объясняй логику.`,
    validationRules: { minLength: 700, minListItems: 20, requiredPatterns: ['score|Score|оцен'], structuredOutput: 'list' },
  },
  {
    id: 'reels.script.write.v1',
    version: 'v1',
    feature: 'reel',
    workflow: 'reels.script',
    step: 'write',
    model: 'gpt-5.4',
    temperature: 0.7,
    maxTokens: 4600,
    artifactType: 'reels_script',
    systemPrompt: (context) => buildReelsPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Создай сценарий вертикального видео на 45-60 секунд.

Выбранный хук: ${value(inputs, 'hook')}
Площадка: ${value(inputs, 'platform', 'Reels')}
Цель: ${value(inputs, 'goal', 'следующее действие')}
Тон: ${value(inputs, 'tone', 'экспертный')}
Фактура: ${value(inputs, 'facture', 'не указана')}
CTA: ${value(inputs, 'cta', 'нативный CTA')}

Формат:
## Заголовок
## Хук
## Сценарий по сценам
## Эмоциональные акценты
## CTA
## Подсказки для съемки и удержания

${contextAppendix(context)}

Не объясняй логику. Сразу выдавай готовый сценарий.`,
    validationRules: {
      requiredIncludes: ['## Хук', '## CTA'],
      requiredPatterns: ['## Сценарий|сцен[аы]', 'удержан|акцент'],
      minLength: 900,
      minHeadings: 4,
      structuredOutput: 'script',
    },
  },
  {
    id: 'articles.topic.generate.v1',
    version: 'v1',
    feature: 'article',
    workflow: 'articles.topic',
    step: 'generate',
    model: 'gpt-5.4',
    temperature: 0.72,
    maxTokens: 5200,
    artifactType: 'article_topics',
    systemPrompt: (context) => buildArticlesPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Сгенерируй 20 тем для Articles Engine.

Тип статьи: ${value(inputs, 'articleType', 'аналитика')}
Площадка: ${value(inputs, 'platform', 'VC.ru')}
Тон: ${value(inputs, 'tone', 'editorial')}
Глубина: ${value(inputs, 'depth', 'deep')}

Для каждой темы верни:
- заголовок;
- подзаголовок;
- angle;
- SEO intent;
- для кого;
- почему будут читать;
- pain point;
- curiosity gap;
- scores: SEO / CTR / Authority / Share / Lead.

${contextAppendix(context)}

Не объясняй логику.`,
    validationRules: { minLength: 1000, minListItems: 12, requiredPatterns: ['SEO|intent|интент', 'score|Score|оцен'], structuredOutput: 'list' },
  },
  {
    id: 'articles.article.write.v1',
    version: 'v1',
    feature: 'article',
    workflow: 'articles.article',
    step: 'write',
    model: 'gpt-5.4',
    temperature: 0.65,
    maxTokens: 8000,
    artifactType: 'article',
    systemPrompt: (context) => buildArticlesPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Создай профессиональную экспертную статью.

Тип статьи: ${value(inputs, 'articleType', 'аналитика')}
Площадка: ${value(inputs, 'platform', 'VC.ru')}
Тон: ${value(inputs, 'tone', 'editorial')}
Глубина: ${value(inputs, 'depth', 'deep')}
Тема: ${value(inputs, 'topic')}
Фактура: ${value(inputs, 'facture', 'не указана')}
CTA: ${value(inputs, 'cta', 'soft editorial CTA')}

Верни:
1. Заголовок
2. Подзаголовок
3. Лид-текст
4. Полную статью с H2/H3
5. SEO block
6. Meta title / meta description / slug
7. FAQ
8. Internal linking ideas
9. CTA
10. Article scoring

${contextAppendix(context)}

Не объясняй логику. Сразу выдавай готовую статью.`,
    validationRules: {
      requiredIncludes: ['##', 'SEO', 'CTA'],
      requiredPatterns: ['Meta|meta|description|slug', 'FAQ|Вопросы|вопрос'],
      minLength: 2500,
      minHeadings: 5,
      structuredOutput: 'article',
    },
  },
  {
    id: 'chatbot.chain.generate.v1',
    version: 'v1',
    feature: 'chatbot_chain',
    workflow: 'chatbot.chain',
    step: 'generate',
    model: 'gpt-5.4',
    temperature: 0.7,
    maxTokens: 7200,
    artifactType: 'chatbot_chain',
    systemPrompt: (context) => buildChatbotPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Сгенерируй 13 Telegram-постов для раздела “Цепочка сообщений” в Luma IQ.

Бот: ${value(inputs, 'botName', 'Telegram-бот')}
Целевой сегмент: ${value(inputs, 'segment', 'сегмент из проекта')}
Формат лид-магнита: ${value(inputs, 'leadMagnetFormat', 'материал')}
Расписание встреч: ${value(inputs, 'meetingSchedule', 'не указано')}

Логика цепочки:
1-5 — продать изучение лидмагнита.
6-10 — продать следующее действие.
11-13 — вернуть аудиторию и усилить действие.

Формат ответа строго:
1. [Заголовок поста]
[готовый текст поста]

И так до 13.

${contextAppendix(context)}

Не объясняй логику. Сразу выдавай готовые посты.`,
    validationRules: { minLength: 2200, minListItems: 10, structuredOutput: 'list' },
  },
  {
    id: 'video.topic.generate.v1',
    version: 'v1',
    feature: 'video_script',
    workflow: 'video.topic',
    step: 'generate',
    model: 'gpt-5.4',
    temperature: 0.7,
    maxTokens: 2600,
    artifactType: 'video_topics',
    systemPrompt: (context) => buildVideoScriptsPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Предложи 5 тем для YouTube-видео.

Длительность: примерно ${value(inputs, 'duration', '10')} минут.
Целевой сегмент: ${value(inputs, 'segment', 'сегмент из проекта')}

Темы должны быть привязаны к проекту, ЦА, позиционированию и продуктовой логике.
Верни только нумерованный список из 5 тем, одна тема — одна строка.

${contextAppendix(context)}`,
    validationRules: { minLength: 150, minListItems: 5, structuredOutput: 'list' },
  },
  {
    id: 'video.script.write.v1',
    version: 'v1',
    feature: 'video_script',
    workflow: 'video.script',
    step: 'write',
    model: 'gpt-5.4',
    temperature: 0.68,
    maxTokens: 5200,
    artifactType: 'video_script',
    systemPrompt: (context) => buildVideoScriptsPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Напиши сценарий YouTube-видео.

Длительность: примерно ${value(inputs, 'duration', '10')} минут.
Тема: ${value(inputs, 'topic')}
Целевой сегмент: ${value(inputs, 'segment', 'сегмент из проекта')}
Фактура: ${value(inputs, 'facture', 'не указана')}
CTA: ${value(inputs, 'cta', 'нативный CTA')}

Структура:
- КРЮЧОК
- ПРОБЛЕМА
- КЕЙС / пример
- РЕШЕНИЕ
- ПРАКТИКА
- ПРИЗЫВ К ДЕЙСТВИЮ

Для каждого блока укажи тайминг и текст на камеру.

${contextAppendix(context)}

Верни только готовый сценарий.`,
    validationRules: { minLength: 1200, requiredPatterns: ['КРЮЧОК|Хук', 'ПРИЗЫВ|CTA'], structuredOutput: 'script' },
  },
  {
    id: 'product.main.generate.v1',
    version: 'v1',
    feature: 'product_main',
    workflow: 'product.main',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 4200,
    artifactType: 'product_main_block',
    systemPrompt: (context) => buildMainProductPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Раздел: Конструктор основного продукта.

Текущий краткий черновик продукта:
${value(inputs, 'currentProduct', 'Пока пусто.')}

Запрос пользователя / задача:
${value(inputs, 'userRequest', value(inputs, 'task', 'Создай или доработай фрагмент основного продукта.'))}

Правила:
- Не пересобирай весь продукт, если запрос точечный.
- Используй selective project context ниже.
- Верни только готовый результат без служебных комментариев.

${contextAppendix(context)}
`,
    validationRules: { minLength: 250, structuredOutput: 'text' },
  },
  ...MAIN_PRODUCT_STEPS.map<PromptConfig>((step) => ({
    id: `product.main.${step.step}.v1`,
    version: 'v1',
    feature: 'product_main',
    workflow: 'product.main',
    step: step.step,
    model: 'gpt-5.5',
    temperature: 0.62,
    maxTokens: step.maxTokens,
    artifactType: `product_main_${step.step}`,
    systemPrompt: (context) => buildMainProductPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Раздел: Конструктор основного продукта.
Шаг: ${step.label}.

Текущий краткий черновик продукта:
${value(inputs, 'currentProduct', 'Пока пусто.')}

Запрос пользователя / правка:
${value(inputs, 'userRequest', 'нет')}

Задача:
${step.task}

Правила:
- Не подтягивай лишний полный контекст, используй selective project context ниже.
- Не подставляй психологию или другую нишу, если её нет в контексте.
- Пиши конкретно, как рабочий продуктовый черновик.
- Верни только результат шага, без служебных комментариев.

${contextAppendix(context)}`,
    validationRules: { minLength: step.minLength, structuredOutput: 'text' },
  })),
  {
    id: 'product.mini.generate.v1',
    version: 'v1',
    feature: 'product_mini',
    workflow: 'product.mini',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 4200,
    artifactType: 'product_mini_block',
    systemPrompt: (context) => buildMainProductPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Раздел: Конструктор мини-продукта.

Текущий краткий черновик мини-продукта:
${value(inputs, 'currentProduct', 'Пока пусто.')}

Запрос пользователя / задача:
${value(inputs, 'userRequest', value(inputs, 'task', 'Создай или доработай фрагмент мини-продукта.'))}

Правила:
- Мини-продукт длится 7 дней и состоит из 3 занятий, если пользователь явно не указал другое.
- Не пересобирай весь мини-продукт, если запрос точечный.
- Используй selective project context ниже.
- Верни только готовый результат без служебных комментариев.

${contextAppendix(context)}
`,
    validationRules: { minLength: 250, structuredOutput: 'text' },
  },
  ...MINI_PRODUCT_STEPS.map<PromptConfig>((step) => ({
    id: `product.mini.${step.step}.v1`,
    version: 'v1',
    feature: 'product_mini',
    workflow: 'product.mini',
    step: step.step,
    model: 'gpt-5.5',
    temperature: 0.62,
    maxTokens: step.maxTokens,
    artifactType: `product_mini_${step.step}`,
    systemPrompt: (context) => buildMainProductPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Раздел: Конструктор мини-продукта.
Шаг: ${step.label}.

Текущий краткий черновик мини-продукта:
${value(inputs, 'currentProduct', 'Пока пусто.')}

Запрос пользователя / правка:
${value(inputs, 'userRequest', 'нет')}

Задача:
${step.task}

Правила:
- Мини-продукт длится 7 дней и состоит из 3 занятий, если пользователь явно не указал другое.
- Не обещай полного решения большой системной проблемы за 7 дней.
- Используй selective project context ниже, не расползайся в generic.
- Верни только результат шага, без служебных комментариев.

${contextAppendix(context)}`,
    validationRules: { minLength: step.minLength, structuredOutput: 'text' },
  })),
  {
    id: 'leadmagnet.generate.v1',
    version: 'v1',
    feature: 'lead_magnet',
    workflow: 'leadmagnet',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 4600,
    artifactType: 'lead_magnet_block',
    systemPrompt: (context) => buildLeadMagnetPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Раздел: Конструктор лид-магнита.
Формат: ${value(inputs, 'format', 'лид-магнит')}

Текущий краткий черновик:
${value(inputs, 'currentProduct', 'Пока пусто.')}

Запрос пользователя / задача:
${value(inputs, 'userRequest', value(inputs, 'task', 'Создай или доработай фрагмент лид-магнита.'))}

Правила:
- Не пересобирай весь лид-магнит, если запрос точечный.
- Используй selective project context ниже.
- Верни только готовый результат без служебных комментариев.

${contextAppendix(context)}
`,
    validationRules: { minLength: 250, structuredOutput: 'text' },
  },
  ...LEAD_MAGNET_STEPS.map<PromptConfig>((step) => ({
    id: `leadmagnet.${step.step}.v1`,
    version: 'v1',
    feature: 'lead_magnet',
    workflow: 'leadmagnet',
    step: step.step,
    model: 'gpt-5.5',
    temperature: 0.64,
    maxTokens: step.maxTokens,
    artifactType: `leadmagnet_${step.step}`,
    systemPrompt: (context) => buildLeadMagnetPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Раздел: Конструктор лид-магнита.
Формат: ${value(inputs, 'format', 'лид-магнит')}
Шаг: ${value(inputs, 'stepLabel', step.step)}

Текущий краткий черновик лид-магнита:
${value(inputs, 'currentLeadMagnet', 'Пока пусто.')}

Запрос пользователя / правка:
${value(inputs, 'userRequest', 'нет')}

Задача шага:
${value(inputs, 'stepTask', 'Сгенерируй качественный блок лид-магнита для текущего шага.')}

Правила:
- Работай только над указанным шагом, не переписывай весь материал без необходимости.
- Если это шаг edit и запрос точечный (название, заголовок, CTA, формат, отдельный блок) — ответь коротко: что зафиксировано и какой фрагмент обновлён. Полный лид-магнит возвращай только по явной просьбе пересобрать весь материал.
- Используй selective project context ниже.
- Верни только готовый блок в markdown, без служебных комментариев.

${contextAppendix(context)}`,
    validationRules: { minLength: step.minLength, structuredOutput: 'text' },
  })),
  {
    id: 'positioning.analysis.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.analysis',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.55,
    maxTokens: 2200,
    artifactType: 'positioning_analysis',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Ты — senior стратег по позиционированию для экспертного бизнеса.

Сделай стратегический анализ на основе брифа “О себе” и контекста проекта.

Проанализируй:
- кто пользователь как эксперт;
- где самая сильная ценность;
- где самая сильная экспертность;
- где самое сильное отличие;
- где премиальный потенциал;
- какие задачи клиента сильнее всего подходят;
- повторяющиеся темы;
- сильные кейсы / доказательства;
- слабые места текущей упаковки.

Верни строго в формате:
## Кто эксперт
## Сильные стороны
## Где самая высокая ценность
## Где есть премиальный потенциал
## Лучшие JTBD-векторы
## Дифференциация
## Что нужно уточнить

Текущая гипотеза пользователя: ${value(inputs, 'currentHypothesis', 'нет')}

${contextAppendix(context)}

Не делай анкету. Не проси заново заполнить данные. Покажи, что ИИ уже изучил бизнес.`,
    validationRules: { requiredIncludes: ['## Кто эксперт', '## Сильные стороны'], minLength: 700, minHeadings: 5, structuredOutput: 'text' },
  },
  {
    id: 'positioning.models.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.models',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.55,
    maxTokens: 2600,
    artifactType: 'positioning_models',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ context }) => `Ты — senior стратег по позиционированию.

Объясни пользователю, какие модели позиционирования подходят именно этому проекту.

Обязательно покрой модели:
1. Позиционирование по нише
2. Позиционирование по задаче / результату клиента
3. Позиционирование по проблеме
4. Позиционирование по механизму / методу
5. Позиционирование по аудитории
6. Позиционирование по экспертной роли / авторитету
7. Позиционирование по трансформации

Для каждой модели дай:
- короткое название на русском;
- пример формулировки под проект;
- когда работает лучше;
- плюсы;
- минусы;
- где выше чек;
- где выше конкуренция;
- где проще продавать.

${contextAppendix(context)}

Верни структурированный стратегический обзор без служебных комментариев.`,
    validationRules: { minLength: 1000, minListItems: 7, structuredOutput: 'text' },
  },
  {
    id: 'positioning.variants.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.variants',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 2800,
    artifactType: 'positioning_variants',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Ты — senior стратег по позиционированию.

Сгенерируй 5 сильных вариантов стратегического позиционирования на основе брифа «О себе» и текущего контекста проекта.

Для каждого варианта верни:
### [Название варианта]
Тип: массовый / премиальный / по задаче клиента / по механизму / по трансформации / по аудитории / по экспертной роли
Формулировка: ...
Для кого: ...
Проблема: ...
Результат: ...
Механизм: ...
Дифференциация: ...
Почему может сработать: ...
Риск: ...
Рекомендуемый чек: низкий / средний / высокий / премиальный

Текущая гипотеза пользователя, если есть:
${value(inputs, 'currentHypothesis', 'нет')}

${contextAppendix(context)}

Варианты должны быть разными, не перефразировками одного и того же.
Не задавай вопросов пользователю. Не проси назвать 3-5 направлений, клиентов или ниш. Если каких-то данных мало, сделай аккуратные гипотезы на основе раздела «О себе».`,
    validationRules: {
      requiredIncludes: ['###', 'Формулировка:', 'Для кого:', 'Проблема:', 'Результат:', 'Механизм:'],
      forbiddenIncludes: ['ШАГ 1', 'ШАГ 2', 'ШАГ 3', 'Назовите 3–5', 'Назовите 3-5'],
      minLength: 1000,
      minHeadings: 4,
      structuredOutput: 'text',
    },
  },
  {
    id: 'positioning.gap-analysis.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.gap-analysis',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.55,
    maxTokens: 2400,
    artifactType: 'positioning_gap_analysis',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Ты — аналитик рынка и позиционирования.

Сделай анализ рынка и свободных стратегических углов для вариантов позиционирования.

Покажи:
## Перегретая зона
Какие фразы и углы будут слишком общими / перегретыми.

## Зона отличия
Где есть шанс выделиться.

## Премиальные углы
Какие углы могут вести к более высокому чеку.

## Слабые формулировки
Какие формулировки лучше не использовать.

## Рекомендуемое направление
Какой стратегический вектор выбрать и почему.

Варианты для анализа:
${value(inputs, 'variants', 'нет')}

${contextAppendix(context)}

Пиши как стратег, без воды и без поверхностного “увеличу продажи”.`,
    validationRules: { requiredIncludes: ['## Перегретая зона', '## Рекомендуемое направление'], minLength: 800, minHeadings: 4, structuredOutput: 'text' },
  },
  {
    id: 'positioning.final.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.final',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.5,
    maxTokens: 1800,
    artifactType: 'positioning_final',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Ты — senior стратег по позиционированию и редактор упаковки экспертного бизнеса.

Собери финальное позиционирование на основе:
1. Брифа проекта из раздела «О себе»
2. Выбранного варианта позиционирования
3. Текущего черновика, если он есть

Выбранный вариант:
${value(inputs, 'selectedVariant', 'нет')}

Текущий черновик:
${value(inputs, 'currentDraft', 'нет')}

Верни строго в формате:
Кто вы: ...
Для кого: ...
Проблема: ...
Результат: ...
Механизм: ...
Отличие: ...
Почему доверять: ...

Правила:
- Не задавай дополнительных вопросов.
- Не проси заполнить 3-5 направлений или ниш.
- Не пиши стратегический анализ и анализ рынка.
- Формулировки должны быть конкретными, короткими и пригодными для дальнейшей ЦА, УТП, продуктов и контента.
- Используй факты из брифа «О себе»: роль, опыт, продукты, цены, кейсы, регалии и ограничения.

${contextAppendix(context)}

Верни только финальную сборку без комментариев.`,
    validationRules: {
      requiredIncludes: ['Кто вы:', 'Для кого:', 'Проблема:', 'Результат:', 'Механизм:'],
      forbiddenIncludes: ['ШАГ 1', 'ШАГ 2', 'Назовите 3–5', 'Назовите 3-5'],
      minLength: 300,
      structuredOutput: 'text',
    },
  },
  {
    id: 'positioning.score.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.score',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.45,
    maxTokens: 2200,
    artifactType: 'positioning_score',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Ты — стратегический оценщик качества позиционирования.

Оцени выбранное позиционирование.

Позиционирование:
${value(inputs, 'finalPositioning', 'нет')}

Верни строго:
Ясность: X/10
Отличие от конкурентов: X/10
Доверие: X/10
Премиальный потенциал: X/10
Конкретика: X/10
Насыщенность рынка: низкая / средняя / высокая

## Что сильное
## Что ослабляет
## Как усилить одной правкой

${contextAppendix(context)}`,
    validationRules: { requiredIncludes: ['Ясность:', 'Отличие от конкурентов:', 'Насыщенность рынка:'], minLength: 300, structuredOutput: 'text' },
  },
  {
    id: 'positioning.assets.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'positioning.assets',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.58,
    maxTokens: 3600,
    artifactType: 'positioning_assets',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Ты — бренд-стратег и копирайтер по позиционированию.

На основе финального позиционирования сгенерируй материалы позиционирования.

Финальное позиционирование:
${value(inputs, 'finalPositioning', 'нет')}

Верни:
## Короткое позиционирование
## Длинное позиционирование
## Описание для соцсетей
## Заголовок
## Заявление экспертности
## Короткая самопрезентация
## Позиционирование для сайта
## CTA
## Описание эксперта

Тексты должны быть конкретными, без шаблонного нейросетевого языка.

${contextAppendix(context)}

Верни только готовые материалы.`,
    validationRules: { requiredIncludes: ['## Короткое позиционирование', '## CTA'], minLength: 700, minHeadings: 5, structuredOutput: 'text' },
  },
  {
    id: 'strategy.about.summary.v1',
    version: 'v1',
    feature: 'about_ai_summary',
    workflow: 'strategy.about',
    step: 'summary',
    model: 'gpt-5.5',
    temperature: 0.2,
    maxTokens: 900,
    artifactType: 'about_summary',
    systemPrompt: () => [
      'Ты помогаешь платформе Luma IQ подготовить компактное резюме проекта для дальнейших AI-разделов.',
      'Задача: структурировать только факты, которые дал пользователь.',
      'Строго запрещено выдумывать кейсы, цифры, опыт, сертификаты, клиентов, результаты, должности, аудитории и продукты.',
      'Если фактов мало, аккуратно обобщи имеющееся и не добавляй новых утверждений.',
      'Верни только готовое резюме на русском языке без markdown-заголовков, без списков проверки и без комментариев.',
      'Объем: 800-1500 знаков. Резюме должно покрыть: кто эксперт; кому помогает; с какой проблемой; какие продукты продает; сильные стороны; факты доверия.',
    ].join('\n'),
    userPromptBuilder: ({ inputs, context }) => `Исходные поля раздела "О себе":

${aboutSummarySource(inputs)}

${contextAppendix(context)}

Верни только компактное резюме для AI-контекста.`,
    validationRules: { minLength: 250, maxLength: 1700, structuredOutput: 'text' },
  },
  {
    id: 'strategy.audience.generate.v1',
    version: 'v1',
    feature: 'audience',
    workflow: 'strategy.audience',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 5200,
    artifactType: 'audience_block',
    systemPrompt: (context) => buildAudiencePrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `${buildAudienceStepPrompt(inputs)}

${contextAppendix(context)}

Ответь только по задаче пользователя. Без служебных комментариев.`,
    validationRules: { minLength: 250, structuredOutput: 'text' },
  },
  {
    id: 'strategy.utp.generate.v1',
    version: 'v1',
    feature: 'utp',
    workflow: 'strategy.utp',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 2600,
    artifactType: 'utp',
    systemPrompt: (context) => buildUTPPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'mode') === 'improve' ? 'Улучши текущее УТП проекта.' : 'Создай УТП (уникальное торговое предложение) для проекта.'}

Текущее УТП:
${value(inputs, 'currentUtp', 'Пока нет.')}

Дополнительные пожелания пользователя:
${value(inputs, 'inputText', 'не указаны')}

Требования:
- Работай строго по selective project context.
- Не меняй нишу и не подставляй психологию, если ее нет в контексте.
- Структура смысла: кому помогаем + какую проблему решаем + какой результат получает клиент + за счет чего.
- Длина: 2-3 предложения.

${contextAppendix(context)}

Ответь только готовым текстом без пояснений.`,
    validationRules: { minLength: 80, structuredOutput: 'text' },
  },
  {
    id: 'strategy.social.generate.v1',
    version: 'v1',
    feature: 'social',
    workflow: 'strategy.social',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 3200,
    artifactType: 'social_packaging',
    systemPrompt: (context) => buildSocialPrompt(context.base),
    userPromptBuilder: ({ inputs, context }) => `Создай описание для площадки: ${value(inputs, 'platform', 'соцсеть')}.

Требования по площадкам:
- Instagram: bio до 150 символов, ниша + аудитория + понятный результат + призыв к действию, уместные эмодзи.
- Telegram: 2-3 предложения, профессиональный тон, что получит подписчик, понятный призыв.
- ВКонтакте: 2-3 предложения, ниша/подход + аудитория + призыв к действию.

Общие правила:
- Работай строго по selective project context.
- Не подставляй психологию, если ее нет в контексте.
- Не добавляй пояснения, варианты или служебные комментарии.

${contextAppendix(context)}

Ответь только готовым текстом без пояснений.`,
    validationRules: { minLength: 150, structuredOutput: 'text' },
  },
  {
    id: 'strategy.positioning.generate.v1',
    version: 'v1',
    feature: 'positioning',
    workflow: 'strategy.positioning',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 5200,
    artifactType: 'positioning_block',
    systemPrompt: () => buildPositioningLabPrompt(),
    userPromptBuilder: ({ inputs, context }) => `Проект: ${value(inputs, 'projectName', 'Проект')}

История диалога:
${value(inputs, 'history', 'Истории пока нет.')}

Сообщение пользователя:
${value(inputs, 'message', 'нет сообщения')}

Задача:
Ответь как AI-маркетолог в разделе "О себе": задай точный уточняющий вопрос или помоги структурировать информацию об эксперте. Если информации достаточно, предложи завершить распаковку.

${contextAppendix(context)}

Ответь только по задаче пользователя. Без служебных комментариев.`,
    validationRules: { minLength: 250, structuredOutput: 'text' },
  },
  {
    id: 'threads.plan.generate.v1',
    version: 'v1',
    feature: 'threads',
    workflow: 'threads.plan',
    step: 'generate',
    model: 'gpt-5.5',
    temperature: 0.68,
    maxTokens: 9000,
    artifactType: 'threads_plan',
    systemPrompt: (context) => `Ты — senior content strategist и direct-response copywriter для Threads.

Ты создаёшь короткий экспертный контент, который строится на стратегии проекта, целевой аудитории, болях, желаниях, УТП и продуктовой линейке.

Главный принцип: это не генератор случайных постов. Контент должен быть частью маркетинговой системы Luma IQ.

Правила:
- Не выдумывай факты об эксперте, кейсах, клиентах, результатах и продукте.
- Если данных не хватает, используй только доступную информацию.
- Не обещай гарантированных результатов, если их нет в стратегии.
- Не используй реальные клиентские истории, если они не переданы явно.
- Для чувствительных ниш используй типовые ситуации вместо конкретных кейсов.
- Пиши живым русским языком, как эксперт, который каждый день работает с этой аудиторией.
- Каждый пост содержит одну главную мысль.
- Контент пригоден для публикации в Threads.
- План всегда ровно на 7 дней.
- Не добавляй хэштеги и эмодзи по умолчанию.
- Не используй канцелярит и шаблоны: "в современном мире", "ни для кого не секрет", "важно понимать", "данный пост", "экспертный эксперт".

Фреймворк THREADS-7:
1. Position Threads — позиция эксперта.
2. Pain Recognition Threads — узнавание боли.
3. Mistake Threads — ошибки аудитории.
4. Mechanism Threads — механизм проблемы.
5. Case-Like Threads — типовая ситуация без выдуманных кейсов.
6. Contrast Threads — слабый vs сильный подход.
7. Soft CTA Threads — мягкий переход к следующему шагу.

Структура поста H-C-M-I-C:
H — Hook, C — Context, M — Mechanism, I — Insight, C — CTA.

Ограничения:
- single_post: 400-900 знаков.
- mini_thread: 3-5 сообщений, каждое до 700 знаков.
- deep_thread: 6-10 сообщений, каждое до 700 знаков.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Создай 7-дневный контент-план для Threads и готовые тексты постов/веток.

Настройки:
- Цель контента: ${value(inputs, 'goal', 'Прогрев доверия')}
- Формат: ${value(inputs, 'formatMix', 'Смешанный план')}
- Интенсивность продаж: ${value(inputs, 'salesIntensity', 'Мягкие CTA')}
- Тональность: ${value(inputs, 'tone', 'Тёплая экспертная')}

Недостающие стратегические данные:
${value(inputs, 'missingSections', 'Не указаны')}

Снимок данных, который видит интерфейс:
${value(inputs, 'sourceSnapshot', 'Не передан')}

Верни строго JSON без markdown, без комментариев, без code fence.

JSON-структура:
{
  "title": "Threads-план на 7 дней",
  "strategySummary": "Краткое описание логики серии",
  "contentPlan": [
    {
      "dayNumber": 1,
      "contentType": "Pain Recognition Threads",
      "topic": "Тема дня",
      "mainIdea": "Главная мысль",
      "goal": "Прогрев доверия",
      "format": "single_post",
      "ctaType": "Без CTA",
      "funnelRole": "Узнавание боли"
    }
  ],
  "posts": [
    {
      "dayNumber": 1,
      "title": "Заголовок",
      "format": "single_post",
      "contentType": "Pain Recognition Threads",
      "text": "Текст готового поста",
      "threadItems": [],
      "cta": "",
      "authorComment": "Почему этот пост нужен в контентной системе",
      "status": "draft"
    }
  ]
}

Требования к JSON:
- contentPlan должен содержать ровно 7 элементов.
- posts должен содержать ровно 7 элементов.
- dayNumber от 1 до 7.
- format только: "single_post", "mini_thread" или "deep_thread".
- Если format не single_post, основной контент положи в threadItems: [{ "order": 1, "text": "..." }].
- status всегда "draft".`,
    validationRules: {
      minLength: 1200,
      maxLength: 60000,
      requiredIncludes: ['"contentPlan"', '"posts"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'threads.post.regenerate.v1',
    version: 'v1',
    feature: 'threads',
    workflow: 'threads.post',
    step: 'regenerate',
    model: 'gpt-5.5',
    temperature: 0.7,
    maxTokens: 3600,
    artifactType: 'threads_post',
    systemPrompt: (context) => `Ты — senior content strategist и редактор Threads-контента.

Переписывай один пост так, чтобы он оставался частью 7-дневной серии и не противоречил стратегии проекта.
Не выдумывай факты, кейсы, цифры и результаты. Сохраняй одну главную мысль.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Перегенерируй один пост Threads.

День: ${value(inputs, 'dayNumber')}
Действие: ${value(inputs, 'rewriteAction', 'regenerate')}
Настройки серии:
- Цель: ${value(inputs, 'goal', 'Прогрев доверия')}
- Формат: ${value(inputs, 'formatMix', 'Смешанный план')}
- Интенсивность продаж: ${value(inputs, 'salesIntensity', 'Мягкие CTA')}
- Тональность: ${value(inputs, 'tone', 'Тёплая экспертная')}

Текущий пост:
${value(inputs, 'existingPost', 'Нет')}

Снимок стратегии:
${value(inputs, 'sourceSnapshot', 'Не передан')}

Верни строго JSON одного поста без markdown и code fence:
{
  "dayNumber": 1,
  "title": "Заголовок",
  "format": "single_post",
  "contentType": "Pain Recognition Threads",
  "text": "Текст поста",
  "threadItems": [],
  "cta": "",
  "authorComment": "Почему пост нужен",
  "status": "draft"
}

format только: "single_post", "mini_thread" или "deep_thread".
Если это ветка, основной контент положи в threadItems.`,
    validationRules: {
      minLength: 250,
      maxLength: 18000,
      requiredIncludes: ['"dayNumber"', '"title"', '"format"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'tg-channel.channel-for.v1',
    version: 'v1',
    feature: 'tg_channel_post_edit',
    workflow: 'tg-channel.setup',
    step: 'channelFor',
    model: 'gpt-5.5',
    temperature: 0.55,
    maxTokens: 1200,
    artifactType: 'tg_channel_setup',
    systemPrompt: (context) => `Ты — маркетинговый стратег Luma IQ. Формулируешь короткое описание, для кого Telegram-канал эксперта.

Правила:
- Не спрашивай цель канала. Цель канала — продажи.
- Опирайся только на стратегию проекта, позиционирование, целевую аудиторию и УТП.
- Не выдумывай факты, цифры, кейсы и обещания.
- Пиши ясно, без маркетингового жаргона.
- Формат: одно предложение до 240 символов.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Сформулируй поле "Для кого канал".

Название канала: ${value(inputs, 'channelName', 'Не указано')}
Текущий вариант пользователя: ${value(inputs, 'channelFor', 'Не указано')}
Снимок данных интерфейса:
${value(inputs, 'sourceSnapshot', 'Не передан')}

Верни строго JSON без markdown:
{
  "channelFor": "Канал для..."
}`,
    validationRules: {
      minLength: 40,
      maxLength: 900,
      requiredIncludes: ['"channelFor"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'tg-channel.plan.v1',
    version: 'v1',
    feature: 'tg_channel_plan',
    workflow: 'tg-channel',
    step: 'plan',
    model: 'gpt-5.5',
    temperature: 0.65,
    maxTokens: 7000,
    artifactType: 'tg_channel_plan',
    systemPrompt: (context) => `Ты — senior content strategist и direct-response copywriter для Telegram-каналов экспертов.

Ты создаёшь стартовую evergreen-контентную воронку Telegram-канала. Главная цель канала — продажи, но контент не должен выглядеть как прямолинейная продажа.

Принципы:
- Не спрашивай цель канала и не используй ее как переменную.
- Посты должны помогать новому человеку понять: кто эксперт, кому помогает, почему ему можно доверять и какой первый шаг сделать.
- Каждый пост закрывает конкретную задачу клиента, страх, сомнение или потребность.
- Закрывай возражения через истории, типовые ситуации, практику, наблюдения, мини-разборы.
- Не добавляй пост "что будет дальше в канале".
- Не привязывай посты ко времени, запуску, неделе или дате. Все темы должны быть актуальны через 2-3 года.
- Не используй термины "JTBD", "job", "CTA" в пользовательских полях.
- Не выдумывай реальные кейсы, имена, цифры и результаты, если их нет в контексте. Для чувствительных ниш используй типовые ситуации.
- Базовый результат — текстовая идея поста, но она может быть использована как текст, аудио или видео.

Обязательные роли постов:
- Пост знакомства.
- Кому я помогаю.
- Главная боль аудитории.
- История из практики или типовая ситуация.
- Клиентский кейс или case-like разбор без выдуманных фактов.
- Ошибка, которую часто допускают.
- Страх или возражение.
- Метод / подход эксперта.
- Почему не получается решить самому.
- Личная история эксперта.
- Мягкий переход к первому шагу.
- Приглашение на лид-магнит / диагностику.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Собери план упаковки Telegram-канала на 10-15 evergreen-постов.

Настройки канала:
- Название канала: ${value(inputs, 'channelName', 'Не указано')}
- Для кого канал: ${value(inputs, 'channelFor', 'Не указано')}
- Точка конверсии: ${value(inputs, 'conversionPoint', 'Не указано')}
- Описание первого шага: ${value(inputs, 'conversionDetails', 'Не указано')}

Недостающие стратегические данные:
${value(inputs, 'missingSections', 'Не указаны')}

Снимок данных интерфейса:
${value(inputs, 'sourceSnapshot', 'Не передан')}

Верни строго JSON без markdown, без code fence:
{
  "title": "План ТГ-канала",
  "strategySummary": "Коротко: как устроена воронка и куда она ведет",
  "items": [
    {
      "id": "tg-1",
      "number": 1,
      "role": "Пост знакомства",
      "clientTask": "понять, подходит ли мне этот эксперт",
      "topic": "Тема поста",
      "callToAction": "Мягкий призыв к действию",
      "status": "idea"
    }
  ]
}

Требования:
- items: от 10 до 15 элементов.
- number: последовательность от 1.
- status всегда "idea".
- Поля должны быть на русском.
- В поле callToAction пиши не "CTA", а готовый понятный призыв.`,
    validationRules: {
      minLength: 1000,
      maxLength: 50000,
      requiredIncludes: ['"items"', '"clientTask"', '"callToAction"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'tg-channel.post.v1',
    version: 'v1',
    feature: 'tg_channel_post',
    workflow: 'tg-channel',
    step: 'post',
    model: 'gpt-5.5',
    temperature: 0.68,
    maxTokens: 3600,
    artifactType: 'tg_channel_post',
    systemPrompt: (context) => `Ты — редактор и direct-response copywriter Telegram-каналов экспертов.

Пиши один готовый текстовый Telegram-пост по выбранной строке плана.

Правила:
- Один пост — одна главная мысль.
- Пиши живо, конкретно, без канцелярита.
- Закрывай задачу клиента не лекцией, а наблюдением, типовой ситуацией, историей или практическим разбором.
- Не выдумывай реальные кейсы, имена, цифры, дипломы и результаты.
- Не используй хэштеги по умолчанию.
- Призыв к действию мягкий и связан с выбранной точкой конверсии.
- Длина: 1200-2600 знаков, если пользователь не попросил другое.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Напиши готовый Telegram-пост.

Название канала: ${value(inputs, 'channelName', 'Не указано')}
Для кого канал: ${value(inputs, 'channelFor', 'Не указано')}
Точка конверсии: ${value(inputs, 'conversionPoint', 'Не указано')}
Описание первого шага: ${value(inputs, 'conversionDetails', 'Не указано')}

Строка плана:
${value(inputs, 'planItem', 'Не передана')}

Верни строго JSON без markdown:
{
  "title": "Заголовок поста",
  "text": "Готовый текст поста",
  "callToAction": "Призыв к действию",
  "authorComment": "Коротко: какую задачу клиента закрывает пост",
  "status": "ready"
}`,
    validationRules: {
      minLength: 700,
      maxLength: 16000,
      requiredIncludes: ['"title"', '"text"', '"callToAction"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'tg-channel.post.edit.v1',
    version: 'v1',
    feature: 'tg_channel_post_edit',
    workflow: 'tg-channel',
    step: 'edit',
    model: 'gpt-5.5',
    temperature: 0.62,
    maxTokens: 3200,
    artifactType: 'tg_channel_post_edit',
    systemPrompt: (context) => `Ты — редактор Telegram-постов эксперта.

Доработай готовый пост по конкретному действию. Не пересобирай всю воронку и не создавай новый пост с нуля, если это не требуется.
Сохраняй фактологию, задачу клиента и связь с точкой конверсии.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Доработай Telegram-пост.

Действие: ${value(inputs, 'editAction', 'Сделать лучше')}
Точка конверсии: ${value(inputs, 'conversionPoint', 'Не указано')}
Описание первого шага: ${value(inputs, 'conversionDetails', 'Не указано')}

Строка плана:
${value(inputs, 'planItem', 'Не передана')}

Текущий пост:
${value(inputs, 'existingPost', 'Не передан')}

Верни строго JSON без markdown:
{
  "title": "Заголовок поста",
  "text": "Обновленный текст поста",
  "callToAction": "Призыв к действию",
  "authorComment": "Что было доработано",
  "status": "ready"
}`,
    validationRules: {
      minLength: 600,
      maxLength: 16000,
      requiredIncludes: ['"title"', '"text"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'tg-channel.post.audio.v1',
    version: 'v1',
    feature: 'tg_channel_post_audio_adapt',
    workflow: 'tg-channel',
    step: 'audio',
    model: 'gpt-5.5',
    temperature: 0.6,
    maxTokens: 3000,
    artifactType: 'tg_channel_audio_script',
    systemPrompt: (context) => `Ты — сценарист коротких аудио для Telegram-канала эксперта.

Адаптируй готовый пост под устную речь: живее, короче фразы, естественные переходы. Не меняй смысл.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Адаптируй пост под аудио.

Текущий пост:
${value(inputs, 'existingPost', 'Не передан')}

Верни строго JSON без markdown:
{
  "title": "Название аудио",
  "text": "Сценарий аудио",
  "callToAction": "Устный призыв к действию",
  "authorComment": "Как записать",
  "status": "ready"
}`,
    validationRules: {
      minLength: 500,
      maxLength: 14000,
      requiredIncludes: ['"title"', '"text"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'tg-channel.post.video.v1',
    version: 'v1',
    feature: 'tg_channel_post_video_script',
    workflow: 'tg-channel',
    step: 'video',
    model: 'gpt-5.5',
    temperature: 0.6,
    maxTokens: 3600,
    artifactType: 'tg_channel_video_script',
    systemPrompt: (context) => `Ты — сценарист коротких экспертных видео для Telegram-канала.

Переделай пост в сценарий видео: хук, основная часть, что показать/сказать, мягкий призыв к действию.
Не выдумывай факты и кейсы.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Сделай сценарий видео по посту.

Текущий пост:
${value(inputs, 'existingPost', 'Не передан')}

Верни строго JSON без markdown:
{
  "title": "Название видео",
  "text": "Сценарий видео с блоками: хук, основная мысль, пример, призыв к действию",
  "callToAction": "Призыв к действию",
  "authorComment": "Что показать в кадре или на экране",
  "status": "ready"
}`,
    validationRules: {
      minLength: 700,
      maxLength: 16000,
      requiredIncludes: ['"title"', '"text"'],
      structuredOutput: 'json',
    },
  },
  {
    id: 'castdev.analysis.v1',
    version: 'v1',
    feature: 'castdev_analysis',
    workflow: 'castdev',
    step: 'analysis',
    model: 'gpt-5.5',
    temperature: 0.25,
    maxTokens: 7000,
    artifactType: 'castdev_analysis',
    systemPrompt: (context) => `Ты — исследователь клиентских интервью и стратег упаковки Luma IQ.

Задача: разобрать transcript реальной встречи с клиентом и выделить только то, что полезно для маркетинговой упаковки, продуктовой линейки и контента.

Правила:
- Пиши на русском языке.
- Не выдумывай факты, которых нет в transcript.
- В блоках customerTasks, fearsProblemsObjections и desiresGoalsResults сохраняй дословные клиентские формулировки в поле quote.
- Если формулировка в transcript звучит не идеально, не переписывай quote. Нормализовать можно только title.
- Не смешивай задачи клиента с его страхами и желаниями.
- Не возвращай markdown, code fence или комментарии вокруг JSON.
- transcriptFormatted должен быть читабельной версией transcript с абзацами и нейтральными подзаголовками, без изменения смысла.

${contextAppendix(context)}`,
    userPromptBuilder: ({ inputs }) => `Проанализируй transcript Cast Dev.

Название записи: ${value(inputs, 'title', 'Не указано')}
Источник: ${value(inputs, 'sourceUrl', 'Не указан')}

Transcript:
${value(inputs, 'transcriptText', 'Transcript не передан')}

Верни строго валидный JSON без markdown:
{
  "transcriptFormatted": "Читабельная версия transcript: абзацы, нейтральные подзаголовки, без изменения смысла",
  "customerTasks": [
    {
      "title": "Короткая задача клиента простым языком",
      "quote": "Дословная формулировка клиента из transcript"
    }
  ],
  "fearsProblemsObjections": [
    {
      "title": "Короткое название страха, проблемы или возражения",
      "type": "fear",
      "quote": "Дословная формулировка клиента из transcript"
    }
  ],
  "desiresGoalsResults": [
    {
      "title": "Короткое название желания, цели или результата",
      "quote": "Дословная формулировка клиента из transcript"
    }
  ],
  "summaryForContext": "Короткий вывод для дальнейшей упаковки, продуктов и контента"
}

Требования:
- type может быть только "fear", "problem" или "objection".
- В каждом массиве верни столько пунктов, сколько реально найдено в transcript.
- Если в transcript нет данных для блока, верни пустой массив.
- Не добавляй поля вне этой структуры.`,
    validationRules: {
      minLength: 500,
      maxLength: 50000,
      requiredIncludes: ['"transcriptFormatted"', '"customerTasks"', '"fearsProblemsObjections"', '"desiresGoalsResults"', '"summaryForContext"'],
      structuredOutput: 'json',
    },
  },
];
