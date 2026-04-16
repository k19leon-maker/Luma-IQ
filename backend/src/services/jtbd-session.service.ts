import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const jtbdSessionService = {
  /** Возвращает активную (DRAFT) сессию проекта или создаёт новую. */
  async getOrCreate(projectId: string) {
    const existing = await prisma.jTBDSession.findFirst({
      where: { projectId, status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;
    return prisma.jTBDSession.create({
      data: { projectId, title: 'Стратегия JTBD' },
    });
  },

  /** Сохраняет накопленные ответы и текущий шаг. */
  async saveStep(sessionId: string, currentStep: number, answers: Record<string, unknown>) {
    return prisma.jTBDSession.update({
      where: { id: sessionId },
      data: { currentStep, answers: answers as Prisma.InputJsonValue },
    });
  },

  /** Завершает сессию. */
  async complete(sessionId: string, summary?: string, finalJob?: string) {
    return prisma.jTBDSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        summary: summary ?? null,
        finalJob: finalJob ?? null,
        completedAt: new Date(),
      },
    });
  },
};
