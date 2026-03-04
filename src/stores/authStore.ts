// ============================================================
// Anypoint Mobile Platform - Auth Store
// Manages authentication state, tokens, org/env switching
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  User,
  AuthTokens,
  Organization,
  Environment,
  ControlPlaneRegionId,
} from '../types';
import { DEFAULT_REGION_ID } from '../config/regions';

// --- State ---
export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  selectedRegion: ControlPlaneRegionId;
  currentOrganization: Organization | null;
  currentEnvironment: Environment | null;
  organizations: Organization[];
  environments: Environment[];
}

// --- Actions ---
export interface AuthActions {
  login: (user: User, tokens: AuthTokens) => void;
  loginPending: (user: User, tokens: AuthTokens) => void;
  completeLogin: () => void;
  logout: () => void;
  refreshToken: (tokens: AuthTokens) => void;
  setSelectedRegion: (region: ControlPlaneRegionId) => void;
  switchOrganization: (organization: Organization) => void;
  switchEnvironment: (environment: Environment) => void;
  loadSession: (user: User, tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  setOrganizations: (organizations: Organization[]) => void;
  setEnvironments: (environments: Environment[]) => void;
  setIsLoading: (isLoading: boolean) => void;
}

// --- Initial State ---
const initialState: AuthState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  selectedRegion: DEFAULT_REGION_ID,
  currentOrganization: null,
  currentEnvironment: null,
  organizations: [],
  environments: [],
};

// --- Store ---
export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user: User, tokens: AuthTokens) =>
        set({
          user,
          tokens,
          isAuthenticated: true,
          isLoading: false,
        }),

      loginPending: (user: User, tokens: AuthTokens) =>
        set({
          user,
          tokens,
          isAuthenticated: false,
          isLoading: false,
        }),

      completeLogin: () =>
        set({
          isAuthenticated: true,
        }),

      logout: () =>
        set((state) => ({
          ...initialState,
          // Keep the user's region selection — resetting to 'us' causes 403
          // when an EU1 user signs out and tries to sign back in.
          selectedRegion: state.selectedRegion,
        })),

      refreshToken: (tokens: AuthTokens) =>
        set({
          tokens,
        }),

      setSelectedRegion: (region: ControlPlaneRegionId) =>
        set({
          selectedRegion: region,
        }),

      switchOrganization: (organization: Organization) =>
        set({
          currentOrganization: organization,
          // Clear environment when switching orgs since environments are org-specific
          currentEnvironment: null,
          environments: [],
        }),

      switchEnvironment: (environment: Environment) =>
        set({
          currentEnvironment: environment,
        }),

      loadSession: (user: User, tokens: AuthTokens) =>
        set({
          user,
          tokens,
          isAuthenticated: true,
          isLoading: false,
        }),

      setUser: (user: User) =>
        set({
          user,
        }),

      setOrganizations: (organizations: Organization[]) =>
        set({
          organizations,
        }),

      setEnvironments: (environments: Environment[]) =>
        set({
          environments,
        }),

      setIsLoading: (isLoading: boolean) =>
        set({
          isLoading,
        }),
    }),
    {
      name: 'anypoint-auth-v3',
      storage: createJSONStorage(() => AsyncStorage),
      // Do NOT persist tokens or isAuthenticated - tokens in SecureStore.
      // isAuthenticated must always start as false; user must log in each session.
      partialize: (state) => ({
        selectedRegion: state.selectedRegion,
      }),
    },
  ),
);
