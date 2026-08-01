import { create } from 'zustand';
import { projectsApi } from '../api/projects.api';

// ── Per-project flags ──────────────────────────────────────────────────────────

export interface ProgressFlags {
  expertProfileCompleted: boolean;
  positioningCompleted:  boolean;
  unpackingCompleted:    boolean;
  audienceCompleted:     boolean;
  utpCompleted:          boolean;
  socialCompleted:       boolean;
  strategyCompleted:     boolean;
  productMainCompleted:  boolean;
  productMiniCompleted:  boolean;
  leadMagnetCompleted:   boolean;
}

const DEFAULT_FLAGS: ProgressFlags = {
  expertProfileCompleted: false,
  positioningCompleted:  false,
  unpackingCompleted:    false,
  audienceCompleted:     false,
  utpCompleted:          false,
  socialCompleted:       false,
  strategyCompleted:     false,
  productMainCompleted:  false,
  productMiniCompleted:  false,
  leadMagnetCompleted:   false,
};

// ── Store interface ────────────────────────────────────────────────────────────

interface ProgressState extends ProgressFlags {
  // Per-project storage
  projectFlags:     Record<string, ProgressFlags>;
  currentProjectId: string;

  // Switch active project — loads its flags into the flat state
  switchProject: (projectId: string) => void;
  loadFromDb: (projectId: string) => Promise<void>;

  // Actions (use currentProjectId internally — backwards compat for all callers)
  completePositioning: () => void;
  completeExpertProfile: () => void;
  completeUnpacking:   () => void;
  completeAudience:    () => void;
  completeUtp:         () => void;
  completeSocial:      () => void;
  completeStrategy:    () => void;
  completeProductMain: () => void;
  completeProductMini: () => void;
  completeLeadMagnet:  () => void;
  resetProgress:       () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFlags(state: ProgressState): ProgressFlags {
  return { ...DEFAULT_FLAGS, ...(state.projectFlags[state.currentProjectId] ?? {}) };
}

function setFlag(
  set: (fn: (s: ProgressState) => Partial<ProgressState>) => void,
  flag: keyof ProgressFlags,
  extra?: Partial<ProgressFlags>,
) {
  set((s) => {
    const updated: ProgressFlags = { ...getFlags(s), [flag]: true, ...(extra ?? {}) };
    if (s.currentProjectId) {
      projectsApi.saveStrategy(s.currentProjectId, { progressFlags: updated }).catch(() => {});
    }
    return {
      [flag]: true,
      ...(extra ?? {}),
      projectFlags: { ...s.projectFlags, [s.currentProjectId]: updated },
    };
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProgressStore = create<ProgressState>()((set) => ({
  ...DEFAULT_FLAGS,
  projectFlags:     {},
  currentProjectId: '',

  switchProject: (projectId: string) => {
    set((s) => {
      const flags = { ...DEFAULT_FLAGS, ...(s.projectFlags[projectId] ?? {}) };
      return { currentProjectId: projectId, ...flags };
    });
  },

  loadFromDb: async (projectId: string) => {
    if (!projectId || projectId === 'default') return;
    try {
      const data = await projectsApi.getStrategy(projectId, ['progressFlags']);
      const flags = { ...DEFAULT_FLAGS, ...((data as Record<string, unknown> | null)?.progressFlags as Partial<ProgressFlags> | undefined ?? {}) };
      set((s) => ({
        ...flags,
        projectFlags: { ...s.projectFlags, [projectId]: flags },
      }));
    } catch {
      // keep in-memory flags
    }
  },

  completeExpertProfile: () => setFlag(set, 'expertProfileCompleted'),
  completePositioning: () => setFlag(set, 'positioningCompleted'),
  completeUnpacking:   () => setFlag(set, 'unpackingCompleted'),
  completeAudience:    () => setFlag(set, 'audienceCompleted', { strategyCompleted: true }),
  completeUtp:         () => setFlag(set, 'utpCompleted'),
  completeSocial:      () => setFlag(set, 'socialCompleted'),
  completeStrategy:    () => setFlag(set, 'audienceCompleted', { strategyCompleted: true }),
  completeProductMain: () => setFlag(set, 'productMainCompleted'),
  completeProductMini: () => setFlag(set, 'productMiniCompleted'),
  completeLeadMagnet:  () => setFlag(set, 'leadMagnetCompleted'),

  resetProgress: () => {
    set((s) => {
      if (s.currentProjectId) {
        projectsApi.saveStrategy(s.currentProjectId, { progressFlags: DEFAULT_FLAGS }).catch(() => {});
      }
      return {
        ...DEFAULT_FLAGS,
        projectFlags: {
          ...s.projectFlags,
          [s.currentProjectId]: { ...DEFAULT_FLAGS },
        },
      };
    });
  },
}));
