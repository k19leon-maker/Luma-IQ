import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

function selectedUsers(): Set<string> {
  return new Set(
    (env.AI_ORCHESTRATION_V2_USERS ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function rolloutBucket(userId: string): number {
  const prefix = createHash('sha256').update(userId).digest('hex').slice(0, 8);
  return Number.parseInt(prefix, 16) % 100;
}

export const aiPilotAccessService = {
  async isSelected(userId: string): Promise<boolean> {
    const selected = selectedUsers();
    if (selected.has('*') || selected.has(userId.toLowerCase())) return true;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (selected.has(user.email.toLowerCase())) return true;

    const rolloutPercent = env.AI_ORCHESTRATION_V2_ROLLOUT_PERCENT;
    return rolloutPercent > 0 && rolloutBucket(userId) < rolloutPercent;
  },
};
