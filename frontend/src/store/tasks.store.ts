import { create } from 'zustand';

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
    id: 'onboarding-1',
    title: 'Заполнить раздел “О себе”',
    description: 'Добавьте базовую информацию об эксперте: роль, нишу, опыт, продукты, компетенции, регалии и ограничения.',
    category: 'strategy',
    link: '/strategy/about',
    column: 'today',
  },
  {
    id: 'onboarding-2',
    title: 'Собрать базовое позиционирование',
    description: 'Определите, как эксперт должен звучать на рынке и какие стратегические векторы упаковки подходят проекту.',
    category: 'strategy',
    link: '/strategy/positioning',
    column: 'today',
  },
  {
    id: 'onboarding-3',
    title: 'Выбрать целевую аудиторию и сегмент',
    description: 'Пройдите анализ ЦА, выберите сегмент и подсегмент, на который будет собираться вся упаковка.',
    category: 'strategy',
    link: '/strategy/audience',
    column: 'backlog',
  },
  {
    id: 'onboarding-4',
    title: 'Сформулировать УТП',
    description: 'Соберите короткое обещание: кому помогаете, какую проблему решаете, какой результат даете и за счет чего.',
    category: 'strategy',
    link: '/strategy/utp',
    column: 'backlog',
  },
  {
    id: 'onboarding-5',
    title: 'Подготовить описание соцсетей',
    description: 'Сгенерируйте упаковку профиля для Instagram, Telegram и VK на основе стратегии и УТП.',
    category: 'strategy',
    link: '/strategy/social',
    column: 'week',
  },
  {
    id: 'onboarding-6',
    title: 'Собрать основной продукт',
    description: 'Создайте флагманский продукт: название, оффер, описание, модули программы и продуктовое обещание.',
    category: 'products',
    link: '/products/main',
    column: 'backlog',
  },
  {
    id: 'onboarding-7',
    title: 'Собрать мини-продукт',
    description: 'Разработайте входной продукт на 7 дней / 3 занятия, который дает первый управляемый результат.',
    category: 'products',
    link: '/products/mini',
    column: 'backlog',
  },
  {
    id: 'onboarding-8',
    title: 'Создать лид-магнит',
    description: 'Выберите формат и соберите материал, который ведет аудиторию к следующему шагу воронки.',
    category: 'products',
    link: '/products/lead-magnet',
    column: 'week',
  },
  {
    id: 'onboarding-9',
    title: 'Сгенерировать первые посты',
    description: 'Создайте 3-5 постов для Telegram или Instagram: боль, инсайт, история, доверие и CTA.',
    category: 'content',
    link: '/posts',
    column: 'backlog',
  },
  {
    id: 'onboarding-10',
    title: 'Собрать Reels-сценарии',
    description: 'Сгенерируйте хуки, выберите сильные варианты, добавьте фактуру и получите сценарии роликов.',
    category: 'content',
    link: '/reels',
    column: 'week',
  },
  {
    id: 'onboarding-11',
    title: 'Подготовить экспертную статью',
    description: 'Создайте тему, структуру и статью для VC, Дзена, Habr, LinkedIn или блога.',
    category: 'content',
    link: '/articles',
    column: 'backlog',
  },
  {
    id: 'onboarding-12',
    title: 'Собрать цепочку сообщений',
    description: 'Сгенерируйте Telegram-цепочку, которая продает лидмагнит, следующий шаг и возвращает аудиторию.',
    category: 'content',
    link: '/chatbot-chains',
    column: 'backlog',
  },
  {
    id: 'onboarding-13',
    title: 'Собрать контент-план',
    description: 'Перенесите готовые посты, рилсы, статьи и сценарии в календарь публикаций.',
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
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, column } : t)),
    })),
}));
