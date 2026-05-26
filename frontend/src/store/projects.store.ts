import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, projectsApi } from '../api/projects.api';

// ── Color assignment ──────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#7c6cfc', '#4caf82', '#f0a030', '#e05c5c', '#5cb8e0', '#c45cf0'];

function colorForIndex(i: number): string {
  return PROJECT_COLORS[i % PROJECT_COLORS.length] ?? '#7c6cfc';
}

function readLegacyLocalProjects(): LocalProject[] {
  try {
    const raw = localStorage.getItem('lumaiq-projects-v4');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { projects?: LocalProject[] } };
    return Array.isArray(parsed.state?.projects) ? parsed.state.projects : [];
  } catch {
    return [];
  }
}

function readProjectIdMigration(): Record<string, string> {
  try {
    const raw = localStorage.getItem('lumaiq_project_id_migration');
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveProjectIdMigration(map: Record<string, string>): void {
  localStorage.setItem('lumaiq_project_id_migration', JSON.stringify(map));
}

async function importLegacyLocalProjects(apiProjects: Project[]): Promise<Project[]> {
  if (localStorage.getItem('lumaiq_projects_imported_to_db') === 'true') return apiProjects;

  const legacyProjects = readLegacyLocalProjects();
  if (legacyProjects.length === 0) {
    localStorage.setItem('lumaiq_projects_imported_to_db', 'true');
    return apiProjects;
  }

  const migration = readProjectIdMigration();
  const imported = [...apiProjects];

  for (const legacy of legacyProjects) {
    const existingById = imported.find((project) => project.id === legacy.id);
    if (existingById) {
      migration[legacy.id] = existingById.id;
      continue;
    }

    const existingByName = imported.find((project) => project.name.trim().toLowerCase() === legacy.name.trim().toLowerCase());
    if (existingByName) {
      migration[legacy.id] = existingByName.id;
      continue;
    }

    const created = await projectsApi.create({ name: legacy.name });
    imported.push(created);
    migration[legacy.id] = created.id;
  }

  saveProjectIdMigration(migration);
  localStorage.setItem('lumaiq_projects_imported_to_db', 'true');
  return imported;
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
          const apiProjects = await importLegacyLocalProjects(await projectsApi.list());
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
          set({ projects: [], activeProjectId: '', loading: false });
        }
      },

      addProject: async (name: string) => {
        const { projects } = get();
        const color = colorForIndex(projects.length);
        const project = await projectsApi.create({ name });
        const local: LocalProject = { id: project.id, name: project.name, color };
        set((s) => ({
          projects: [...s.projects, local],
          activeProjectId: local.id,
        }));
        return local;
      },

      removeProject: async (id: string) => {
        await projectsApi.delete(id);
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
        await projectsApi.update(id, { name });
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
        activeProjectId: s.activeProjectId,
      }),
      merge: (persisted, current) => ({
        ...current,
        activeProjectId: typeof (persisted as Partial<ProjectsState> | undefined)?.activeProjectId === 'string'
          ? (persisted as Partial<ProjectsState>).activeProjectId ?? ''
          : '',
      }),
    },
  ),
);
