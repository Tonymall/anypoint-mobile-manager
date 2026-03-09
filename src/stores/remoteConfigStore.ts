import { create } from 'zustand';

import type { MobileRemoteConfig } from '../services/backendService';

interface RemoteConfigState {
  config: MobileRemoteConfig | null;
  hasLoaded: boolean;
  isLoading: boolean;
  lastFetchedAt: string | null;
  updateRequired: boolean;
}

interface RemoteConfigActions {
  setConfig: (config: MobileRemoteConfig | null) => void;
  setLoading: (isLoading: boolean) => void;
  setUpdateRequired: (required: boolean) => void;
  reset: () => void;
}

const initialState: RemoteConfigState = {
  config: null,
  hasLoaded: false,
  isLoading: false,
  lastFetchedAt: null,
  updateRequired: false,
};

export const useRemoteConfigStore = create<RemoteConfigState & RemoteConfigActions>((set) => ({
  ...initialState,

  setConfig: (config) =>
    set({
      config,
      hasLoaded: true,
      isLoading: false,
      lastFetchedAt: new Date().toISOString(),
    }),

  setLoading: (isLoading) =>
    set({
      isLoading,
    }),

  setUpdateRequired: (required) =>
    set({
      updateRequired: required,
    }),

  reset: () => set(initialState),
}));
