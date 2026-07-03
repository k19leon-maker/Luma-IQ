import { create } from 'zustand';
import { tasksApi } from '../api/tasks.api';

export type TaskColumn = 'all' | 'week' | 'today' | 'done';
export type TaskCategory = 'start' | 'strategy' | 'products' | 'content' | 'planning';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  projectId?: string;
  userId?: string;
  title: string;
  description?: string | null;
  category: TaskCategory;
  priority: TaskPriority;
  status?: TaskColumn;
  dueBucket?: string;
  route?: string | null;
  taskKey?: string | null;
  sortOrder?: number;
  source?: string | null;
  taskPlanVersion?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

  link?: string;
  dueLabel?: string;
  done?: boolean;
  column?: TaskColumn;
}

function labelForColumn(column: TaskColumn): string {
  if (column === 'today') return 'Сегодня';
  if (column === 'week') return 'На неделе';
  if (column === 'done') return 'Готово';
  return 'Позже';
}

function normalizeTask(task: Task): Task {
  const column = task.column ?? task.status ?? (task.completedAt ? 'done' : 'all');
  return {
    ...task,
    category: task.category ?? 'strategy',
    priority: task.priority ?? 'medium',
    status: column,
    column,
    route: task.route ?? task.link ?? null,
    link: task.link ?? task.route ?? undefined,
    dueLabel: task.dueLabel ?? labelForColumn(column),
    done: task.done ?? (column === 'done' || Boolean(task.completedAt)),
  };
}

interface TasksState {
  tasks: Task[];
  loading: boolean;
  loadedProjectId: string | null;
  loadTasks: (projectId: string) => Promise<void>;
  setTasks: (tasks: Task[]) => void;
  addTask: (projectId: string, task: Omit<Task, 'id'>) => Promise<void>;
  removeTask: (id: string) => void;
  moveTask: (id: string, column: TaskColumn) => Promise<void>;
  toggleTaskDone: (id: string) => Promise<void>;
  resetTasks: () => void;
}

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  loading: false,
  loadedProjectId: null,

  loadTasks: async (projectId) => {
    if (!projectId) {
      set({ tasks: [], loadedProjectId: null, loading: false });
      return;
    }
    set({ loading: true });
    try {
      const tasks = await tasksApi.list(projectId);
      set({ tasks: tasks.map(normalizeTask), loadedProjectId: projectId, loading: false });
    } catch {
      set({ tasks: [], loadedProjectId: projectId, loading: false });
    }
  },

  setTasks: (tasks) => set({ tasks: tasks.map(normalizeTask) }),

  addTask: async (projectId, task) => {
    const created = await tasksApi.create({
      projectId,
      title: task.title,
      description: task.description ?? undefined,
      category: task.category,
      priority: task.priority,
      status: task.column ?? task.status ?? 'all',
      dueBucket: task.dueBucket,
      route: task.route ?? task.link,
    });
    set((s) => ({ tasks: [...s.tasks, normalizeTask(created)] }));
  },

  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  moveTask: async (id, column) => {
    const previous = get().tasks;
    set((s) => ({
      tasks: s.tasks.map((t) => (
        t.id === id ? normalizeTask({ ...t, status: column, column, done: column === 'done' }) : t
      )),
    }));
    try {
      const updated = await tasksApi.update(id, { status: column, dueBucket: column });
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? normalizeTask(updated) : t)) }));
    } catch {
      set({ tasks: previous });
    }
  },

  toggleTaskDone: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const done = !task.done;
    await get().moveTask(id, done ? 'done' : 'all');
  },

  resetTasks: () => set({ tasks: [], loading: false, loadedProjectId: null }),
}));
