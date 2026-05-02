import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

      addMessage: (m) =>
        setData(set, (d) => ({ messages: [...d.messages, m] })),

      setMessages: (messages) =>
        setData(set, () => ({ messages })),

      setStepIndex: (stepIndex) =>
        setData(set, () => ({ stepIndex })),

      setQAnswers: (qAnswers) =>
        setData(set, () => ({ qAnswers })),

      setProfileData: (profileData) =>
        setData(set, () => ({ profileData })),

      setPositioning: (positioning) =>
        setData(set, () => ({ positioning })),

      setPositioningOptions: (positioningOptions) =>
        setData(set, () => ({ positioningOptions })),

      setCompleted: (completed) =>
        setData(set, () => ({ completed })),

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
