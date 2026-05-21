import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, projectsApi } from '../api/projects.api';

// ── Color assignment ──────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#7c6cfc', '#4caf82', '#f0a030', '#e05c5c', '#5cb8e0', '#c45cf0'];

function colorForIndex(i: number): string {
  return PROJECT_COLORS[i % PROJECT_COLORS.length] ?? '#7c6cfc';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalProject {
  id:    string;
  name:  string;
  color: string;
}

export interface ProjectsState {
  // API-sourced list
  projects:        LocalProject[];
  activeProjectId: string;
  loading:         boolean;

  // DB project reference (used by Strategy for API calls)
  currentProject:  Project | null;

  // Actions
  loadProjects:    () => Promise<void>;
  addProject:      (name: string) => Promise<LocalProject>;
  removeProject:   (id: string)   => Promise<void>;
  renameProject:   (id: string, name: string) => Promise<void>;
  setActiveProjectId: (id: string) => void;
  setCurrentProject:  (project: Project | null) => void;
  clearCurrentProject: () => void;
  resetProjects: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProjectsStore = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects:        [],
      activeProjectId: '',
      loading:         false,
      currentProject:  null,

      loadProjects: async () => {
        set({ loading: true });
        try {
          const apiProjects = await projectsApi.list();
          const projects: LocalProject[] = apiProjects.map((p, i) => ({
            id:    p.id,
            name:  p.name,
            color: colorForIndex(i),
          }));
          set((s) => ({
            projects,
            loading: false,
            activeProjectId: projects.some((p) => p.id === s.activeProjectId)
              ? s.activeProjectId
              : (projects[0]?.id ?? ''),
          }));
        } catch {
          set({ loading: false });
        }
      },

      addProject: async (name: string) => {
        const { projects } = get();
        const color = colorForIndex(projects.length);
        let local: LocalProject;
        try {
          const project = await projectsApi.create({ name });
          local = { id: project.id, name: project.name, color };
        } catch {
          // Backend unavailable — create locally with a UUID
          local = { id: crypto.randomUUID(), name, color };
        }
        set((s) => ({
          projects: [...s.projects, local],
          activeProjectId: local.id,
        }));
        return local;
      },

      removeProject: async (id: string) => {
        try {
          await projectsApi.delete(id);
        } catch {
          // fire-and-forget — если БД недоступна, удаляем только локально
        }
        set((s) => {
          const next = s.projects.filter((p) => p.id !== id);
          const fallback = next[0];
          return {
            projects: next,
            activeProjectId: s.activeProjectId === id ? (fallback?.id ?? '') : s.activeProjectId,
          };
        });
      },

      renameProject: async (id: string, name: string) => {
        try {
          await projectsApi.update(id, { name });
        } catch {
          // обновляем локально даже при ошибке
        }
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
        }));
      },

      setActiveProjectId: (id) => set({ activeProjectId: id }),

      setCurrentProject:   (project) => set({ currentProject: project }),
      clearCurrentProject: ()        => set({ currentProject: null }),
      resetProjects: () => set({
        projects: [],
        activeProjectId: '',
        loading: false,
        currentProject: null,
      }),
    }),
    {
      name:    'lumaiq-projects-v4',
      partialize: (s) => ({
        projects:        s.projects,
        activeProjectId: s.activeProjectId,
        currentProject:  s.currentProject,
      }),
    },
  ),
);
