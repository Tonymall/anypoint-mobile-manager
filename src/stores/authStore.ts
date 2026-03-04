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
} from '../types';

// --- State ---
export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  currentOrganization: Organization | null;
  currentEnvironment: Environment | null;
  organizations: Organization[];
  environments: Environment[];
}

// --- Actions ---
export interface AuthActions {
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => void;
  refreshToken: (tokens: AuthTokens) => void;
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

      logout: () =>
        set({
          ...initialState,
        }),

      refreshToken: (tokens: AuthTokens) =>
        set({
          tokens,
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
      name: 'anypoint-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Do NOT persist tokens - they should be stored in SecureStore separately.
      // Only persist user profile and org/env selection for session restoration.
      partialize: (state) => ({
        user: state.user,
        currentOrganization: state.currentOrganization,
        currentEnvironment: state.currentEnvironment,
        organizations: state.organizations,
        environments: state.environments,
      }),
    },
  ),
);
