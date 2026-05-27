import { create } from 'zustand';

export interface StrategyMessage {
  role: 'ai' | 'user';
  text: string;
}

export interface PendingAnswer {
  content:    string;
  inputKey?:  string;
  inputValue?: string;
  blockKey:   string;
  stepIdx:    number;
}

interface StrategyState {
  messages:      StrategyMessage[];
  answers:       Record<string, string>;
  stepIndex:     number;
  completed:     boolean;
  pendingAnswer: PendingAnswer | null;

  addMessage:       (msg: StrategyMessage) => void;
  setMessages:      (msgs: StrategyMessage[]) => void;
  setAnswers:       (a: Record<string, string>) => void;
  setStepIndex:     (i: number) => void;
  setCompleted:     (v: boolean) => void;
  setPendingAnswer: (pa: PendingAnswer | null) => void;
  reset:            () => void;
}

const INITIAL: Pick<StrategyState, 'messages' | 'answers' | 'stepIndex' | 'completed' | 'pendingAnswer'> = {
  messages:      [],
  answers:       {},
  stepIndex:     0,
  completed:     false,
  pendingAnswer: null,
};

export const useStrategyStore = create<StrategyState>()((set) => ({
  ...INITIAL,

  addMessage:       (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages:      (messages) => set({ messages }),
  setAnswers:       (answers) => set({ answers }),
  setStepIndex:     (stepIndex) => set({ stepIndex }),
  setCompleted:     (completed) => set({ completed }),
  setPendingAnswer: (pendingAnswer) => set({ pendingAnswer }),
  reset:            () => set(INITIAL),
}));
