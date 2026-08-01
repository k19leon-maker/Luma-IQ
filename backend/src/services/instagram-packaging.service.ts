import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  emptyInstagramPackaging,
  instagramHighlightSchema,
  instagramPackagingSchema,
  INSTAGRAM_PACKAGING_VERSION,
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

type ProfileField = keyof InstagramPackaging['profileHeader'];

const PROFILE_FIELD_ALIASES: Record<ProfileField, string[]> = {
  username: ['username', 'userName', 'handle'],
  displayName: ['displayName', 'name', 'profileName'],
  category: ['category'],
  bio: ['bio', 'description', 'instagram'],
  callToAction: ['callToAction', 'cta'],
  link: ['link', 'url'],
  logicExplanation: ['logicExplanation', 'explanation'],
};

function firstText(record: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[alias];
    if (typeof value === 'string') return value.trim();
  }
  return '';
}

function safeIsoDate(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function canonicalizeHighlights(
  highlights: SaveInstagramPackagingInput['highlights'],
): SaveInstagramPackagingInput['highlights'] {
  return highlights.map((highlight, position) => ({
    ...highlight,
    position,
    stories: highlight.stories.map((story, storyPosition) => ({
      ...story,
      position: storyPosition,
    })),
  }));
}

function normalizeCurrent(value: unknown): InstagramPackaging | null {
  const raw = asRecord(value);
  const nestedProfile = asRecord(raw.profileHeader);
  const legacyProfile = asRecord(raw.profile);
  const profileSource = Object.keys(nestedProfile).length > 0
    ? nestedProfile
    : Object.keys(legacyProfile).length > 0
      ? legacyProfile
      : raw;
  const hasRecognizedShape = 'profileHeader' in raw
    || 'profile' in raw
    || Object.values(PROFILE_FIELD_ALIASES).some((aliases) => aliases.some((alias) => alias in raw));
  if (!hasRecognizedShape) return null;

  const packaging = emptyInstagramPackaging(safeIsoDate(raw.updatedAt));
  for (const [field, aliases] of Object.entries(PROFILE_FIELD_ALIASES) as Array<[ProfileField, string[]]>) {
    packaging.profileHeader[field] = firstText(profileSource, aliases);
  }
  if (Array.isArray(raw.highlights)) {
    packaging.highlights = raw.highlights.flatMap((highlight) => {
      const parsed = instagramHighlightSchema.safeParse(highlight);
      return parsed.success ? [parsed.data] : [];
    }).map((highlight, position) => ({
      ...highlight,
      position,
      stories: highlight.stories.map((story, storyPosition) => ({
        ...story,
        position: storyPosition,
      })),
    }));
  }

  const rawVersion = typeof raw.version === 'number' && Number.isInteger(raw.version)
    ? raw.version
    : 0;
  const metadata = asRecord(raw.metadata);
  const importedFrom = metadata.importedFrom === 'generatedData.social.instagram'
    ? metadata.importedFrom
    : undefined;
  const legacyInstagramText = typeof metadata.legacyInstagramText === 'string'
    ? metadata.legacyInstagramText.trim()
    : undefined;
  packaging.metadata = {
    ...(importedFrom ? { importedFrom } : {}),
    ...(legacyInstagramText ? { legacyInstagramText } : {}),
    ...(rawVersion !== INSTAGRAM_PACKAGING_VERSION ? { migratedFromVersion: rawVersion } : {}),
  };
  if (Object.keys(packaging.metadata).length === 0) delete packaging.metadata;
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
      const migrated = normalizeCurrent(current.data);
      if (migrated) {
        return { packaging: migrated, source: 'current' };
      }
      console.warn('[InstagramPackaging] Invalid current data, using legacy fallback', { userId, projectId });
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
      highlights: canonicalizeHighlights(input.highlights),
      updatedAt: new Date().toISOString(),
    });
    await replaceCurrent(userId, projectId, packaging);
    return packaging;
  },
};
