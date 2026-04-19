import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project } from '../api/projects.api';

// ── Local project (UI + localStorage) ────────────────────────────────────────

export interface LocalProject {
  id: string;
  name: string;
  color: string;
}

const PROJECT_COLORS = ['#7c6cfc', '#4caf82', '#f0a030', '#e05c5c', '#5cb8e0', '#c45cf0'];

const DEFAULT_PROJECT: LocalProject = {
  id: 'default',
  name: 'Мой проект',
  color: '#7c6cfc',
};

function makeId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── State ─────────────────────────────────────────────────────────────────────

interface ProjectsState {
  // Local project list (persisted in localStorage)
  projects: LocalProject[];
  activeProjectId: string;

  addProject: (name: string) => LocalProject;
  removeProject: (id: string) => void;
  setActiveProjectId: (id: string) => void;
  renameProject: (id: string, name: string) => void;

  // DB project reference (used by Strategy page for API calls)
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  clearCurrentProject: () => void;
}

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      // ── Local list ──────────────────────────────────────────────────────────
      projects: [DEFAULT_PROJECT],
      activeProjectId: DEFAULT_PROJECT.id,

      addProject: (name) => {
        const { projects } = get();
        const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length] ?? '#7c6cfc';
        const project: LocalProject = { id: makeId(), name, color };
        set((s) => ({ projects: [...s.projects, project], activeProjectId: project.id }));
        return project;
      },

      removeProject: (id) => {
        set((s) => {
          const next = s.projects.filter((p) => p.id !== id);
          const fallback = next[0] ?? DEFAULT_PROJECT;
          return {
            projects: next.length > 0 ? next : [DEFAULT_PROJECT],
            activeProjectId: s.activeProjectId === id ? fallback.id : s.activeProjectId,
          };
        });
      },

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
        })),

      // ── DB reference ────────────────────────────────────────────────────────
      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),
      clearCurrentProject: () => set({ currentProject: null }),
    }),
    { name: 'psy-boost-projects-v2' },
  ),
);
