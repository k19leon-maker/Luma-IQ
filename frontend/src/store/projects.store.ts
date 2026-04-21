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

// Stable IDs so we can reference them from project data
export const PROJ_SSORY = 'proj-ssory';
export const PROJ_MAMY  = 'proj-mamy';

const DEFAULT_PROJECTS: LocalProject[] = [
  { id: PROJ_SSORY, name: 'Ссоры в паре',       color: '#7c6cfc' },
  { id: PROJ_MAMY,  name: 'Мамы и подростки',   color: '#4caf82' },
];

function makeId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── State ─────────────────────────────────────────────────────────────────────

interface ProjectsState {
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
      projects: DEFAULT_PROJECTS,
      activeProjectId: PROJ_SSORY,

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
          const fallback = next[0] ?? DEFAULT_PROJECTS[0];
          return {
            projects: next.length > 0 ? next : DEFAULT_PROJECTS,
            activeProjectId: s.activeProjectId === id ? fallback.id : s.activeProjectId,
          };
        });
      },

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
        })),

      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),
      clearCurrentProject: () => set({ currentProject: null }),
    }),
    {
      name: 'psy-boost-projects-v2',
      // migrate: clear old single-project state
      migrate: (persisted: unknown) => {
        const s = persisted as Partial<ProjectsState>;
        // If stored projects is the old single-project default, reset to new defaults
        if (
          !s.projects ||
          (s.projects.length === 1 && s.projects[0]?.id === 'default')
        ) {
          return { ...s, projects: DEFAULT_PROJECTS, activeProjectId: PROJ_SSORY };
        }
        return s;
      },
      version: 2,
    },
  ),
);
