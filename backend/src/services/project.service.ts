import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { accessPolicyService, AccessPolicyError } from './access-policy.service';

const DEV_USER_ID = 'dev-user-001';

export const projectService = {
  /** Bootstrap: создаёт dev-пользователя в режиме разработки. */
  async ensureDevUser(): Promise<void> {
    await prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: {},
      create: {
        id: DEV_USER_ID,
        email: 'dev@lumaiq.local',
        name: 'Dev User',
        role: 'USER',
        isVerified: true,
      },
    });
  },

  async list(userId: string) {
    return prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        niche: true,
        description: true,
        status: true,
        strategySummary: true,
        strategyCompletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async create(userId: string, data: { name: string; niche?: string; description?: string }) {
    const access = await accessPolicyService.getUserAccess(userId);
    if (access.user.role !== 'ADMIN' && access.user._count.projects >= access.limits.projectLimit) {
      throw new AccessPolicyError('Превышен лимит проектов на тарифе', 402, 'LIMIT_EXCEEDED', {
        limitType: 'projectsLimit',
        current: access.user._count.projects,
        limit: access.limits.projectLimit,
        planId: access.plan,
      });
    }

    return prisma.project.create({
      data: {
        userId,
        ...data,
      },
    });
  },

  async getOwned(userId: string, projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== userId) return null;
    return project;
  },

  async update(
    userId: string,
    projectId: string,
    data: Pick<Prisma.ProjectUpdateInput, 'name' | 'niche' | 'description'>,
  ) {
    const project = await projectService.getOwned(userId, projectId);
    if (!project) return null;
    return prisma.project.update({ where: { id: projectId }, data });
  },

  async delete(userId: string, projectId: string) {
    const project = await projectService.getOwned(userId, projectId);
    if (!project) return null;
    return prisma.project.delete({ where: { id: projectId } });
  },

  async completeStrategy(
    userId: string,
    projectId: string,
    opts: { summary?: string; strategyData?: Record<string, unknown> },
  ) {
    const project = await projectService.getOwned(userId, projectId);
    if (!project) return null;

    // Завершаем активную JTBD-сессию проекта
    await prisma.jTBDSession.updateMany({
      where: { projectId, status: 'DRAFT' },
      data: {
        status: 'COMPLETED',
        summary: opts.summary ?? null,
        completedAt: new Date(),
      },
    });

    return prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'STRATEGY_COMPLETED',
        strategySummary: opts.summary ?? null,
        strategyData: opts.strategyData
          ? (opts.strategyData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        strategyCompletedAt: new Date(),
      },
    });
  },
};
