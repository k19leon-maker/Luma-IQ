import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentType = 'post' | 'reel' | 'article' | 'video_script' | 'chatbot' | 'custom';
export type ContentStatus = 'draft' | 'ready' | 'published';

export interface ContentPlanItem {
  id: string;
  date: string;        // ISO date string YYYY-MM-DD
  type: ContentType;
  title: string;
  content?: string;    // full text of the material (editable in plan)
  platform?: string;
  status: ContentStatus;
  projectId?: string;
  sourceId?: string;
}

export interface PendingAddItem {
  type: ContentType;
  title: string;
  content?: string;
  preview?: string;    // first 2 lines for modal preview
  platform?: string;
  sourceId?: string;
  projectId?: string;
}

interface ContentPlanState {
  items: ContentPlanItem[];
  modalOpen: boolean;
  pendingItem: PendingAddItem | null;
  addItem: (item: ContentPlanItem) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<ContentPlanItem>) => void;
  moveItem: (id: string, newDate: string) => void;
  openAddModal: (pending: PendingAddItem) => void;
  closeAddModal: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function makeSeedItems(): ContentPlanItem[] {
  const t = today();
  return [
    {
      id: 'seed-1',
      date: t,
      type: 'post',
      title: 'Почему ссоры в паре повторяются по кругу',
      platform: 'Telegram',
      status: 'ready',
    },
    {
      id: 'seed-2',
      date: addDays(t, 1),
      type: 'reel',
      title: 'Рилс: 3 фразы которые разрушают диалог',
      platform: 'Instagram',
      status: 'draft',
    },
    {
      id: 'seed-3',
      date: addDays(t, 2),
      type: 'article',
      title: 'Статья: JTBD — почему клиенты выбирают психолога',
      status: 'draft',
    },
    {
      id: 'seed-4',
      date: addDays(t, 3),
      type: 'video_script',
      title: 'Видео 10 мин: Что делать после ссоры',
      platform: 'YouTube',
      status: 'draft',
    },
    {
      id: 'seed-5',
      date: addDays(t, 5),
      type: 'post',
      title: 'История клиента: как наладили контакт с подростком',
      platform: 'Telegram',
      status: 'draft',
    },
    {
      id: 'seed-6',
      date: addDays(t, 6),
      type: 'chatbot',
      title: 'Цепочка бота: лид-магнит "Ссоры в паре"',
      platform: 'Telegram',
      status: 'ready',
    },
  ];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useContentPlanStore = create<ContentPlanState>()(
  persist(
    (set) => ({
      items: makeSeedItems(),
      modalOpen: false,
      pendingItem: null,

      addItem: (item) =>
        set((s) => ({ items: [...s.items, item] })),

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      moveItem: (id, newDate) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...i, date: newDate } : i)),
        })),

      openAddModal: (pending) =>
        set({ modalOpen: true, pendingItem: pending }),

      closeAddModal: () =>
        set({ modalOpen: false, pendingItem: null }),
    }),
    { name: 'content_plan' }
  )
);
