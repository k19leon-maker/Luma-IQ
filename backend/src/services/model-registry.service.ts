import type { AIProvider } from '@prisma/client';
import { AIModelAlias, DEFAULT_MODEL_PROFILES, isModelAlias } from '../config/ai-v2';
import { prisma } from '../lib/prisma';

export type ResolvedModelProfile = {
  alias: AIModelAlias;
  provider: AIProvider;
  actualModelId: string;
  source: 'database' | 'environment';
  versionId: string | null;
  validFrom: Date | null;
};

export const modelRegistryService = {
  fallback(alias: AIModelAlias): ResolvedModelProfile {
    const profile = DEFAULT_MODEL_PROFILES[alias];
    if (!profile.actualModelId.trim()) throw new Error(`MODEL_PROFILE_NOT_CONFIGURED: ${alias}`);
    return {
      alias,
      provider: profile.provider,
      actualModelId: profile.actualModelId,
      source: 'environment',
      versionId: null,
      validFrom: null,
    };
  },

  async resolve(aliasInput: string, at = new Date()): Promise<ResolvedModelProfile> {
    if (!isModelAlias(aliasInput)) throw new Error(`UNKNOWN_MODEL_ALIAS: ${aliasInput}`);
    const version = await prisma.aIModelProfileVersion.findFirst({
      where: {
        alias: aliasInput,
        isActive: true,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      orderBy: { validFrom: 'desc' },
    });
    if (!version) return modelRegistryService.fallback(aliasInput);
    return {
      alias: aliasInput,
      provider: version.provider,
      actualModelId: version.actualModelId,
      source: 'database',
      versionId: version.id,
      validFrom: version.validFrom,
    };
  },
};
