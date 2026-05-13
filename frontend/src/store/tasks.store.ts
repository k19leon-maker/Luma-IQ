import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TaskColumn   = 'backlog' | 'week' | 'today' | 'done';
export type TaskCategory = 'strategy' | 'products' | 'content' | 'planning';

export interface Task {
  id:           string;
  title:        string;
  description?: string;
  category:     TaskCategory;
  link?:        string;
  column:       TaskColumn;
}

const DEFAULT_TASKS: Task[] = [
  {
    id: 'dt-1',
    title: 'Пройти стратегию по JTBD-фреймворку',
    description: 'Определите сегмент ЦА, боли и желания клиента. Это основа всей упаковки.',
    category: 'strategy',
    link: '/strategy',
    column: 'backlog',
  },
  {
    id: 'dt-2',
    title: 'Выбрать сегмент и подсегмент',
    description: 'Из предложенных вариантов выберите с кем будете работать в первую очередь.',
    category: 'strategy',
    link: '/strategy',
    column: 'backlog',
  },
  {
    id: 'dt-3',
    title: 'Создать описание основного продукта',
    description: 'Флагманская программа — самый важный продукт в линейке.',
    category: 'products',
    link: '/products/main',
    column: 'backlog',
  },
  {
    id: 'dt-4',
    title: 'Создать описание мини-продукта',
    description: 'Входной продукт по доступной цене. Снижает барьер для первой покупки.',
    category: 'products',
    link: '/products/mini',
    column: 'backlog',
  },
  {
    id: 'dt-5',
    title: 'Создать бесплатный лид-магнит',
    description: 'PDF или видео которое привлекает целевую аудиторию.',
    category: 'products',
    link: '/products/lead-magnet',
    column: 'backlog',
  },
  {
    id: 'dt-6',
    title: 'Написать 3 поста для Telegram',
    description: 'Пост-боль, пост-инсайт, пост-история. По одному каждого типа.',
    category: 'content',
    link: '/posts',
    column: 'backlog',
  },
  {
    id: 'dt-7',
    title: 'Создать 3 сценария рилсов',
    description: 'Используйте разные хуки и шаблоны из раздела Рилсы.',
    category: 'content',
    link: '/reels',
    column: 'backlog',
  },
  {
    id: 'dt-8',
    title: 'Написать статью для Дзен или VC.ru',
    description: 'SEO-статья привлекает холодный трафик из поиска месяцами.',
    category: 'content',
    link: '/articles',
    column: 'backlog',
  },
  {
    id: 'dt-9',
    title: 'Создать цепочку для чат-бота',
    description: '13 сообщений которые прогревают подписчика и ведут к продаже.',
    category: 'content',
    link: '/chatbot-chains',
    column: 'backlog',
  },
  {
    id: 'dt-10',
    title: 'Заполнить контент-план на неделю',
    description: 'Добавьте готовый контент в контент-план и распределите по дням.',
    category: 'planning',
    link: '/content-plan',
    column: 'backlog',
  },
];

interface TasksState {
  tasks: Task[];
  addTask:    (task: Omit<Task, 'id'>) => void;
  removeTask: (id: string)            => void;
  moveTask:   (id: string, column: TaskColumn) => void;
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set) => ({
      tasks: DEFAULT_TASKS,

      addTask: (task) => {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ tasks: [...s.tasks, { ...task, id }] }));
      },

      removeTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      moveTask: (id, column) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, column } : t)),
        })),
    }),
    { name: 'tasks' },
  ),
);
