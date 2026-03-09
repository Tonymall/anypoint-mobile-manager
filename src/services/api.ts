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
import logger from '../utils/logger';
import type { ControlPlaneRegionId } from '../types';

const TOKEN_KEY = 'anypoint_access_token';
const REFRESH_TOKEN_KEY = 'anypoint_refresh_token';
const REGION_KEY = 'anypoint_region';
const SESSION_MODE_KEY = 'anypoint_session_mode';
const XSRF_TOKEN_KEY = 'anypoint_xsrf_token';

let currentBaseUrl: string = getRegionUrl(DEFAULT_REGION_ID);

let inMemoryToken: string | null = null;
let inMemorySessionMode = false;
let inMemoryXsrfToken: string | null = null;

function isExpectedDiscoveryFailure(
  status: number,
  method: string,
  url: string,
): boolean {
  if (status !== 404 && status !== 405) return false;

  if (
    method === 'GET' &&
    (
      /\/cloudhub\/api\/v2\/applications\/[^/]+\/dashboardStats$/.test(url) ||
      /\/cloudhub\/api\/applications\/[^/]+\/dashboardStats$/.test(url) ||
      /\/monitoring\/api\/visualizer\/api\/datasources$/.test(url)
    )
  ) {
    return true;
  }

  if (
    method === 'POST' &&
    /\/monitoring\/archive\/api\/v1\/organizations\/.+\/environments\/.+\/query$/.test(url)
  ) {
    return true;
  }

  return false;
}

const api: AxiosInstance = axios.create({
  baseURL: currentBaseUrl,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

export async function setRegion(regionId: ControlPlaneRegionId): Promise<void> {
  currentBaseUrl = getRegionUrl(regionId);
  api.defaults.baseURL = currentBaseUrl;
  await SecureStore.setItemAsync(REGION_KEY, regionId);
}

export async function restoreRegion(): Promise<ControlPlaneRegionId> {
  const stored = await SecureStore.getItemAsync(REGION_KEY);
  const regionId = (stored as ControlPlaneRegionId) || DEFAULT_REGION_ID;
  currentBaseUrl = getRegionUrl(regionId);
  api.defaults.baseURL = currentBaseUrl;
  return regionId;
}

export function getBaseUrl(): string {
  return currentBaseUrl;
}

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
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    logger.warn('[storeTokens] Invalid accessToken — skipping SecureStore write');
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (refreshToken && typeof refreshToken === 'string') {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function storeSessionAuth(xsrfToken?: string): Promise<void> {
  inMemorySessionMode = true;
  await SecureStore.setItemAsync(SESSION_MODE_KEY, 'true');
  if (xsrfToken) {
    inMemoryXsrfToken = xsrfToken;
    await SecureStore.setItemAsync(XSRF_TOKEN_KEY, xsrfToken);
  }
}

export async function clearSessionAuth(): Promise<void> {
  inMemorySessionMode = false;
  inMemoryXsrfToken = null;
  await SecureStore.deleteItemAsync(SESSION_MODE_KEY);
  await SecureStore.deleteItemAsync(XSRF_TOKEN_KEY);
}

export function isSessionAuthEnabled(): boolean {
  return inMemorySessionMode;
}

export async function enableCookieSessionAuth(xsrfToken?: string): Promise<void> {
  inMemoryToken = null;
  delete api.defaults.headers.common['Authorization'];
  await storeSessionAuth(xsrfToken);
  api.defaults.withCredentials = true;
  if (xsrfToken) {
    api.defaults.headers.common['X-XSRF-TOKEN'] = xsrfToken;
  }
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.baseURL = currentBaseUrl;
    config.withCredentials = true;

    const isLoginRequest = config.url?.includes('/accounts/login');
    if (isLoginRequest) {
      delete config.headers.Authorization;
      return config;
    }

    if (inMemoryToken) {
      inMemorySessionMode = false;
      delete config.headers['X-XSRF-TOKEN'];
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    } else {
      try {
        const token = await getStoredAccessToken();
        if (token) {
          inMemorySessionMode = false;
          delete config.headers['X-XSRF-TOKEN'];
          config.headers.Authorization = `Bearer ${token}`;
          inMemoryToken = token;
        } else {
          const storedSessionMode = inMemorySessionMode ? 'true' : await SecureStore.getItemAsync(SESSION_MODE_KEY);
          if (storedSessionMode === 'true') {
            inMemorySessionMode = true;
            delete config.headers.Authorization;
            const xsrfToken = inMemoryXsrfToken ?? await SecureStore.getItemAsync(XSRF_TOKEN_KEY);
            if (xsrfToken) {
              inMemoryXsrfToken = xsrfToken;
              config.headers['X-XSRF-TOKEN'] = xsrfToken;
            }
          } else {
            logger.warn('[API Interceptor] No token in memory or SecureStore for:', config.url);
          }
        }
      } catch (error: any) {
        logger.warn(
          '[API Interceptor] SecureStore token read failed:',
          error?.message ?? 'unknown error',
        );
      }
    }

    const url = config.url ?? '';
    if (url.includes('/cloudhub/') || url.includes('/amc/')) {
      const hasAuth = !!config.headers.Authorization;
      const orgH = config.headers['X-ANYPNT-ORG-ID'] ?? api.defaults.headers.common['X-ANYPNT-ORG-ID'] ?? 'MISSING';
      const envH = config.headers['X-ANYPNT-ENV-ID'] ?? api.defaults.headers.common['X-ANYPNT-ENV-ID'] ?? 'MISSING';
      logger.log(`[API REQ] ${(config.method ?? 'GET').toUpperCase()} ${url} | Auth:${hasAuth ? 'YES' : 'NO'} Org:${orgH} Env:${envH}`);
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      const { status } = error.response;
      const url = error.config?.url ?? 'unknown';
      const method = (error.config?.method ?? 'GET').toUpperCase();
      if (isExpectedDiscoveryFailure(status, method, url)) {
        return Promise.reject(error);
      }
      logger.warn(
        `[API ${status}] ${method} ${url}`,
        typeof error.response.data === 'object'
          ? JSON.stringify(error.response.data).slice(0, 200)
          : '',
      );
    }
    return Promise.reject(error);
  },
);

export function setAuthHeader(token: string): void {
  inMemorySessionMode = false;
  inMemoryXsrfToken = null;
  inMemoryToken = token;
  delete api.defaults.headers.common['X-XSRF-TOKEN'];
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function setOrganizationHeader(orgId: string): void {
  api.defaults.headers.common['X-ANYPNT-ORG-ID'] = orgId;
}

export function setEnvironmentHeader(envId: string): void {
  api.defaults.headers.common['X-ANYPNT-ENV-ID'] = envId;
}

export function clearHeaders(): void {
  delete api.defaults.headers.common['X-ANYPNT-ORG-ID'];
  delete api.defaults.headers.common['X-ANYPNT-ENV-ID'];
}

export async function resetApiState(): Promise<void> {
  await clearTokens();
  await clearSessionAuth();

  inMemoryToken = null;
  inMemorySessionMode = false;
  inMemoryXsrfToken = null;

  delete api.defaults.headers.common['Authorization'];
  delete api.defaults.headers.common['X-XSRF-TOKEN'];
  delete api.defaults.headers.common['X-ANYPNT-ORG-ID'];
  delete api.defaults.headers.common['X-ANYPNT-ENV-ID'];
}

export default api;
