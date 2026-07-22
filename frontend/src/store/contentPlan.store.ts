import { create } from 'zustand';
import { contentPlanApi } from '../api/content-plan.api';
import { isDemoContentText } from '../utils/demoDataCleanup';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentType = 'post' | 'reel' | 'article' | 'video_script' | 'chatbot' | 'custom';
export type ContentStatus = 'draft' | 'ready' | 'published';

export interface ContentPlanItem {
  id:        string;
  dbId?:     string;   // ID записи в БД
  date:      string;   // YYYY-MM-DD
  type:      ContentType;
  title:     string;
  content?:  string;
  platform?: string;
  status:    ContentStatus;
  projectId?: string;
  sourceId?:  string;
}

export interface PendingAddItem {
  type:       ContentType;
  title:      string;
  content?:   string;
  preview?:   string;
  platform?:  string;
  sourceId?:  string;
  projectId?: string;
  onAdded?:   (date: string) => void;
}

interface ContentPlanState {
  items:        ContentPlanItem[];
  modalOpen:    boolean;
  pendingItem:  PendingAddItem | null;

  loadItems:  (projectId: string) => Promise<void>;
  addItem:    (item: ContentPlanItem) => void;
  addItemApi: (item: ContentPlanItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<ContentPlanItem>) => Promise<void>;
  moveItem:   (id: string, newDate: string) => Promise<void>;
  openAddModal:  (pending: PendingAddItem) => void;
  closeAddModal: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useContentPlanStore = create<ContentPlanState>()((set, get) => ({
  items:       [],
  modalOpen:   false,
  pendingItem: null,

  loadItems: async (projectId: string) => {
    try {
      const apiItems = await contentPlanApi.list(projectId);
      const items: ContentPlanItem[] = apiItems
        .filter((i) => !isDemoContentText(i))
        .map((i) => ({
          id:        i.id,
          dbId:      i.id,
          date:      i.date,
          type:      i.type as ContentType,
          title:     i.title,
          content:   i.content ?? undefined,
          platform:  i.platform ?? undefined,
          status:    i.status as ContentStatus,
          projectId: i.projectId,
          sourceId:  i.sourceId ?? undefined,
        }));
      set({ items });
    } catch {
      // БД недоступна — items остаются как есть
    }
  },

  addItem: (item) => set((s) => ({ items: [...s.items, item] })),

  addItemApi: async (item) => {
    // Оптимистичное добавление
    set((s) => ({ items: [...s.items, item] }));
    if (!item.projectId) return;
    try {
      const dbItem = await contentPlanApi.create({
        projectId: item.projectId,
        type:      item.type,
        title:     item.title,
        content:   item.content,
        platform:  item.platform,
        status:    item.status,
        date:      item.date,
        sourceId:  item.sourceId,
      });
      // Обновляем локальный item с dbId
      set((s) => ({
        items: s.items.map((i) =>
          i.id === item.id ? { ...i, id: dbItem.id, dbId: dbItem.id } : i,
        ),
      }));
    } catch {
      // fire-and-forget: остаётся только локально
    }
  },

  removeItem: async (id) => {
    const item = get().items.find((i) => i.id === id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    const dbId = item?.dbId ?? id;
    try { await contentPlanApi.remove(dbId); } catch { /* fire-and-forget */ }
  },

  updateItem: async (id, patch) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
    const item = get().items.find((i) => i.id === id);
    const dbId = item?.dbId ?? id;
    try {
      await contentPlanApi.update(dbId, {
        title:    patch.title,
        content:  patch.content,
        status:   patch.status,
        date:     patch.date,
        platform: patch.platform,
      });
    } catch { /* fire-and-forget */ }
  },

  moveItem: async (id, newDate) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, date: newDate } : i)),
    }));
    const item = get().items.find((i) => i.id === id);
    const dbId = item?.dbId ?? id;
    try { await contentPlanApi.update(dbId, { date: newDate }); } catch { /* fire-and-forget */ }
  },

  openAddModal:  (pending) => set({ modalOpen: true,  pendingItem: pending }),
  closeAddModal: ()        => set({ modalOpen: false, pendingItem: null }),
}));
