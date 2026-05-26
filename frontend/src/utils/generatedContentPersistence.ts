import type { ContentItem } from '../api/content.api';

export function readLegacyItems<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function legacyProjectIds(projectId: string): string[] {
  try {
    const raw = localStorage.getItem('lumaiq_project_id_migration');
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, string>;
    return Object.entries(map)
      .filter(([, newProjectId]) => newProjectId === projectId)
      .map(([oldProjectId]) => oldProjectId);
  } catch {
    return [];
  }
}

export function readLegacyItemsWithProjectFallback<T>(key: string, projectId: string): T[] {
  const byCurrentId = readLegacyItems<T>(key);
  const byOldIds = legacyProjectIds(projectId).flatMap((oldProjectId) => (
    readLegacyItems<T>(key.replace(projectId, oldProjectId))
  ));
  const seen = new Set<string>();
  return [...byCurrentId, ...byOldIds].filter((item) => {
    const id = typeof item === 'object' && item !== null && 'id' in item ? String((item as { id?: unknown }).id) : JSON.stringify(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function readLegacyObject<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function readLegacyObjectWithProjectFallback<T>(key: string, projectId: string): T | null {
  const current = readLegacyObject<T>(key);
  if (current) return current;
  for (const oldProjectId of legacyProjectIds(projectId)) {
    const legacy = readLegacyObject<T>(key.replace(projectId, oldProjectId));
    if (legacy) return legacy;
  }
  return null;
}

export function migrationKey(projectId: string, area: string): string {
  return `lumaiq_migrated_${area}_${projectId}`;
}

export function isMigrated(projectId: string, area: string): boolean {
  return localStorage.getItem(migrationKey(projectId, area)) === 'true';
}

export function markMigrated(projectId: string, area: string): void {
  localStorage.setItem(migrationKey(projectId, area), 'true');
}

export function metadataString(item: ContentItem, key: string, fallback = ''): string {
  const value = item.metadata?.[key];
  return typeof value === 'string' ? value : fallback;
}

export function metadataNumber(item: ContentItem, key: string, fallback = 0): number {
  const value = item.metadata?.[key];
  return typeof value === 'number' ? value : fallback;
}

export function metadataBoolean(item: ContentItem, key: string, fallback = false): boolean {
  const value = item.metadata?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function createdDateRu(item: ContentItem): string {
  return new Date(item.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
