// ============================================================
// Anypoint Mobile Platform - Base Axios API Client
// ============================================================
// Configured with interceptors for auth token injection,
// automatic token refresh, and error handling.
// ============================================================

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://anypoint.mulesoft.com';

const TOKEN_KEY = 'anypoint_access_token';
const REFRESH_TOKEN_KEY = 'anypoint_refresh_token';

// Create the base Axios instance
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

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
// Attach the access token to every outgoing request.

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getStoredAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------- Response Interceptor ----------
// Automatically attempt a token refresh on 401 responses.

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401 errors that haven't been retried yet
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue the request while a refresh is in progress
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            if (token && originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getStoredRefreshToken();
      if (!refreshToken) {
        await clearTokens();
        return Promise.reject(error);
      }

      const { data } = await axios.post(`${BASE_URL}/accounts/api/v2/oauth2/token`, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const newAccessToken: string = data.access_token;
      const newRefreshToken: string | undefined = data.refresh_token;

      await storeTokens(newAccessToken, newRefreshToken);
      processQueue(null, newAccessToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await clearTokens();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ---------- Convenience helpers ----------

export function setOrganizationHeader(orgId: string): void {
  api.defaults.headers.common['X-ANYPNT-ORG-ID'] = orgId;
}

export function setEnvironmentHeader(envId: string): void {
  api.defaults.headers.common['X-ANYPNT-ENV-ID'] = envId;
}

export { BASE_URL };
export default api;
