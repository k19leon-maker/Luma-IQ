import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { eventService } from './event.service';

export const STARTER_TASK_SOURCE = 'onboarding_b2b_v1';
export const STARTER_TASK_PLAN_VERSION = 'b2b_v1';

export const STARTER_TASKS = [
  {
    title: 'Заполнить раздел «О себе»',
    category: 'strategy',
    priority: 'high',
    status: 'today',
    dueBucket: 'today',
    description: 'Соберите короткое резюме проекта: кто вы, кому помогаете, что продаёте и в чём ваша экспертность. Эти данные будут использоваться во всех AI-разделах.',
    route: '/app/strategy/about',
    sortOrder: 10,
  },
  {
    title: 'Собрать базовое позиционирование',
    category: 'strategy',
    priority: 'high',
    status: 'today',
    dueBucket: 'today',
    description: 'Сформулируйте, для кого вы работаете, какую проблему решаете, какой результат обещаете и за счёт чего отличаетесь.',
    route: '/app/strategy/positioning',
    sortOrder: 20,
  },
  {
    title: 'Выбрать целевую аудиторию и сегмент',
    category: 'strategy',
    priority: 'high',
    status: 'week',
    dueBucket: 'week',
    description: 'Определите главный сегмент и подсегмент аудитории, под который будет собираться упаковка, продукты и контент.',
    route: '/app/strategy/audience',
    sortOrder: 30,
  },
  {
    title: 'Сформулировать УТП',
    category: 'strategy',
    priority: 'high',
    status: 'week',
    dueBucket: 'week',
    description: 'Соберите понятное обещание для клиента: кому помогаете, какую проблему решаете, какой результат даёте и почему вам можно доверять.',
    route: '/app/strategy/utp',
    sortOrder: 40,
  },
  {
    title: 'Собрать основной продукт',
    category: 'products',
    priority: 'high',
    status: 'week',
    dueBucket: 'week',
    description: 'Опишите главный продукт: формат, результат, этапы работы, цену, условия, бонусы и причины купить именно сейчас.',
    route: '/app/products/main',
    sortOrder: 50,
  },
  {
    title: 'Собрать мини-продукт',
    category: 'products',
    priority: 'medium',
    status: 'all',
    dueBucket: 'backlog',
    description: 'Создайте недорогой входной продукт, который даёт первый понятный результат и мягко переводит клиента к основной работе.',
    route: '/app/products/mini',
    sortOrder: 60,
  },
  {
    title: 'Создать лид-магнит',
    category: 'products',
    priority: 'medium',
    status: 'all',
    dueBucket: 'backlog',
    description: 'Соберите бесплатный материал, который привлекает нужную аудиторию и ведёт её к следующему шагу в воронке.',
    route: '/app/products/lead-magnet',
    sortOrder: 70,
  },
  {
    title: 'Оформить социальные сети',
    category: 'strategy',
    priority: 'medium',
    status: 'all',
    dueBucket: 'backlog',
    description: 'Подготовьте описание профиля, шапку, основные смыслы и структуру аккаунта, чтобы новые люди быстро понимали, кто вы и чем можете помочь.',
    route: '/app/strategy/social',
    sortOrder: 80,
  },
  {
    title: 'Сгенерировать первые посты',
    category: 'content',
    priority: 'medium',
    status: 'all',
    dueBucket: 'backlog',
    description: 'Создайте первые экспертные посты на основе боли аудитории, инсайтов, доверия, продукта и мягкого CTA.',
    route: '/app/posts',
    sortOrder: 90,
  },
  {
    title: 'Собрать контент-план',
    category: 'planning',
    priority: 'medium',
    status: 'all',
    dueBucket: 'backlog',
    description: 'Разложите посты, рилсы, статьи, Threads и сценарии в понятный план публикаций на ближайший период.',
    route: '/app/content-plan',
    sortOrder: 100,
  },
] as const;

const VALID_STATUSES = new Set(['all', 'today', 'week', 'done']);

async function assertProjectAccess(userId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) {
    throw Object.assign(new Error('Проект не найден'), { status: 404 });
  }
}

export const tasksService = {
  async list(userId: string, projectId: string) {
    await assertProjectAccess(userId, projectId);
    return prisma.projectTask.findMany({
      where: { userId, projectId },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async create(userId: string, data: {
    projectId: string;
    title: string;
    description?: string;
    category: string;
    priority: string;
    status: string;
    dueBucket?: string;
    route?: string;
  }) {
    await assertProjectAccess(userId, data.projectId);
    return prisma.projectTask.create({
      data: {
        projectId: data.projectId,
        userId,
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        priority: data.priority,
        status: VALID_STATUSES.has(data.status) ? data.status : 'all',
        dueBucket: data.dueBucket ?? data.status,
        route: data.route ?? null,
        sortOrder: Date.now(),
        completedAt: data.status === 'done' ? new Date() : null,
      },
    });
  },

  async update(userId: string, taskId: string, data: { status?: string; dueBucket?: string; done?: boolean }) {
    const task = await prisma.projectTask.findFirst({ where: { id: taskId, userId } });
    if (!task) {
      throw Object.assign(new Error('Задача не найдена'), { status: 404 });
    }
    const nextStatus = data.done === true
      ? 'done'
      : data.done === false && task.status === 'done'
        ? 'all'
        : data.status;
    const status = nextStatus && VALID_STATUSES.has(nextStatus) ? nextStatus : undefined;
    return prisma.projectTask.update({
      where: { id: taskId },
      data: {
        status,
        dueBucket: data.dueBucket ?? status ?? undefined,
        completedAt: status === 'done' ? new Date() : status ? null : undefined,
      },
    });
  },

  async ensureStarterTasks(userId: string, projectId: string) {
    await assertProjectAccess(userId, projectId);
    const existing = await prisma.projectTask.count({
      where: {
        projectId,
        OR: [
          { source: STARTER_TASK_SOURCE },
          { taskPlanVersion: STARTER_TASK_PLAN_VERSION },
        ],
      },
    });
    if (existing > 0) {
      return { created: false, tasks: await tasksService.list(userId, projectId) };
    }

    await prisma.projectTask.createMany({
      data: STARTER_TASKS.map((task) => ({
        id: randomUUID(),
        ...task,
        projectId,
        userId,
        source: STARTER_TASK_SOURCE,
        taskPlanVersion: STARTER_TASK_PLAN_VERSION,
      })),
      skipDuplicates: true,
    });

    void eventService.track('onboarding_tasks_created', {
      userId,
      metadata: { projectId, taskPlanVersion: STARTER_TASK_PLAN_VERSION, count: STARTER_TASKS.length },
    }).catch(() => {});

    return { created: true, tasks: await tasksService.list(userId, projectId) };
  },

  async completeByRoute(userId: string, projectId: string, route: string) {
    await assertProjectAccess(userId, projectId);
    return prisma.projectTask.updateMany({
      where: {
        userId,
        projectId,
        route,
        status: { not: 'done' },
      },
      data: {
        status: 'done',
        dueBucket: 'done',
        completedAt: new Date(),
      },
    });
  },
};
