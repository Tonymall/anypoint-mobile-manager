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
 * Uses a FRESH axios instance (not the configured `api`) to guarantee
 * no stale Authorization / org / env headers leak into the login request.
 *
 * Accepts an optional explicit base URL so the caller can pass the
 * region URL directly — this eliminates any chance of a stale module-level
 * `currentBaseUrl` causing 403 on re-login after sign-out.
 */
export async function login(
  credentials: LoginCredentials,
  explicitBaseUrl?: string,
): Promise<AuthTokens> {
  const baseURL = explicitBaseUrl ?? getBaseUrl();

  const { data } = await axios.post(
    `${baseURL}/accounts/login`,
    { username: credentials.username, password: credentials.password },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30000,
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
 * Uses the shared api instance (which now has the Authorization header set
 * directly in memory after login, not just in SecureStore).
 */
export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<any>(`${ACCOUNTS_BASE}/me`);
  // The /me endpoint returns { user: { ... } }
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
 */
export async function getOrganizations(): Promise<Organization[]> {
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
