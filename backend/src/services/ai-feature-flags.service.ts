import { AIFeatureFlagKey, DEFAULT_AI_FEATURE_FLAGS, isFeatureFlagKey } from '../config/ai-v2';
import { prisma } from '../lib/prisma';

export const aiFeatureFlagsService = {
  async isEnabled(keyInput: string): Promise<boolean> {
    if (!isFeatureFlagKey(keyInput)) throw new Error(`UNKNOWN_AI_FEATURE_FLAG: ${keyInput}`);
    const featureFlagStore = prisma.aIFeatureFlag;
    if (!featureFlagStore) return DEFAULT_AI_FEATURE_FLAGS[keyInput];

    const row = await featureFlagStore.findUnique({ where: { key: keyInput } });
    return row?.enabled ?? DEFAULT_AI_FEATURE_FLAGS[keyInput];
  },

  fallback(key: AIFeatureFlagKey): boolean {
    return DEFAULT_AI_FEATURE_FLAGS[key];
  },
};
