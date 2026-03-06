// ============================================================
// Legal Store — Per-user Terms & Conditions acceptance tracking
//
// Persisted via AsyncStorage so acceptance survives app restarts.
// Keyed by userId so multiple accounts on the same device each
// require independent acceptance.
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TERMS_VERSION } from '../constants/legal';

// --- Types ---
export interface TermsAcceptance {
  version: string;
  acceptedAt: string; // ISO-8601 date string
}

export interface LegalState {
  acceptances: Record<string, TermsAcceptance>; // keyed by userId
}

export interface LegalActions {
  acceptTerms: (userId: string, version: string) => void;
  hasAcceptedCurrentTerms: (userId: string) => boolean;
  getAcceptance: (userId: string) => TermsAcceptance | undefined;
}

// --- Initial State ---
const initialState: LegalState = {
  acceptances: {},
};

// --- Store ---
export const useLegalStore = create<LegalState & LegalActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      acceptTerms: (userId: string, version: string) =>
        set((state) => ({
          acceptances: {
            ...state.acceptances,
            [userId]: {
              version,
              acceptedAt: new Date().toISOString(),
            },
          },
        })),

      hasAcceptedCurrentTerms: (userId: string) => {
        const acceptance = get().acceptances[userId];
        return acceptance?.version === TERMS_VERSION;
      },

      getAcceptance: (userId: string) => {
        return get().acceptances[userId];
      },
    }),
    {
      name: 'muleops-legal-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        acceptances: state.acceptances,
      }),
    },
  ),
);
