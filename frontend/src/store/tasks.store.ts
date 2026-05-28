import { create } from 'zustand';

export type TaskColumn   = 'all' | 'week' | 'today' | 'done';
export type TaskCategory = 'strategy' | 'products' | 'content' | 'planning';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id:           string;
  title:        string;
  description?: string;
  category:     TaskCategory;
  link?:        string;
  dueLabel:     string;
  priority:     TaskPriority;
  done:         boolean;
  column:       TaskColumn;
}

const DEFAULT_TASKS: Task[] = [
  {
    id: 'onboarding-1',
    title: 'Заполнить раздел “О себе”',
    description: 'Добавьте базовую информацию об эксперте: роль, нишу, опыт, продукты, компетенции, регалии и ограничения.',
    category: 'strategy',
    link: '/strategy/about',
    dueLabel: 'Сегодня',
    priority: 'high',
    done: false,
    column: 'today',
  },
  {
    id: 'onboarding-2',
    title: 'Собрать базовое позиционирование',
    description: 'Определите, как эксперт должен звучать на рынке и какие стратегические векторы упаковки подходят проекту.',
    category: 'strategy',
    link: '/strategy/positioning',
    dueLabel: 'Сегодня',
    priority: 'high',
    done: false,
    column: 'today',
  },
  {
    id: 'onboarding-3',
    title: 'Выбрать целевую аудиторию и сегмент',
    description: 'Пройдите анализ ЦА, выберите сегмент и подсегмент, на который будет собираться вся упаковка.',
    category: 'strategy',
    link: '/strategy/audience',
    dueLabel: 'Следующий шаг',
    priority: 'high',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-4',
    title: 'Сформулировать УТП',
    description: 'Соберите короткое обещание: кому помогаете, какую проблему решаете, какой результат даете и за счет чего.',
    category: 'strategy',
    link: '/strategy/utp',
    dueLabel: 'После ЦА',
    priority: 'high',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-5',
    title: 'Подготовить описание соцсетей',
    description: 'Сгенерируйте упаковку профиля для Instagram, Telegram и VK на основе стратегии и УТП.',
    category: 'strategy',
    link: '/strategy/social',
    dueLabel: 'На неделе',
    priority: 'medium',
    done: false,
    column: 'week',
  },
  {
    id: 'onboarding-6',
    title: 'Собрать основной продукт',
    description: 'Создайте флагманский продукт: название, оффер, описание, модули программы и продуктовое обещание.',
    category: 'products',
    link: '/products/main',
    dueLabel: 'После стратегии',
    priority: 'high',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-7',
    title: 'Собрать мини-продукт',
    description: 'Разработайте входной продукт на 7 дней / 3 занятия, который дает первый управляемый результат.',
    category: 'products',
    link: '/products/mini',
    dueLabel: 'После основного',
    priority: 'medium',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-8',
    title: 'Создать лид-магнит',
    description: 'Выберите формат и соберите материал, который ведет аудиторию к следующему шагу воронки.',
    category: 'products',
    link: '/products/lead-magnet',
    dueLabel: 'На неделе',
    priority: 'medium',
    done: false,
    column: 'week',
  },
  {
    id: 'onboarding-9',
    title: 'Сгенерировать первые посты',
    description: 'Создайте 3-5 постов для Telegram или Instagram: боль, инсайт, история, доверие и CTA.',
    category: 'content',
    link: '/posts',
    dueLabel: 'После продуктов',
    priority: 'medium',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-10',
    title: 'Собрать Reels-сценарии',
    description: 'Сгенерируйте хуки, выберите сильные варианты, добавьте фактуру и получите сценарии роликов.',
    category: 'content',
    link: '/reels',
    dueLabel: 'На неделе',
    priority: 'medium',
    done: false,
    column: 'week',
  },
  {
    id: 'onboarding-11',
    title: 'Подготовить экспертную статью',
    description: 'Создайте тему, структуру и статью для VC, Дзена, Habr, LinkedIn или блога.',
    category: 'content',
    link: '/articles',
    dueLabel: 'Позже',
    priority: 'low',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-12',
    title: 'Собрать цепочку сообщений',
    description: 'Сгенерируйте Telegram-цепочку, которая продает лидмагнит, следующий шаг и возвращает аудиторию.',
    category: 'content',
    link: '/chatbot-chains',
    dueLabel: 'Позже',
    priority: 'low',
    done: false,
    column: 'all',
  },
  {
    id: 'onboarding-13',
    title: 'Собрать контент-план',
    description: 'Перенесите готовые посты, рилсы, статьи и сценарии в календарь публикаций.',
    category: 'planning',
    link: '/content-plan',
    dueLabel: 'Финальный шаг',
    priority: 'medium',
    done: false,
    column: 'all',
  },
];

interface TasksState {
  tasks: Task[];
  addTask:    (task: Omit<Task, 'id'>) => void;
  removeTask: (id: string)            => void;
  moveTask:   (id: string, column: TaskColumn) => void;
  toggleTaskDone: (id: string) => void;
}

export const useTasksStore = create<TasksState>()((set) => ({
  tasks: DEFAULT_TASKS,

  addTask: (task) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ tasks: [...s.tasks, { ...task, id }] }));
  },

  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  moveTask: (id, column) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (
        t.id === id ? { ...t, column, done: column === 'done' } : t
      )),
    })),

  toggleTaskDone: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const done = !t.done;
        return { ...t, done, column: done ? 'done' : 'all' };
      }),
    })),
}));
