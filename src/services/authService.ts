// ============================================================
// Anypoint Mobile Platform - Authentication Service
// ============================================================

import api, { storeTokens, clearTokens } from './api';
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
 * Stores the returned tokens in secure storage.
 */
export async function login(credentials: LoginCredentials): Promise<AuthTokens> {
  const { data } = await api.post(`${ACCOUNTS_BASE}/v2/oauth2/token`, {
    grant_type: 'password',
    username: credentials.username,
    password: credentials.password,
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
 * Log out by revoking the current token and clearing secure storage.
 */
export async function logout(): Promise<void> {
  try {
    await api.post(`${ACCOUNTS_BASE}/v2/oauth2/revoke`);
  } finally {
    await clearTokens();
  }
}

/**
 * Refresh the current access token using a stored refresh token.
 */
export async function refreshToken(currentRefreshToken: string): Promise<AuthTokens> {
  const { data } = await api.post(`${ACCOUNTS_BASE}/v2/oauth2/token`, {
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
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
 */
export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<User>(`${ACCOUNTS_BASE}/me`);
  return data;
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
  return data.user.memberOfOrganizations;
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
