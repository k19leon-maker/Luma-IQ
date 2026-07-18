import { create } from 'zustand';
import { projectsApi } from '../api/projects.api';

export interface ProductDraft {
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
}

interface GeneratedState {
  projects: Record<string, ProjectGeneratedData>;
  loadedProjects: Record<string, boolean>;
  loadFromDb: (projectId: string) => Promise<void>;
  setUtp: (projectId: string, value: string, history?: AiResultVersion<string>[]) => void;
  setSocial: (projectId: string, platform: keyof SocialDraft, value: string) => void;
  setProductMain: (projectId: string, value: ProductDraft) => void;
  setProductMini: (projectId: string, value: ProductDraft) => void;
  setLeadMagnet: (projectId: string, value: ProductDraft) => void;
  getProject: (projectId: string) => ProjectGeneratedData;
}

const EMPTY: ProjectGeneratedData = {};

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function syncGenerated(projectId: string, data: ProjectGeneratedData) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    projectsApi.saveStrategy(projectId, { generatedData: data }).catch(() => {});
  }, 500);
}

export const useGeneratedStore = create<GeneratedState>()((set, get) => ({
  projects: {},
  loadedProjects: {},

  loadFromDb: async (projectId) => {
    if (!projectId || get().loadedProjects[projectId]) return;
    try {
      const data = await projectsApi.getStrategy(projectId);
      const generatedData = (data as Record<string, unknown> | null)?.['generatedData'] as ProjectGeneratedData | undefined;
      set((s) => ({
        projects: generatedData ? { ...s.projects, [projectId]: generatedData } : s.projects,
        loadedProjects: { ...s.loadedProjects, [projectId]: true },
      }));
    } catch {
      set((s) => ({ loadedProjects: { ...s.loadedProjects, [projectId]: true } }));
    }
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

  getProject: (projectId) => get().projects[projectId] ?? EMPTY,
}));
