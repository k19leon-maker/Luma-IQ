import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  emptyInstagramPackaging,
  instagramPackagingSchema,
  type InstagramPackaging,
  type SaveInstagramPackagingInput,
} from '../schemas/instagram-packaging.schema';

const CURRENT_KEY = 'instagram.packaging.current';
const CURRENT_KIND = 'instagram_packaging';
const CURRENT_DOMAIN = 'packaging';
const CURRENT_SOURCE = 'project_strategy';
const MAX_TRANSACTION_ATTEMPTS = 3;

export type InstagramPackagingSource = 'current' | 'legacy' | 'empty';

export interface InstagramPackagingResult {
  packaging: InstagramPackaging;
  source: InstagramPackagingSource;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function legacyInstagramText(strategyData: unknown): string {
  const strategy = asRecord(strategyData);
  const generated = asRecord(strategy.generatedData);
  const social = asRecord(generated.social);
  return typeof social.instagram === 'string' ? social.instagram.trim() : '';
}

function fromLegacy(text: string): InstagramPackaging {
  const packaging = emptyInstagramPackaging();
  packaging.profileHeader.bio = text;
  packaging.metadata = {
    importedFrom: 'generatedData.social.instagram',
    legacyInstagramText: text,
  };
  return packaging;
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function replaceCurrent(
  userId: string,
  projectId: string,
  packaging: InstagramPackaging,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.projectStructuredOutput.deleteMany({
          where: {
            userId,
            projectId,
            source: CURRENT_SOURCE,
            key: CURRENT_KEY,
          },
        });
        await tx.projectStructuredOutput.create({
          data: {
            userId,
            projectId,
            domain: CURRENT_DOMAIN,
            kind: CURRENT_KIND,
            key: CURRENT_KEY,
            title: 'Упаковка Instagram',
            content: [
              packaging.profileHeader.displayName,
              packaging.profileHeader.bio,
              packaging.profileHeader.callToAction,
            ].filter(Boolean).join('\n\n'),
            data: packaging as unknown as Prisma.InputJsonValue,
            source: CURRENT_SOURCE,
            version: packaging.version,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_ATTEMPTS) throw error;
    }
  }
}

export const instagramPackagingService = {
  async get(userId: string, projectId: string): Promise<InstagramPackagingResult | null> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true, strategyData: true },
    });
    if (!project) return null;

    const current = await prisma.projectStructuredOutput.findFirst({
      where: {
        userId,
        projectId,
        source: CURRENT_SOURCE,
        key: CURRENT_KEY,
      },
      orderBy: { updatedAt: 'desc' },
      select: { data: true },
    });
    const parsed = instagramPackagingSchema.safeParse(current?.data);
    if (parsed.success) {
      return { packaging: parsed.data, source: 'current' };
    }
    if (current) {
      console.warn('[InstagramPackaging] Invalid current data, using safe fallback', { userId, projectId });
    }

    const legacy = legacyInstagramText(project.strategyData);
    if (legacy) {
      return { packaging: fromLegacy(legacy), source: 'legacy' };
    }
    return { packaging: emptyInstagramPackaging(), source: 'empty' };
  },

  async save(
    userId: string,
    projectId: string,
    input: SaveInstagramPackagingInput,
  ): Promise<InstagramPackaging | null> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) return null;

    const packaging = instagramPackagingSchema.parse({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    await replaceCurrent(userId, projectId, packaging);
    return packaging;
  },
};

