import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AudienceAnswers {
  segments:         string;
  top3segments:     string;
  chosenSegment:    string;
  subsegments:      string;
  chosenSubsegment: string;
  wants:            string;
  requests:         string;
  top3requests:     string;
  chosenRequest:    string;
  painfulQuestions: string;
  deepDesires:      string;
  finalResult:      string;
  corePains:        string;
}

interface ProjectData {
  answers:   Partial<AudienceAnswers>;
  completed: boolean;
}

interface AudienceState {
  projects: Record<string, ProjectData>;
  save:     (projectId: string, answers: Partial<AudienceAnswers>, completed: boolean) => void;
  reset:    (projectId: string) => void;
  get:      (projectId: string) => ProjectData;
}

const DEFAULT: ProjectData = { answers: {}, completed: false };

export const useAudienceStore = create<AudienceState>()(
  persist(
    (set, get) => ({
      projects: {},
      save: (projectId, answers, completed) =>
        set((s) => ({ projects: { ...s.projects, [projectId]: { answers, completed } } })),
      reset: (projectId) =>
        set((s) => ({ projects: { ...s.projects, [projectId]: DEFAULT } })),
      get: (projectId) => get().projects[projectId] ?? DEFAULT,
    }),
    { name: 'audience-store-v1' },
  ),
);
