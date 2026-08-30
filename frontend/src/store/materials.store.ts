import { create } from 'zustand';
import { aiApi } from '../api/ai';
import { projectsApi } from '../api/projects.api';

export type MaterialKind =
  | 'expert-profile'
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
  summaryStatus?: 'fresh' | 'pending' | 'updating' | 'failed';
  linkedMaterialIds?: string[];
  versions?: ProjectMaterialVersion[];
  updatedAt: string;
}

export interface ProjectMaterialVersion {
  content: string;
  summary: string;
  updatedAt: string;
}

interface MaterialsState {
  projects: Record<string, ProjectMaterial[]>;
  loadFromDb: (projectId: string) => Promise<void>;
  upsertMaterial: (projectId: string, material: Omit<ProjectMaterial, 'updatedAt'> & { updatedAt?: string }) => void;
  hydrateMaterial: (projectId: string, material: Omit<ProjectMaterial, 'updatedAt'> & { updatedAt?: string }) => void;
  refreshSummary: (projectId: string, materialId: string) => Promise<void>;
  removeMaterial: (projectId: string, id: string) => void;
  getProjectMaterials: (projectId: string) => ProjectMaterial[];
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
const summaryTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function makeSummary(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function syncMaterials(projectId: string, materials: ProjectMaterial[]) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const compactMaterials = materials.map((item) => ({
      ...item,
      content: item.content.slice(0, 30000),
      summary: item.summary.slice(0, 1800),
      versions: (item.versions ?? []).slice(0, 3).map((version) => ({
        ...version,
        content: version.content.slice(0, 5000),
        summary: version.summary.slice(0, 1200),
      })),
    }));
    projectsApi.saveStrategy(projectId, { materialsData: compactMaterials }).catch(() => {});
  }, 600);
}

function normalizeMaterial(material: ProjectMaterial): ProjectMaterial {
  return {
    ...material,
    summary: material.summary || makeSummary(material.content),
    summaryStatus: material.summaryStatus ?? 'fresh',
    linkedMaterialIds: material.linkedMaterialIds ?? [],
    versions: material.versions ?? [],
  };
}

async function buildAiSummary(projectId: string, material: ProjectMaterial): Promise<string> {
  const resp = await aiApi.startWorkflow('ai.dialog', {
    projectId,
    step: 'message',
    provider: 'claude',
    claudeModel: 'claude-haiku-4-5-20251001',
    inputs: {
      source: 'materials-summary',
      message: `Сделай короткое рабочее саммари материала для AI knowledge base.

Формат строго:
Суть: ...
Аудитория: ...
Боли/запросы: ...
Оффер/результат: ...
Ключевые формулировки: ...

Если какого-то блока нет в материале, напиши "не указано". Не добавляй факты, которых нет в материале.

Материал:
${material.content.slice(0, 6500)}`,
    },
  });
  return resp.content.trim().slice(0, 1800);
}

export const useMaterialsStore = create<MaterialsState>()(
    (set, get) => ({
      projects: {},

      loadFromDb: async (projectId) => {
        if (!projectId || projectId === 'default') return;
        try {
          const data = await projectsApi.getStrategy(projectId, ['materialsData']);
          const materialsData = (data as Record<string, unknown> | null)?.['materialsData'] as ProjectMaterial[] | undefined;
          if (!materialsData?.length) return;
          set((s) => ({
            projects: {
              ...s.projects,
              [projectId]: s.projects[projectId]?.length
                ? s.projects[projectId].map(normalizeMaterial)
                : materialsData.map(normalizeMaterial),
            },
          }));
        } catch {
          // keep in-memory materials; next successful sync will persist to DB
        }
      },

      upsertMaterial: (projectId, material) => {
        if (!projectId) return;
        set((s) => {
          const current = s.projects[projectId] ?? [];
          const existing = current.find((item) => item.id === material.id);
          const contentChanged = Boolean(existing && existing.content !== material.content);
          const versions = contentChanged
            ? [
              {
                content: existing!.content,
                summary: existing!.summary,
                updatedAt: existing!.updatedAt,
              },
              ...(existing!.versions ?? []),
            ].slice(0, 10)
            : (material.versions ?? existing?.versions ?? []);
          const shouldRefreshSummary = (contentChanged || !existing?.summary) && material.summaryStatus !== 'fresh';
          const nextMaterial: ProjectMaterial = {
            ...(existing ?? {}),
            ...material,
            summary: contentChanged ? makeSummary(material.content) : (material.summary || existing?.summary || makeSummary(material.content)),
            summaryStatus: shouldRefreshSummary ? 'pending' : (material.summaryStatus ?? existing?.summaryStatus ?? 'fresh'),
            linkedMaterialIds: material.linkedMaterialIds ?? existing?.linkedMaterialIds ?? [],
            versions,
            updatedAt: material.updatedAt ?? new Date().toISOString(),
          };
          const exists = Boolean(existing);
          const next = exists
            ? current.map((item) => (item.id === material.id ? nextMaterial : item))
            : [nextMaterial, ...current];
          syncMaterials(projectId, next);

          const timerKey = `${projectId}:${material.id}`;
          if (summaryTimers[timerKey]) clearTimeout(summaryTimers[timerKey]);
          if (nextMaterial.summaryStatus === 'pending') {
            summaryTimers[timerKey] = setTimeout(() => {
              void get().refreshSummary(projectId, material.id);
            }, 900);
          }

          return { projects: { ...s.projects, [projectId]: next } };
        });
      },

      hydrateMaterial: (projectId, material) => {
        if (!projectId) return;
        set((s) => {
          const current = s.projects[projectId] ?? [];
          const existing = current.find((item) => item.id === material.id);
          const nextMaterial = normalizeMaterial({
            ...(existing ?? {}),
            ...material,
            versions: existing?.versions ?? material.versions ?? [],
            updatedAt: material.updatedAt ?? new Date().toISOString(),
          } as ProjectMaterial);
          const next = existing
            ? current.map((item) => item.id === material.id ? nextMaterial : item)
            : [nextMaterial, ...current];
          return { projects: { ...s.projects, [projectId]: next } };
        });
      },

      refreshSummary: async (projectId, materialId) => {
        const material = get().projects[projectId]?.find((item) => item.id === materialId);
        if (!material) return;

        set((s) => {
          const current = s.projects[projectId] ?? [];
          return {
            projects: {
              ...s.projects,
              [projectId]: current.map((item) =>
                item.id === materialId ? { ...item, summaryStatus: 'updating' } : item,
              ),
            },
          };
        });

        try {
          const summary = await buildAiSummary(projectId, material);
          set((s) => {
            const current = s.projects[projectId] ?? [];
            const next = current.map((item) =>
              item.id === materialId ? { ...item, summary, summaryStatus: 'fresh' as const } : item,
            );
            syncMaterials(projectId, next);
            return { projects: { ...s.projects, [projectId]: next } };
          });
        } catch {
          set((s) => {
            const current = s.projects[projectId] ?? [];
            const next = current.map((item) =>
              item.id === materialId ? { ...item, summaryStatus: 'failed' as const } : item,
            );
            syncMaterials(projectId, next);
            return { projects: { ...s.projects, [projectId]: next } };
          });
        }
      },

      removeMaterial: (projectId, id) => {
        set((s) => {
          const next = (s.projects[projectId] ?? []).filter((item) => item.id !== id);
          syncMaterials(projectId, next);
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
);
