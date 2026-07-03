import { apiClient } from './client';
import type { Task, TaskColumn, TaskCategory, TaskPriority } from '../store/tasks.store';

export const tasksApi = {
  list: (projectId: string) =>
    apiClient.get<{ tasks: Task[] }>('/tasks', { params: { projectId } }).then((r) => r.data.tasks),

  create: (data: {
    projectId: string;
    title: string;
    description?: string;
    category: TaskCategory;
    priority: TaskPriority;
    status: TaskColumn;
    dueBucket?: string;
    route?: string;
  }) =>
    apiClient.post<{ task: Task }>('/tasks', data).then((r) => r.data.task),

  update: (id: string, data: { status?: TaskColumn; dueBucket?: string; done?: boolean }) =>
    apiClient.patch<{ task: Task }>(`/tasks/${id}`, data).then((r) => r.data.task),
};
