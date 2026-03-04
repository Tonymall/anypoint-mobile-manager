// ============================================================
// Anypoint Mobile Platform - Runtime Manager Store
// Manages applications, logs, and runtime filters
// ============================================================

import { create } from 'zustand';

import type {
  Application,
  AppLogEntry,
  AppStatus,
  DeploymentTarget,
} from '../types';

// --- Filters ---
export interface RuntimeFilters {
  status: AppStatus | null;
  deploymentTarget: DeploymentTarget | null;
  searchQuery: string;
}

// --- State ---
export interface RuntimeState {
  applications: Application[];
  selectedApp: Application | null;
  logs: AppLogEntry[];
  isLoading: boolean;
  filters: RuntimeFilters;
}

// --- Actions ---
export interface RuntimeActions {
  setApplications: (applications: Application[]) => void;
  selectApp: (app: Application | null) => void;
  setLogs: (logs: AppLogEntry[]) => void;
  appendLogs: (logs: AppLogEntry[]) => void;
  setFilters: (filters: Partial<RuntimeFilters>) => void;
  clearSelection: () => void;
  setIsLoading: (isLoading: boolean) => void;
  updateApplication: (appId: string, updates: Partial<Application>) => void;
}

// --- Default Filters ---
const defaultFilters: RuntimeFilters = {
  status: null,
  deploymentTarget: null,
  searchQuery: '',
};

// --- Initial State ---
const initialState: RuntimeState = {
  applications: [],
  selectedApp: null,
  logs: [],
  isLoading: false,
  filters: defaultFilters,
};

// --- Store ---
export const useRuntimeStore = create<RuntimeState & RuntimeActions>()(
  (set) => ({
    ...initialState,

    setApplications: (applications: Application[]) =>
      set({
        applications,
      }),

    selectApp: (app: Application | null) =>
      set({
        selectedApp: app,
        // Clear logs when switching to a different app
        logs: [],
      }),

    setLogs: (logs: AppLogEntry[]) =>
      set({
        logs,
      }),

    appendLogs: (logs: AppLogEntry[]) =>
      set((state) => ({
        logs: [...state.logs, ...logs],
      })),

    setFilters: (partial: Partial<RuntimeFilters>) =>
      set((state) => ({
        filters: {
          ...state.filters,
          ...partial,
        },
      })),

    clearSelection: () =>
      set({
        selectedApp: null,
        logs: [],
      }),

    setIsLoading: (isLoading: boolean) =>
      set({
        isLoading,
      }),

    updateApplication: (appId: string, updates: Partial<Application>) =>
      set((state) => ({
        applications: state.applications.map((app) =>
          app.id === appId ? { ...app, ...updates } : app,
        ),
        // Also update selectedApp if it matches
        selectedApp:
          state.selectedApp?.id === appId
            ? { ...state.selectedApp, ...updates }
            : state.selectedApp,
      })),
  }),
);
