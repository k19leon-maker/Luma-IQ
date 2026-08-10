import { create } from 'zustand';
import { projectsApi, type ProjectGeneratedDataField } from '../api/projects.api';

export interface ProductDraft {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  generationStatus?: 'draft' | 'generating' | 'ready' | 'error';
  name: string;
  price: string;
  format: string;
  duration: string;
  description: string;
  currentMarkdown?: string;
  generated: boolean;
  workflowRunId?: string;
  workflowStepId?: string;
  artifactId?: string;
  generationId?: string;
  versionHistory?: AiResultVersion<ProductDraft>[];
}

export interface SocialDraft {
  instagram: string;
  telegram: string;
  vk: string;
}

export interface AiResultVersion<T = unknown> {
  id: string;
  title: string;
  createdAt: string;
  source: 'ai' | 'manual' | 'restore';
  workflowRunId?: string;
  workflowStepId?: string;
  artifactId?: string;
  generationId?: string;
  value: T;
}

interface ProjectGeneratedData {
  utp?: string;
  utpHistory?: AiResultVersion<string>[];
  social?: Partial<SocialDraft>;
  productMain?: ProductDraft;
  productMini?: ProductDraft;
  leadMagnet?: ProductDraft;
  leadMagnets?: ProductDraft[];
}

interface GeneratedState {
  projects: Record<string, ProjectGeneratedData>;
  loadedProjectFields: Record<string, Partial<Record<ProjectGeneratedDataField, boolean>>>;
  loadFromDb: (projectId: string, fields?: ProjectGeneratedDataField[]) => Promise<void>;
  setUtp: (projectId: string, value: string, history?: AiResultVersion<string>[]) => void;
  setSocial: (projectId: string, platform: keyof SocialDraft, value: string) => void;
  setProductMain: (projectId: string, value: ProductDraft) => void;
  setProductMini: (projectId: string, value: ProductDraft) => void;
  setLeadMagnet: (projectId: string, value: ProductDraft) => void;
  setLeadMagnets: (projectId: string, value: ProductDraft[]) => void;
  getProject: (projectId: string) => ProjectGeneratedData;
}

const EMPTY: ProjectGeneratedData = {};
const ALL_GENERATED_FIELDS: ProjectGeneratedDataField[] = [
  'utp',
  'utpHistory',
  'social',
  'productMain',
  'productMini',
  'leadMagnet',
  'leadMagnets',
];

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncGenerated(projectId: string, data: ProjectGeneratedData) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    projectsApi.saveStrategy(projectId, { generatedData: data }).catch(() => {});
  }, 500);
}

export const useGeneratedStore = create<GeneratedState>()((set, get) => ({
  projects: {},
  loadedProjectFields: {},

  loadFromDb: async (projectId, fields = ALL_GENERATED_FIELDS) => {
    if (!projectId) return;
    const loaded = get().loadedProjectFields[projectId] ?? {};
    const missing = [...new Set(fields)].filter((field) => !loaded[field]);
    if (!missing.length) return;

    const parts = await Promise.allSettled(missing.map(async (field) => {
      const data = await projectsApi.getStrategy(projectId, ['generatedData'], [field]);
      const generatedData = (data as Record<string, unknown> | null)?.generatedData as ProjectGeneratedData | undefined;
      return { field, generatedData };
    }));

    set((state) => {
      const currentProject = state.projects[projectId] ?? EMPTY;
      const nextLoaded = { ...(state.loadedProjectFields[projectId] ?? {}) };
      let nextProject = currentProject;

      for (const part of parts) {
        if (part.status !== 'fulfilled') continue;
        nextLoaded[part.value.field] = true;
        if (part.value.generatedData) {
          nextProject = { ...nextProject, ...part.value.generatedData };
        }
      }

      return {
        projects: { ...state.projects, [projectId]: nextProject },
        loadedProjectFields: { ...state.loadedProjectFields, [projectId]: nextLoaded },
      };
    });
  },

  setUtp: (projectId, utp, utpHistory) =>
    set((s) => {
      const next = { ...s.projects[projectId], utp, ...(utpHistory ? { utpHistory } : {}) };
      syncGenerated(projectId, next);
      return { projects: { ...s.projects, [projectId]: next } };
    }),

  setSocial: (projectId, platform, value) =>
    set((s) => {
      const current = s.projects[projectId] ?? EMPTY;
      const next = {
        ...current,
        social: { ...current.social, [platform]: value },
      };
      syncGenerated(projectId, next);
      return { projects: { ...s.projects, [projectId]: next } };
    }),

  setProductMain: (projectId, productMain) =>
    set((s) => {
      const next = { ...s.projects[projectId], productMain };
      syncGenerated(projectId, next);
      return { projects: { ...s.projects, [projectId]: next } };
    }),

  setProductMini: (projectId, productMini) =>
    set((s) => {
      const next = { ...s.projects[projectId], productMini };
      syncGenerated(projectId, next);
      return { projects: { ...s.projects, [projectId]: next } };
    }),

  setLeadMagnet: (projectId, leadMagnet) =>
    set((s) => {
      const next = { ...s.projects[projectId], leadMagnet };
      syncGenerated(projectId, next);
      return { projects: { ...s.projects, [projectId]: next } };
    }),

  setLeadMagnets: (projectId, leadMagnets) =>
    set((s) => {
      const next = { ...s.projects[projectId], leadMagnets };
      syncGenerated(projectId, next);
      return { projects: { ...s.projects, [projectId]: next } };
    }),

  getProject: (projectId) => get().projects[projectId] ?? EMPTY,
}));
