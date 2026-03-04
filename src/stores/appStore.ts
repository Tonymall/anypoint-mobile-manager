// ============================================================
// Anypoint Mobile Platform - App Store
// Manages global app settings, theme, connectivity, navigation
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppSettings } from '../types';

// --- Navigation Section ---
export type NavSection =
  | 'dashboard'
  | 'runtime-manager'
  | 'api-manager'
  | 'exchange'
  | 'monitoring'
  | 'alerts'
  | 'access-management'
  | 'settings';

// --- State ---
export interface AppState {
  settings: AppSettings;
  isOnline: boolean;
  selectedNavSection: NavSection;
}

// --- Actions ---
export interface AppActions {
  updateSettings: (settings: Partial<AppSettings>) => void;
  toggleTheme: () => void;
  setOnlineStatus: (isOnline: boolean) => void;
  setSelectedNavSection: (section: NavSection) => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

// --- Default Settings ---
const defaultSettings: AppSettings = {
  theme: 'dark',
  biometricEnabled: false,
  pushNotificationsEnabled: true,
  notificationPreferences: {
    criticalAlerts: true,
    warningAlerts: true,
    infoAlerts: false,
    deploymentUpdates: true,
    apiAccessRequests: true,
    securityEvents: true,
  },
  pollingIntervalSeconds: 30,
};

// --- Initial State ---
const initialState: AppState = {
  settings: defaultSettings,
  isOnline: true,
  selectedNavSection: 'dashboard',
};

// --- Store ---
export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      updateSettings: (partial: Partial<AppSettings>) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...partial,
          },
        })),

      toggleTheme: () =>
        set((state) => {
          const themeOrder: AppSettings['theme'][] = ['light', 'dark', 'system'];
          const currentIndex = themeOrder.indexOf(state.settings.theme);
          const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
          return {
            settings: {
              ...state.settings,
              theme: nextTheme,
            },
          };
        }),

      setOnlineStatus: (isOnline: boolean) =>
        set({
          isOnline,
        }),

      setSelectedNavSection: (section: NavSection) =>
        set({
          selectedNavSection: section,
        }),

      loadSettings: () => {
        // Settings are automatically loaded by the persist middleware on rehydration.
        // This action is provided as an explicit hook for manual reload if needed.
        const { settings } = get();
        set({ settings: { ...defaultSettings, ...settings } });
      },

      saveSettings: () => {
        // Settings are automatically persisted by the persist middleware.
        // This action is provided as an explicit hook for forced save if needed.
        // The persist middleware handles AsyncStorage writes on every state change.
      },
    }),
    {
      name: 'anypoint-app-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist settings and nav section; isOnline is transient
      partialize: (state) => ({
        settings: state.settings,
        selectedNavSection: state.selectedNavSection,
      }),
    },
  ),
);
