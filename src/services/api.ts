// ============================================================
// Anypoint Mobile Platform - Base Axios API Client
// ============================================================
// Configured with a request interceptor for auth token injection.
// Supports multi-region control planes (US, EU1, CA1, JP1).
//
// IMPORTANT: The Anypoint Platform login response does NOT include
// a refresh token. Therefore there is NO response interceptor for
// automatic 401 refresh — the previous implementation caused a
// cascade of token-clearing that led to 403 errors on re-login.
// ============================================================

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import * as SecureStore from 'expo-secure-store';

import { DEFAULT_REGION_ID, getRegionUrl } from '../config/regions';
import type { ControlPlaneRegionId } from '../types';

const TOKEN_KEY = 'anypoint_access_token';
const REFRESH_TOKEN_KEY = 'anypoint_refresh_token';
const REGION_KEY = 'anypoint_region';

// --- Mutable base URL driven by selected region ---
let currentBaseUrl: string = getRegionUrl(DEFAULT_REGION_ID);

// --- In-memory token cache (fastest, no async) ---
// Set by setAuthHeader() during login, cleared by resetApiState().
// The request interceptor uses this FIRST, then falls back to SecureStore.
let inMemoryToken: string | null = null;

// Create the base Axios instance
const api: AxiosInstance = axios.create({
  baseURL: currentBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ---------- Region helpers ----------

/**
 * Switch the control plane region.
 * Updates the base URL used by all subsequent requests and persists the
 * selection so it survives app restarts.
 */
export async function setRegion(regionId: ControlPlaneRegionId): Promise<void> {
  currentBaseUrl = getRegionUrl(regionId);
  api.defaults.baseURL = currentBaseUrl;
  await SecureStore.setItemAsync(REGION_KEY, regionId);
}

/**
 * Load the persisted region (if any) and apply it.
 * Call this once on app startup before any API calls.
 */
export async function restoreRegion(): Promise<ControlPlaneRegionId> {
  const stored = await SecureStore.getItemAsync(REGION_KEY);
  const regionId = (stored as ControlPlaneRegionId) || DEFAULT_REGION_ID;
  currentBaseUrl = getRegionUrl(regionId);
  api.defaults.baseURL = currentBaseUrl;
  return regionId;
}

/**
 * Get the current base URL.
 */
export function getBaseUrl(): string {
  return currentBaseUrl;
}

// ---------- Token helpers ----------

export async function getStoredAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function storeTokens(
  accessToken: string,
  refreshToken?: string,
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// ---------- Request Interceptor ----------
// Attach the access token and ensure baseURL is current.

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Always use the latest base URL (region may have changed)
    config.baseURL = currentBaseUrl;

    // Skip auth header for login endpoint
    const isLoginRequest = config.url?.includes('/accounts/login');
    if (isLoginRequest) {
      delete config.headers.Authorization;
      return config;
    }

    // Token injection priority:
    // 1. In-memory cache (synchronous, set by setAuthHeader during login)
    // 2. SecureStore (async, persisted across app restarts)
    if (inMemoryToken) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    } else {
      try {
        const token = await getStoredAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          // Cache for next request
          inMemoryToken = token;
        } else {
          console.warn('[API Interceptor] No token in memory or SecureStore for:', config.url);
        }
      } catch (_) {
        // SecureStore read failed — proceed without token
      }
    }

    // Log CloudHub requests with full header state for 403 debugging
    const url = config.url ?? '';
    if (url.includes('/cloudhub/') || url.includes('/amc/')) {
      const hasAuth = !!config.headers.Authorization;
      const orgH = config.headers['X-ANYPNT-ORG-ID'] ?? api.defaults.headers.common['X-ANYPNT-ORG-ID'] ?? 'MISSING';
      const envH = config.headers['X-ANYPNT-ENV-ID'] ?? api.defaults.headers.common['X-ANYPNT-ENV-ID'] ?? 'MISSING';
      console.log(`[API REQ] ${(config.method ?? 'GET').toUpperCase()} ${url} | Auth:${hasAuth ? 'YES' : 'NO'} Org:${orgH} Env:${envH}`);
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------- Response Interceptor ----------
// Simple error logging — NO automatic refresh or token clearing.
// The Anypoint login API does NOT provide refresh tokens, so any
// 401-refresh logic only causes harmful cascades.

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Log failed requests for debugging (visible in Expo DevTools / Metro)
    if (error.response) {
      const { status } = error.response;
      const url = error.config?.url ?? 'unknown';
      const method = (error.config?.method ?? 'GET').toUpperCase();
      console.warn(
        `[API ${status}] ${method} ${url}`,
        typeof error.response.data === 'object'
          ? JSON.stringify(error.response.data).slice(0, 200)
          : '',
      );
    }
    return Promise.reject(error);
  },
);

// ---------- Convenience helpers ----------

/**
 * Set the Authorization header directly on the api instance.
 * Called after login to make the token immediately available in memory
 * without relying on SecureStore read timing.
 */
export function setAuthHeader(token: string): void {
  inMemoryToken = token;
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function setOrganizationHeader(orgId: string): void {
  api.defaults.headers.common['X-ANYPNT-ORG-ID'] = orgId;
}

export function setEnvironmentHeader(envId: string): void {
  api.defaults.headers.common['X-ANYPNT-ENV-ID'] = envId;
}

/**
 * Clear all custom headers (org, env) from the Axios defaults.
 * Call this during logout to prevent stale headers on re-login.
 */
export function clearHeaders(): void {
  delete api.defaults.headers.common['X-ANYPNT-ORG-ID'];
  delete api.defaults.headers.common['X-ANYPNT-ENV-ID'];
}

/**
 * Full reset of API client state.
 * Clears tokens from SecureStore AND in-memory cache, removes ALL
 * custom headers (including Authorization).
 * Call this during logout AND before login to guarantee a clean slate.
 */
export async function resetApiState(): Promise<void> {
  // 1. Clear tokens from SecureStore
  await clearTokens();

  // 2. Clear in-memory token cache
  inMemoryToken = null;

  // 3. Clear ALL custom headers — including Authorization
  delete api.defaults.headers.common['Authorization'];
  delete api.defaults.headers.common['X-ANYPNT-ORG-ID'];
  delete api.defaults.headers.common['X-ANYPNT-ENV-ID'];
}

export default api;
