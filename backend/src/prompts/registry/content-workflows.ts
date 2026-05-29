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
    maxTokens: 5200,
    minLength: 800,
    task: `Выполни правку основного продукта по запросу пользователя.
Верни только обновлённую полную версию продукта в markdown.
Сохраняй структуру: # Основной продукт, варианты названия, оффер, описание, модули программы, продуктовое обещание.`,
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
  { step: 'edit', label: 'Редактирование мини-продукта', maxTokens: 5600, minLength: 1200, task: 'Выполни правку мини-продукта по запросу пользователя. Верни только обновлённую полную версию в markdown со всеми ключевыми блоками.' },
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
  { step: 'edit', maxTokens: 6200, minLength: 900 },
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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

${contextAppendix(context)}

Ответь только по задаче пользователя. Без служебных комментариев.`,
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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

${contextAppendix(context)}

Ответь только по задаче пользователя. Без служебных комментариев.`,
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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

${contextAppendix(context)}

Ответь только по задаче пользователя. Без служебных комментариев.`,
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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

Площадка: ${value(inputs, 'platform', 'соцсеть')}

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
    userPromptBuilder: ({ inputs, context }) => `${value(inputs, 'prompt')}

${contextAppendix(context)}

Ответь только по задаче пользователя. Без служебных комментариев.`,
    validationRules: { minLength: 250, structuredOutput: 'text' },
  },
];
