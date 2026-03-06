import { create } from 'zustand';

export type RuntimeTransitionAction = 'starting' | 'stopping' | 'restarting';

export interface RuntimeTransition {
  action: RuntimeTransitionAction;
  label: string;
  startedAt: number;
}

interface RuntimeTransitionState {
  transitions: Record<string, RuntimeTransition>;
  setTransition: (domain: string, action: RuntimeTransitionAction) => void;
  clearTransition: (domain: string) => void;
  clearAllTransitions: () => void;
}

const TRANSITION_LABELS: Record<RuntimeTransitionAction, string> = {
  starting: 'Starting...',
  stopping: 'Stopping...',
  restarting: 'Restarting...',
};

export const useRuntimeTransitionStore = create<RuntimeTransitionState>((set) => ({
  transitions: {},
  setTransition: (domain, action) =>
    set((state) => ({
      transitions: {
        ...state.transitions,
        [domain]: {
          action,
          label: TRANSITION_LABELS[action],
          startedAt: Date.now(),
        },
      },
    })),
  clearTransition: (domain) =>
    set((state) => {
      if (!state.transitions[domain]) return state;
      const next = { ...state.transitions };
      delete next[domain];
      return { transitions: next };
    }),
  clearAllTransitions: () => set({ transitions: {} }),
}));
