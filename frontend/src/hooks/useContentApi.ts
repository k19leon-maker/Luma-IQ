import { useState, useEffect, useCallback, useRef } from 'react';
import { contentApi, ContentItem, ContentType } from '../api/content.api';

interface UseContentApiOptions {
  projectId: string;
  type: ContentType;
}

interface UseContentApiResult {
  dbItems:     ContentItem[];
  loading:     boolean;
  saveItem:    (data: { title?: string; content: string; platform?: string; isMock?: boolean; metadata?: Record<string, unknown> }) => Promise<ContentItem | null>;
  updateItem:  (id: string, data: { title?: string; content?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  removeItem:  (id: string) => Promise<void>;
}

export function useContentApi({ projectId, type }: UseContentApiOptions): UseContentApiResult {
  const [dbItems, setDbItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${projectId}:${type}`;
    if (!projectId || loadedRef.current === key) return;
    loadedRef.current = key;
    setDbItems([]);
    setLoading(true);
    contentApi.list(projectId, type)
      .then(setDbItems)
      .catch(() => { /* БД недоступна — работаем без */ })
      .finally(() => setLoading(false));
  }, [projectId, type]);

  const saveItem = useCallback(async (data: {
    title?: string;
    content: string;
    platform?: string;
    isMock?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<ContentItem | null> => {
    try {
      const item = await contentApi.create({ projectId, type, ...data });
      setDbItems((prev) => [item, ...prev]);
      return item;
    } catch {
      return null;
    }
  }, [projectId, type]);

  const updateItem = useCallback(async (id: string, data: { title?: string; content?: string; metadata?: Record<string, unknown> }) => {
    try {
      const updated = await contentApi.update(id, data);
      setDbItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch {
      // fire-and-forget
    }
  }, []);

  const removeItem = useCallback(async (id: string) => {
    try {
      await contentApi.remove(id);
      setDbItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setDbItems((prev) => prev.filter((i) => i.id !== id));
    }
  }, []);

  return { dbItems, loading, saveItem, updateItem, removeItem };
}
