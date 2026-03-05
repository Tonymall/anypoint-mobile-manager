// ============================================================
// Anypoint Mobile Platform - Authentication Service
// ============================================================

import axios from 'axios';
import api, { storeTokens, clearTokens, clearHeaders, resetApiState, getBaseUrl, setAuthHeader } from './api';
import type {
  AuthTokens,
  LoginCredentials,
  User,
  Organization,
  BusinessGroup,
} from '../types';

const ACCOUNTS_BASE = '/accounts/api';

/**
 * Authenticate with username and password.
 *
 * CRITICAL FIX: The Anypoint Platform login endpoint has CSRF protection.
 * After a session is established (first login), the server sets CSRF cookies.
 * On re-login (after logout), stale cookies trigger CSRF validation, and
 * because we don't send a matching CSRF token header, we get 403
 * "invalid csrf token".
 *
 * The fix (matching the official Postman collection):
 * 1. Send credentials as `application/x-www-form-urlencoded` (not JSON)
 * 2. Add `X-Requested-With: XMLHttpRequest` header — this tells the server
 *    it's an API/AJAX request and bypasses CSRF validation
 * 3. Create a completely fresh axios instance to avoid stale cookies/headers
 */
export async function login(
  credentials: LoginCredentials,
  explicitBaseUrl?: string,
): Promise<AuthTokens> {
  const baseURL = explicitBaseUrl ?? getBaseUrl();

  // Create a completely fresh axios instance — no shared cookies/headers
  const freshClient = axios.create();

  // Build form-urlencoded body (matching the Postman collection format)
  const formBody = `username=${encodeURIComponent(credentials.username)}&password=${encodeURIComponent(credentials.password)}`;

  const { data } = await freshClient.post(
    `${baseURL}/accounts/login`,
    formBody,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        // X-Requested-With bypasses CSRF validation for AJAX/API requests
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 30000,
      // Prevent sending/receiving cookies that could trigger CSRF
      withCredentials: false,
    },
  );

  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type ?? 'bearer',
    expiresIn: data.expires_in ?? 3600,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  // Store tokens in SecureStore for persistence
  await storeTokens(tokens.accessToken, tokens.refreshToken);

  // ALSO set the Authorization header on the shared api instance immediately.
  // This ensures subsequent calls (e.g. getCurrentUser) don't depend on
  // SecureStore read timing — the token is available in memory right away.
  setAuthHeader(tokens.accessToken);

  return tokens;
}

/**
 * Log out by clearing tokens and headers.
 * We intentionally skip the server-side token-revocation call because it
 * goes through the Axios interceptor, which can trigger a refresh-loop
 * and leave stale state that causes 403 on the next login.
 */
export async function logout(): Promise<void> {
  await resetApiState();
}

/**
 * Refresh the current access token using a stored refresh token.
 */
export async function refreshToken(currentRefreshToken: string): Promise<AuthTokens> {
  // Use plain string encoding (URLSearchParams may not serialize in React Native)
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(currentRefreshToken)}`;

  const { data } = await api.post(`${ACCOUNTS_BASE}/v2/oauth2/token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const tokens: AuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type ?? 'bearer',
    expiresIn: data.expires_in,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  await storeTokens(tokens.accessToken, tokens.refreshToken);
  return tokens;
}

/**
 * Fetch the currently authenticated user's profile.
 *
 * Uses a FRESH axios instance with the token passed explicitly so there is
 * zero chance of stale interceptor / SecureStore state causing a 403.
 * Falls back to the shared `api` instance if the explicit call fails.
 */
export async function getCurrentUser(explicitToken?: string, explicitBaseUrl?: string): Promise<User> {
  // Strategy 1: fresh axios with explicit token + base URL (most reliable)
  if (explicitToken) {
    const baseURL = explicitBaseUrl ?? getBaseUrl();
    try {
      const { data } = await axios.get(`${baseURL}${ACCOUNTS_BASE}/me`, {
        headers: {
          Authorization: `Bearer ${explicitToken}`,
          Accept: 'application/json',
        },
        timeout: 30000,
      });
      return data.user ?? data;
    } catch (err: any) {
      // If the explicit call fails with 401/403, don't fall back — the token is bad
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        throw err;
      }
      // For network errors, fall through to shared instance
    }
  }

  // Strategy 2: shared api instance (interceptors inject token from SecureStore)
  const { data } = await api.get<any>(`${ACCOUNTS_BASE}/me`);
  return data.user ?? data;
}

/**
 * Switch the active organization context.
 */
export async function switchOrganization(organizationId: string): Promise<void> {
  await api.post(`${ACCOUNTS_BASE}/organizations/${organizationId}/switch`);
}

/**
 * List all organizations the current user belongs to.
 * Uses a fresh axios instance to avoid interceptor issues after re-login.
 */
export async function getOrganizations(): Promise<Organization[]> {
  // Try fresh axios first with stored token
  const baseURL = getBaseUrl();
  const { getStoredAccessToken } = require('./api');
  const token = await getStoredAccessToken();
  if (token) {
    try {
      const { data } = await axios.get(`${baseURL}${ACCOUNTS_BASE}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        timeout: 30000,
      });
      const user = data.user ?? data;
      return user.memberOfOrganizations ?? [];
    } catch (_) {
      // fall through to shared instance
    }
  }

  const { data } = await api.get<{ user: User }>(`${ACCOUNTS_BASE}/me`);
  return data.user.memberOfOrganizations ?? [];
}

/**
 * Get business groups for a given organization.
 */
export async function getBusinessGroups(
  organizationId: string,
): Promise<BusinessGroup[]> {
  const { data } = await api.get<BusinessGroup[]>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/hierarchy`,
  );
  return data;
}
