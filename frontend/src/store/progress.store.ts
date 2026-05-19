import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    return {
      [flag]: true,
      ...(extra ?? {}),
      projectFlags: { ...s.projectFlags, [s.currentProjectId]: updated },
    };
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      ...DEFAULT_FLAGS,
      projectFlags:     {},
      currentProjectId: '',

      switchProject: (projectId: string) => {
        set((s) => {
          const flags = { ...DEFAULT_FLAGS, ...(s.projectFlags[projectId] ?? {}) };
          return { currentProjectId: projectId, ...flags };
        });
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
        set((s) => ({
          ...DEFAULT_FLAGS,
          projectFlags: {
            ...s.projectFlags,
            [s.currentProjectId]: { ...DEFAULT_FLAGS },
          },
        }));
      },
    }),
    {
      name: 'lumaiq-progress-v2',
      // Save projectFlags + currentProjectId; flat flags derived on load
      partialize: (s) => ({
        projectFlags:     s.projectFlags,
        currentProjectId: s.currentProjectId,
      }),
      // On rehydrate, restore flat flags from currentProjectId
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const flags = { ...DEFAULT_FLAGS, ...(state.projectFlags[state.currentProjectId] ?? {}) };
        Object.assign(state, flags);
      },
    },
  ),
);
