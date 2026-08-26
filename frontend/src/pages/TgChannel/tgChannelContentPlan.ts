function stableSourceSegment(value: string): string {
  const normalized = value.trim();
  const slug = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'item';

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${slug}-${(hash >>> 0).toString(36)}`;
}

export function buildTgContentPlanSourceId(planId: string, itemId: string): string {
  return `tg-channel:${stableSourceSegment(planId)}:${stableSourceSegment(itemId)}`;
}
