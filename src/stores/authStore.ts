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

export interface RememberedAccountSession {
  accountId: string;
  user: User;
  tokens: AuthTokens;
  isAuthenticated: boolean;
  selectedRegion: ControlPlaneRegionId;
  currentOrganization: Organization | null;
  currentEnvironment: Environment | null;
  organizations: Organization[];
  environments: Environment[];
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  rememberSession: boolean;
  selectedRegion: ControlPlaneRegionId;
  currentOrganization: Organization | null;
  currentEnvironment: Environment | null;
  organizations: Organization[];
  environments: Environment[];
  rememberedAccounts: Record<string, RememberedAccountSession>;
}

export interface AuthActions {
  login: (user: User, tokens: AuthTokens) => void;
  loginPending: (user: User, tokens: AuthTokens) => void;
  completeLogin: () => void;
  logout: () => void;
  refreshToken: (tokens: AuthTokens) => void;
  setRememberSession: (rememberSession: boolean) => void;
  setSelectedRegion: (region: ControlPlaneRegionId) => void;
  switchOrganization: (organization: Organization) => void;
  switchEnvironment: (environment: Environment) => void;
  loadSession: (user: User, tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  setOrganizations: (organizations: Organization[]) => void;
  setEnvironments: (environments: Environment[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  useRememberedAccount: (accountId: string) => void;
  removeRememberedAccount: (accountId: string) => void;
}

const initialState: AuthState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  rememberSession: false,
  selectedRegion: DEFAULT_REGION_ID,
  currentOrganization: null,
  currentEnvironment: null,
  organizations: [],
  environments: [],
  rememberedAccounts: {},
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

function buildRememberedAccountSnapshot(
  state: Pick<
    AuthState,
    | 'user'
    | 'tokens'
    | 'isAuthenticated'
    | 'selectedRegion'
    | 'currentOrganization'
    | 'currentEnvironment'
    | 'organizations'
    | 'environments'
  >,
): RememberedAccountSession | null {
  if (!state.user || !state.tokens) {
    return null;
  }

  return {
    accountId: state.user.id,
    user: state.user,
    tokens: state.tokens,
    isAuthenticated: state.isAuthenticated,
    selectedRegion: state.selectedRegion,
    currentOrganization: state.currentOrganization,
    currentEnvironment: state.currentEnvironment,
    organizations: state.organizations,
    environments: state.environments,
    updatedAt: new Date().toISOString(),
  };
}

function syncRememberedAccounts(
  state: AuthState,
  overrides?: Partial<AuthState>,
): Record<string, RememberedAccountSession> {
  const rememberedAccounts = { ...state.rememberedAccounts };
  const nextState = { ...state, ...overrides } as AuthState;
  const activeAccountId = nextState.user?.id;

  if (!activeAccountId) {
    return rememberedAccounts;
  }

  if (!nextState.rememberSession) {
    delete rememberedAccounts[activeAccountId];
    return rememberedAccounts;
  }

  const snapshot = buildRememberedAccountSnapshot(nextState);
  if (snapshot) {
    rememberedAccounts[activeAccountId] = snapshot;
  }

  return rememberedAccounts;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user, tokens) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          const nextState = {
            ...state,
            ...buildFreshSessionState(user, tokens, true),
          };
          return {
            ...buildFreshSessionState(user, tokens, true),
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      loginPending: (user, tokens) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          const nextState = {
            ...state,
            ...buildFreshSessionState(user, tokens, false),
          };
          return {
            ...buildFreshSessionState(user, tokens, false),
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      completeLogin: () =>
        set((state) => {
          const nextState = {
            ...state,
            isAuthenticated: true,
          };
          return {
            isAuthenticated: true,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      logout: () =>
        set((state) => {
          const nextRememberedAccounts = { ...state.rememberedAccounts };
          if (state.user?.id) {
            delete nextRememberedAccounts[state.user.id];
          }
          resetSessionScopedState(state.user?.id, null);
          return {
            ...initialState,
            rememberSession: state.rememberSession,
            selectedRegion: state.selectedRegion,
            rememberedAccounts: nextRememberedAccounts,
          };
        }),

      refreshToken: (tokens) =>
        set((state) => {
          const nextState = {
            ...state,
            tokens,
          };
          return {
            tokens,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      setRememberSession: (rememberSession) =>
        set({
          rememberSession,
        }),

      setSelectedRegion: (region) =>
        set((state) => {
          const nextState = {
            ...state,
            selectedRegion: region,
          };
          return {
            selectedRegion: region,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      switchOrganization: (organization) =>
        set((state) => {
          const nextState = {
            ...state,
            currentOrganization: organization,
            currentEnvironment: null,
            environments: [],
          };
          return {
            currentOrganization: organization,
            currentEnvironment: null,
            environments: [],
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      switchEnvironment: (environment) =>
        set((state) => {
          const nextState = {
            ...state,
            currentEnvironment: environment,
          };
          return {
            currentEnvironment: environment,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      loadSession: (user, tokens) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          const nextState = {
            ...state,
            ...buildFreshSessionState(user, tokens, true),
          };
          return {
            ...buildFreshSessionState(user, tokens, true),
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      setUser: (user) =>
        set((state) => {
          resetSessionScopedState(state.user?.id, user.id);
          const nextState = {
            ...state,
            user,
          };
          return {
            user,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      setOrganizations: (organizations) =>
        set((state) => {
          const nextState = {
            ...state,
            organizations,
          };
          return {
            organizations,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      setEnvironments: (environments) =>
        set((state) => {
          const nextState = {
            ...state,
            environments,
          };
          return {
            environments,
            rememberedAccounts: syncRememberedAccounts(nextState),
          };
        }),

      setIsLoading: (isLoading) =>
        set({
          isLoading,
        }),

      useRememberedAccount: (accountId) =>
        set((state) => {
          const rememberedAccount = state.rememberedAccounts[accountId];
          if (!rememberedAccount) {
            return {};
          }

          resetSessionScopedState(state.user?.id, rememberedAccount.user.id);
          return {
            user: rememberedAccount.user,
            tokens: rememberedAccount.tokens,
            isAuthenticated: rememberedAccount.isAuthenticated,
            isLoading: false,
            rememberSession: true,
            selectedRegion: rememberedAccount.selectedRegion,
            currentOrganization: rememberedAccount.currentOrganization,
            currentEnvironment: rememberedAccount.currentEnvironment,
            organizations: rememberedAccount.organizations,
            environments: rememberedAccount.environments,
            rememberedAccounts: {
              ...state.rememberedAccounts,
              [accountId]: {
                ...rememberedAccount,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),

      removeRememberedAccount: (accountId) =>
        set((state) => {
          const rememberedAccounts = { ...state.rememberedAccounts };
          delete rememberedAccounts[accountId];
          return {
            rememberedAccounts,
          };
        }),
    }),
    {
      name: 'anypoint-auth-v3',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => {
        const baseState = {
          selectedRegion: state.selectedRegion,
          rememberSession: state.rememberSession,
          rememberedAccounts: state.rememberedAccounts,
        };

        if (!state.rememberSession) {
          return baseState;
        }

        return {
          ...baseState,
          user: state.user,
          tokens: state.tokens,
          isAuthenticated: state.isAuthenticated,
          currentOrganization: state.currentOrganization,
          currentEnvironment: state.currentEnvironment,
          organizations: state.organizations,
          environments: state.environments,
        };
      },
    },
  ),
);
