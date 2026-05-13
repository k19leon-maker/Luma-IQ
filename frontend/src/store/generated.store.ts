import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProductDraft {
  name: string;
  price: string;
  format: string;
  duration: string;
  description: string;
  generated: boolean;
}

export interface SocialDraft {
  instagram: string;
  telegram: string;
  vk: string;
}

interface ProjectGeneratedData {
  utp?: string;
  social?: Partial<SocialDraft>;
  productMain?: ProductDraft;
  productMini?: ProductDraft;
  leadMagnet?: ProductDraft;
}

interface GeneratedState {
  projects: Record<string, ProjectGeneratedData>;
  setUtp: (projectId: string, value: string) => void;
  setSocial: (projectId: string, platform: keyof SocialDraft, value: string) => void;
  setProductMain: (projectId: string, value: ProductDraft) => void;
  setProductMini: (projectId: string, value: ProductDraft) => void;
  setLeadMagnet: (projectId: string, value: ProductDraft) => void;
  getProject: (projectId: string) => ProjectGeneratedData;
}

const EMPTY: ProjectGeneratedData = {};

export const useGeneratedStore = create<GeneratedState>()(
  persist(
    (set, get) => ({
      projects: {},

      setUtp: (projectId, utp) =>
        set((s) => ({ projects: { ...s.projects, [projectId]: { ...s.projects[projectId], utp } } })),

      setSocial: (projectId, platform, value) =>
        set((s) => {
          const current = s.projects[projectId] ?? EMPTY;
          return {
            projects: {
              ...s.projects,
              [projectId]: {
                ...current,
                social: { ...current.social, [platform]: value },
              },
            },
          };
        }),

      setProductMain: (projectId, productMain) =>
        set((s) => ({ projects: { ...s.projects, [projectId]: { ...s.projects[projectId], productMain } } })),

      setProductMini: (projectId, productMini) =>
        set((s) => ({ projects: { ...s.projects, [projectId]: { ...s.projects[projectId], productMini } } })),

      setLeadMagnet: (projectId, leadMagnet) =>
        set((s) => ({ projects: { ...s.projects, [projectId]: { ...s.projects[projectId], leadMagnet } } })),

      getProject: (projectId) => get().projects[projectId] ?? EMPTY,
    }),
    { name: 'lumaiq-generated-v1' },
  ),
);
