// ============================================================
// Anypoint Mobile Platform - Auth Store
// Manages authentication state, tokens, org/env switching
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_REGION_ID } from '../config/regions';
import type {
  AuthTokens,
  ControlPlaneRegionId,
  Environment,
  Organization,
  User,
} from '../types';
import { useNotificationStore } from './notificationStore';
import { useRuntimeTransitionStore } from './runtimeTransitionStore';

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

function resetSessionScopedState(previousUserId?: string | null, nextUserId?: string | null) {
  if (previousUserId && nextUserId && previousUserId === nextUserId) {
    useNotificationStore.getState().setActiveUser(nextUserId);
    return;
  }
  useNotificationStore.getState().setActiveUser(nextUserId ?? null);
  useRuntimeTransitionStore.getState().clearAllTransitions();
}

function buildFreshSessionState(
  user: User,
  tokens: AuthTokens,
  isAuthenticated: boolean,
): Pick<
  AuthState,
  | 'user'
  | 'tokens'
  | 'isAuthenticated'
  | 'isLoading'
  | 'currentOrganization'
  | 'currentEnvironment'
  | 'organizations'
  | 'environments'
> {
  return {
    user,
    tokens,
    isAuthenticated,
    isLoading: false,
    currentOrganization: null,
    currentEnvironment: null,
    organizations: [],
    environments: [],
  };
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user, tokens) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          return buildFreshSessionState(user, tokens, true);
        }),

      loginPending: (user, tokens) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          return buildFreshSessionState(user, tokens, false);
        }),

      completeLogin: () =>
        set({
          isAuthenticated: true,
        }),

      logout: () =>
        set((state) => {
          resetSessionScopedState(state.user?.id, null);
          return {
            ...initialState,
            selectedRegion: state.selectedRegion,
          };
        }),

      refreshToken: (tokens) =>
        set({
          tokens,
        }),

      setSelectedRegion: (region) =>
        set({
          selectedRegion: region,
        }),

      switchOrganization: (organization) =>
        set({
          currentOrganization: organization,
          currentEnvironment: null,
          environments: [],
        }),

      switchEnvironment: (environment) =>
        set({
          currentEnvironment: environment,
        }),

      loadSession: (user, tokens) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          return buildFreshSessionState(user, tokens, true);
        }),

      setUser: (user) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          return { user };
        }),

      setOrganizations: (organizations) =>
        set({
          organizations,
        }),

      setEnvironments: (environments) =>
        set({
          environments,
        }),

      setIsLoading: (isLoading) =>
        set({
          isLoading,
        }),
    }),
    {
      name: 'anypoint-auth-v3',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedRegion: state.selectedRegion,
      }),
    },
  ),
);
