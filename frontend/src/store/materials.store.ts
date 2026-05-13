import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { projectsApi } from '../api/projects.api';

export type MaterialKind =
  | 'positioning'
  | 'audience'
  | 'utp'
  | 'social'
  | 'product-main'
  | 'product-mini'
  | 'lead-magnet'
  | 'content';

export interface ProjectMaterial {
  id: string;
  kind: MaterialKind;
  title: string;
  content: string;
  summary: string;
  updatedAt: string;
}

interface MaterialsState {
  projects: Record<string, ProjectMaterial[]>;
  loadFromDb: (projectId: string) => Promise<void>;
  upsertMaterial: (projectId: string, material: Omit<ProjectMaterial, 'updatedAt'> & { updatedAt?: string }) => void;
  removeMaterial: (projectId: string, id: string) => void;
  getProjectMaterials: (projectId: string) => ProjectMaterial[];
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function makeSummary(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

export const useMaterialsStore = create<MaterialsState>()(
  persist(
    (set, get) => ({
      projects: {},

      loadFromDb: async (projectId) => {
        if (!projectId || projectId === 'default') return;
        try {
          const data = await projectsApi.getStrategy(projectId);
          const materialsData = (data as Record<string, unknown> | null)?.['materialsData'] as ProjectMaterial[] | undefined;
          if (!materialsData?.length) return;
          set((s) => ({
            projects: {
              ...s.projects,
              [projectId]: s.projects[projectId]?.length ? s.projects[projectId] : materialsData,
            },
          }));
        } catch {
          // localStorage remains the fallback source
        }
      },

      upsertMaterial: (projectId, material) => {
        if (!projectId) return;
        set((s) => {
          const current = s.projects[projectId] ?? [];
          const nextMaterial: ProjectMaterial = {
            ...material,
            summary: material.summary || makeSummary(material.content),
            updatedAt: material.updatedAt ?? new Date().toISOString(),
          };
          const exists = current.some((item) => item.id === material.id);
          const next = exists
            ? current.map((item) => (item.id === material.id ? nextMaterial : item))
            : [nextMaterial, ...current];
          if (syncTimer) clearTimeout(syncTimer);
          syncTimer = setTimeout(() => {
            projectsApi.saveStrategy(projectId, { materialsData: next }).catch(() => {});
          }, 600);
          return { projects: { ...s.projects, [projectId]: next } };
        });
      },

      removeMaterial: (projectId, id) => {
        set((s) => {
          const next = (s.projects[projectId] ?? []).filter((item) => item.id !== id);
          projectsApi.saveStrategy(projectId, { materialsData: next }).catch(() => {});
          return {
            projects: {
              ...s.projects,
              [projectId]: next,
            },
          };
        });
      },

      getProjectMaterials: (projectId) => get().projects[projectId] ?? [],
    }),
    { name: 'lumaiq-materials-v1' },
  ),
);
