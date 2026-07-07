import { prisma } from '../lib/prisma';
import { isDemoProductText, isDemoContentText, sanitizeProjectStrategyData } from './demo-products';

function shorten(value: unknown, max = 1200): string {
  if (value === null || value === undefined) return 'нет данных';
  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!raw) return 'нет данных';
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function currentStage(project: {
  strategyCompletedAt: Date | null;
  strategyData: unknown;
  utpData: unknown;
  products: unknown[];
  generatedTexts: unknown[];
  contentPlanItems: unknown[];
}): string {
  const realProducts = project.products.filter((product) => !isDemoProductText(product));
  const realPlanItems = project.contentPlanItems.filter((item) => !isDemoContentText(item));
  const realGeneratedTexts = project.generatedTexts.filter((item) => !isDemoContentText(item));
  if (realPlanItems.length > 0) return 'контент-план';
  if (realGeneratedTexts.length > 0) return 'контент';
  if (realProducts.length > 0) return 'продуктовая линейка';
  if (project.utpData) return 'УТП';
  if (project.strategyCompletedAt) return 'стратегия завершена';
  if (project.strategyData) return 'стратегия в работе';
  return 'старт проекта';
}

export async function buildAiDialogSystemPrompt(userId: string, projectId: string): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      user: { select: { name: true, email: true, specialization: true, defaultAiModel: true } },
      products: {
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          type: true,
          title: true,
          format: true,
          shortDescription: true,
          transformation: true,
          offer: true,
          priceText: true,
        },
      },
      generatedTexts: {
        orderBy: { createdAt: 'desc' },
        take: 18,
        select: { type: true, title: true, content: true, provider: true, createdAt: true },
      },
      contentPlanItems: {
        orderBy: { date: 'asc' },
        take: 24,
        select: { type: true, title: true, content: true, platform: true, status: true, date: true },
      },
      jtbdSessions: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { currentStep: true, status: true, answers: true, summary: true, finalJob: true },
      },
    },
  });

  if (!project) return null;

  const strategyData = sanitizeProjectStrategyData(project.strategyData);
  const realProducts = project.products.filter((product) => !isDemoProductText(product));
  const realGeneratedTexts = project.generatedTexts.filter((item) => !isDemoContentText(item));
  const realPlanItems = project.contentPlanItems.filter((item) => !isDemoContentText(item));
  const stage = currentStage({
    ...project,
    strategyData,
    products: realProducts,
    generatedTexts: realGeneratedTexts,
    contentPlanItems: realPlanItems,
  });
  const products = realProducts.map((p) =>
    `- ${p.type}: ${p.title}; формат: ${p.format ?? 'не указан'}; результат: ${p.transformation ?? p.shortDescription ?? 'не указан'}; цена: ${p.priceText ?? 'не указана'}`,
  ).join('\n') || 'продукты пока не созданы';

  const content = realGeneratedTexts.map((item) =>
    `- ${item.type}: ${item.title ?? 'без названия'}; ${shorten(item.content, 260)}`,
  ).join('\n') || 'контент пока не создан';

  const plan = realPlanItems.map((item) =>
    `- ${item.date}: ${item.title} (${item.type}, ${item.status})${item.platform ? `, ${item.platform}` : ''}`,
  ).join('\n') || 'контент-план пока пуст';

  const jtbd = project.jtbdSessions[0];

  return `
Ты — AI-маркетолог LumaIQ и постоянный проектный ассистент пользователя.
Ты помогаешь эксперту принимать решения по упаковке, стратегии, продуктовой линейке, воронке, контенту и запуску.

Отвечай только на русском языке. Будь конкретным, практичным и бережным к контексту проекта.
Не проводи жесткое интервью по шагам, если пользователь сам этого не просит.
Если данных мало — задай 1–2 уточняющих вопроса. Если данных достаточно — предложи следующий лучший шаг.
Всегда учитывай текущий этап пользователя и уже созданные материалы.

ТЕКУЩИЙ КОНТЕКСТ ПРОЕКТА:
- Проект: ${project.name}
- Ниша: ${project.niche ?? 'не указана'}
- Описание: ${project.description ?? 'не указано'}
- Специализация пользователя: ${project.user.specialization ?? 'не указана'}
- Текущий этап: ${stage}
- Статус проекта: ${project.status}

СТРАТЕГИЯ / РАСПАКОВКА:
${shorten(strategyData, 2500)}

JTBD-СЕССИЯ:
${jtbd ? shorten({ currentStep: jtbd.currentStep, status: jtbd.status, answers: jtbd.answers, summary: jtbd.summary, finalJob: jtbd.finalJob }, 1800) : 'нет данных'}

УТП:
${shorten(project.utpData, 1800)}

ПРОДУКТЫ:
${products}

ПОСЛЕДНИЙ СОЗДАННЫЙ КОНТЕНТ:
${content}

КОНТЕНТ-ПЛАН:
${plan}

КАК ОТВЕЧАТЬ:
- Если пользователь спрашивает "что дальше" — дай приоритетный план на 1–3 шага.
- Если пользователь просит оценить материал — дай сильные стороны, слабые места и конкретную правку.
- Если пользователь застрял — объясни, чего не хватает для следующего этапа.
- Не придумывай факты, которых нет в контексте. Отмечай предположения явно.
`.trim();
}
