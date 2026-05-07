import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { projectsApi } from '../api/projects.api';

export interface UnpackingMessage {
  role: 'ai' | 'user';
  text: string;
}

export interface PositioningOption {
  id:        number;
  niche:     string;
  audience:  string;
  advantage: string;
}

export interface UnpackingData {
  messages:           UnpackingMessage[];
  stepIndex:          number;
  qAnswers:           Record<number, string>;
  profileData:        Record<string, string>;
  positioning:        string | null;
  positioningOptions: PositioningOption[] | null;
  completed:          boolean;
}

interface UnpackingState extends UnpackingData {
  // Per-project storage
  projectData:      Record<string, UnpackingData>;
  currentProjectId: string;

  // Switch active project
  switchProject: (projectId: string) => void;
  loadFromDb: (projectId: string) => Promise<void>;

  // Actions (operate on currentProjectId)
  addMessage:            (m: UnpackingMessage) => void;
  setMessages:           (m: UnpackingMessage[]) => void;
  setStepIndex:          (i: number) => void;
  setQAnswers:           (a: Record<number, string>) => void;
  setProfileData:        (p: Record<string, string>) => void;
  setPositioning:        (p: string) => void;
  setPositioningOptions: (o: PositioningOption[] | null) => void;
  setCompleted:          (v: boolean) => void;
  reset:                 () => void;
}

// Debounce timer for DB sync
let dbSyncTimer: ReturnType<typeof setTimeout> | null = null;

function schedulDbSync(projectId: string, data: UnpackingData) {
  if (!projectId || projectId === 'default') return;
  if (dbSyncTimer) clearTimeout(dbSyncTimer);
  dbSyncTimer = setTimeout(() => {
    projectsApi.saveUnpacking(projectId, {
      messages:           data.messages,
      profileData:        data.profileData,
      positioning:        data.positioning,
      positioningOptions: data.positioningOptions,
      completed:          data.completed,
      stepIndex:          data.stepIndex,
    }).catch(() => {});
  }, 3000);
}

const DEFAULT_DATA: UnpackingData = {
  messages:           [],
  stepIndex:          0,
  qAnswers:           {},
  profileData:        {},
  positioning:        null,
  positioningOptions: null,
  completed:          false,
};

function getData(s: UnpackingState): UnpackingData {
  return s.projectData[s.currentProjectId] ?? { ...DEFAULT_DATA };
}

function setData(
  set: (fn: (s: UnpackingState) => Partial<UnpackingState>) => void,
  updater: (d: UnpackingData) => Partial<UnpackingData>,
) {
  set((s) => {
    const current = getData(s);
    const updated: UnpackingData = { ...current, ...updater(current) };
    return {
      ...updater(current),
      projectData: { ...s.projectData, [s.currentProjectId]: updated },
    };
  });
}

export const useUnpackingStore = create<UnpackingState>()(
  persist(
    (set) => ({
      ...DEFAULT_DATA,
      projectData:      {},
      currentProjectId: '',

      switchProject: (projectId: string) => {
        set((s) => {
          const data = s.projectData[projectId] ?? { ...DEFAULT_DATA };
          return { currentProjectId: projectId, ...data };
        });
      },

      loadFromDb: async (projectId: string) => {
        if (!projectId || projectId === 'default') return;
        try {
          const dbData = await projectsApi.getUnpacking(projectId) as Partial<UnpackingData> | null;
          if (!dbData || !dbData.messages?.length) return;
          set((s) => {
            const localData = s.projectData[projectId];
            // Only load from DB if local has no messages
            if (localData?.messages?.length) return {};
            const merged: UnpackingData = { ...DEFAULT_DATA, ...dbData };
            return {
              projectData: { ...s.projectData, [projectId]: merged },
              ...(s.currentProjectId === projectId ? merged : {}),
            };
          });
        } catch {
          // DB unavailable — local storage is fine
        }
      },

      addMessage: (m) => {
        let updated: UnpackingData | null = null;
        setData(set, (d) => { updated = { ...d, messages: [...d.messages, m] }; return { messages: updated.messages }; });
        set((s) => { if (updated) schedulDbSync(s.currentProjectId, updated); return {}; });
      },

      setMessages: (messages) => {
        setData(set, () => ({ messages }));
        set((s) => {
          const data = getData(s);
          schedulDbSync(s.currentProjectId, { ...data, messages });
          return {};
        });
      },

      setStepIndex: (stepIndex) =>
        setData(set, () => ({ stepIndex })),

      setQAnswers: (qAnswers) =>
        setData(set, () => ({ qAnswers })),

      setProfileData: (profileData) => {
        setData(set, () => ({ profileData }));
        set((s) => { schedulDbSync(s.currentProjectId, { ...getData(s), profileData }); return {}; });
      },

      setPositioning: (positioning) => {
        setData(set, () => ({ positioning }));
        set((s) => { schedulDbSync(s.currentProjectId, { ...getData(s), positioning }); return {}; });
      },

      setPositioningOptions: (positioningOptions) =>
        setData(set, () => ({ positioningOptions })),

      setCompleted: (completed) => {
        setData(set, () => ({ completed }));
        set((s) => { schedulDbSync(s.currentProjectId, { ...getData(s), completed }); return {}; });
      },

      reset: () =>
        setData(set, () => ({ ...DEFAULT_DATA })),
    }),
    {
      name: 'unpacking-store-v2',
      partialize: (s) => ({
        projectData:      s.projectData,
        currentProjectId: s.currentProjectId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const data = state.projectData[state.currentProjectId] ?? { ...DEFAULT_DATA };
        Object.assign(state, data);
      },
    },
  ),
);
