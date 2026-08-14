import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { BatchCreateCasesInput, CaseStudyStatus, CreateCaseStudyInput, UpdateCaseStudyInput } from '../schemas/case-study.schema';

export class CaseStudyNotFoundError extends Error {
  status = 404;

  constructor() {
    super('Кейс не найден');
  }
}

export class CaseStudyValidationError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
  }
}

function requireReadyFields(value: {
  title: string;
  beforeText: string;
  actionsText: string;
  afterText: string;
}): void {
  const missing: string[] = [];
  if (!value.title.trim()) missing.push('название');
  if (!value.beforeText.trim()) missing.push('что было');
  if (!value.actionsText.trim()) missing.push('что сделали');
  if (!value.afterText.trim()) missing.push('что стало');
  if (missing.length) {
    throw new CaseStudyValidationError(`Чтобы сделать кейс готовым, заполните: ${missing.join(', ')}`);
  }
}

async function assertOwnedProject(userId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new CaseStudyNotFoundError();
}

async function getOwnedCase(userId: string, projectId: string, caseId: string) {
  return prisma.caseStudy.findFirst({
    where: { id: caseId, projectId, userId },
  });
}

export const caseStudyService = {
  assertOwnedProject,
  async list(userId: string, projectId: string, status?: CaseStudyStatus) {
    await assertOwnedProject(userId, projectId);
    return prisma.caseStudy.findMany({
      where: { userId, projectId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async get(userId: string, projectId: string, caseId: string) {
    await assertOwnedProject(userId, projectId);
    const record = await getOwnedCase(userId, projectId, caseId);
    if (!record) throw new CaseStudyNotFoundError();
    return record;
  },

  async create(userId: string, projectId: string, input: CreateCaseStudyInput) {
    await assertOwnedProject(userId, projectId);
    if (input.status === 'ready') requireReadyFields(input);
    return prisma.caseStudy.create({
      data: {
        userId,
        projectId,
        ...input,
        sourceType: 'manual',
      },
    });
  },

  async update(userId: string, projectId: string, caseId: string, input: UpdateCaseStudyInput) {
    await assertOwnedProject(userId, projectId);
    const existing = await getOwnedCase(userId, projectId, caseId);
    if (!existing) throw new CaseStudyNotFoundError();

    if (input.status === 'ready') {
      requireReadyFields({
        title: input.title ?? existing.title,
        beforeText: input.beforeText ?? existing.beforeText,
        actionsText: input.actionsText ?? existing.actionsText,
        afterText: input.afterText ?? existing.afterText,
      });
    }

    return prisma.caseStudy.update({
      where: { id: existing.id },
      data: input,
    });
  },

  async remove(userId: string, projectId: string, caseId: string) {
    await assertOwnedProject(userId, projectId);
    const existing = await getOwnedCase(userId, projectId, caseId);
    if (!existing) throw new CaseStudyNotFoundError();
    await prisma.caseStudy.delete({ where: { id: existing.id } });
  },

  async createBatch(userId: string, projectId: string, input: BatchCreateCasesInput) {
    await assertOwnedProject(userId, projectId);
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.caseStudy.findMany({
          where: {
            userId,
            projectId,
            importBatchKey: input.idempotencyKey,
          },
          orderBy: { importPosition: 'asc' },
        });
        if (existing.length > 0) return { cases: existing, replayed: true };

        const created = [];
        for (const [position, candidate] of input.candidates.entries()) {
          created.push(await tx.caseStudy.create({
            data: {
              userId,
              projectId,
              ...candidate,
              status: 'draft',
              sourceType: input.sourceType,
              // Imported documents can be large. They are kept in a short-lived,
              // project-scoped import record instead of being copied into every case.
              sourceText: input.sourceType === 'voice' ? input.sourceText : null,
              importBatchKey: input.idempotencyKey,
              importPosition: position,
            },
          }));
        }
        return { cases: created, replayed: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.caseStudy.findMany({
          where: { userId, projectId, importBatchKey: input.idempotencyKey },
          orderBy: { importPosition: 'asc' },
        });
        if (existing.length > 0) return { cases: existing, replayed: true };
      }
      throw error;
    }
  },
};
