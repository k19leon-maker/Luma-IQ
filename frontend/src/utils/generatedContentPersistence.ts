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

export function readLegacyObject<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
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
