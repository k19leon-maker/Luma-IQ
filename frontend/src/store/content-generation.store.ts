import { create } from 'zustand';

export type ContentGenerationSection =
  | 'posts'
  | 'reels'
  | 'articles'
  | 'video-scripts'
  | 'chatbot-chains';

export interface ContentGenerationTask {
  projectId: string;
  section: ContentGenerationSection;
  title: string;
  detail?: string;
  startedAt: number;
}

interface ContentGenerationState {
  tasks: Record<string, ContentGenerationTask>;
  startTask: (
    projectId: string | null | undefined,
    section: ContentGenerationSection,
    title: string,
    detail?: string,
  ) => void;
  finishTask: (projectId: string | null | undefined, section: ContentGenerationSection) => void;
}

export function contentGenerationKey(
  projectId: string | null | undefined,
  section: ContentGenerationSection,
): string {
  return `${projectId ?? 'default'}:${section}`;
}

export const useContentGenerationStore = create<ContentGenerationState>((set) => ({
  tasks: {},
  startTask: (projectId, section, title, detail) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [contentGenerationKey(projectId, section)]: {
          projectId: projectId ?? 'default',
          section,
          title,
          detail,
          startedAt: Date.now(),
        },
      },
    })),
  finishTask: (projectId, section) =>
    set((state) => {
      const next = { ...state.tasks };
      delete next[contentGenerationKey(projectId, section)];
      return { tasks: next };
    }),
}));
