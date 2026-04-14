import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProgressState {
  strategyCompleted: boolean;
  completeStrategy: () => void;
  resetProgress: () => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      strategyCompleted: false,
      completeStrategy: () => set({ strategyCompleted: true }),
      resetProgress: () => set({ strategyCompleted: false }),
    }),
    { name: 'psy-boost-progress' },
  ),
);
