// ============================================================
// Anypoint Mobile Platform - Authentication Service
// ============================================================

import axios from 'axios';
import api, {
  storeTokens,
  resetApiState,
  getBaseUrl,
  setAuthHeader,
  getStoredAccessToken,
} from './api';
import logger from '../utils/logger';
import type {
  AuthTokens,
  LoginCredentials,
  User,
  Organization,
  BusinessGroup,
} from '../types';

const ACCOUNTS_BASE = '/accounts/api';

/**
 * Error thrown when login requires MFA verification via Salesforce Identity.
 * Carries the verification URL and request JWT needed to complete the flow.
 */
export class MFARequiredError extends Error {
  verifyUrl: string;
  requestToken: string;
  constructor(verifyUrl: string, requestToken: string) {
    super('MFA verification required');
    this.name = 'MFARequiredError';
    this.verifyUrl = verifyUrl;
    this.requestToken = requestToken;
  }
}

export interface PendingMFAChallenge {
  verifyUrl: string;
  requestToken: string;
}

let pendingMFAChallenge: PendingMFAChallenge | null = null;

export function setPendingMFAChallenge(challenge: PendingMFAChallenge): void {
  pendingMFAChallenge = challenge;
}

export function getPendingMFAChallenge(): PendingMFAChallenge | null {
  return pendingMFAChallenge;
}

export function clearPendingMFAChallenge(): void {
  pendingMFAChallenge = null;
}

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

  // Detect Salesforce Identity Verification (MFA) challenge.
  // When MFA is required, the server returns 200 with:
  //   { url: "https://verify.salesforce.com/verify/", body: { request: "JWT" } }
  // instead of an access_token.
  if (data.url && data.body?.request && !data.access_token) {
    logger.log('[Login] MFA challenge detected — Salesforce verification required');
    logger.log('[Login] Verify URL:', data.url);
    throw new MFARequiredError(data.url, data.body.request);
  }

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
 * Authenticate using Connected Apps (OAuth2 client_credentials flow).
 *
 * Uses a fresh axios instance (no shared cookies/headers) and posts
 * client_id + client_secret as form-urlencoded to the OAuth2 token endpoint.
 */
export async function loginWithConnectedApp(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<AuthTokens> {
  const freshClient = axios.create();
  const body =
    `client_id=${encodeURIComponent(clientId)}` +
    `&client_secret=${encodeURIComponent(clientSecret)}` +
    `&grant_type=client_credentials`;

  const requestConfig = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 45000,
    withCredentials: false,
  };

  let data: any;
  try {
    const response = await freshClient.post(
      `${baseUrl}/accounts/api/v2/oauth2/token`,
      body,
      requestConfig,
    );
    data = response.data;
  } catch (error: any) {
    const isTimeout =
      error?.code === 'ECONNABORTED' ||
      String(error?.message ?? '').toLowerCase().includes('timeout');

    if (!isTimeout) {
      throw error;
    }

    logger.warn('[ConnectedApp] Token request timed out, retrying once');
    const retryResponse = await freshClient.post(
      `${baseUrl}/accounts/api/v2/oauth2/token`,
      body,
      {
        ...requestConfig,
        timeout: 60000,
      },
    );
    data = retryResponse.data;
  }

  const tokens: AuthTokens = {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bearer',
    expiresIn: data.expires_in ?? 3600,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return tokens;
}

/**
 * Verify MFA code using Salesforce Identity Verification (VaaS).
 *
 * The flow is a two-step process:
 * 1. POST { request: JWT, code } to Salesforce verify endpoint
 *    → returns { request: "VERIFIED_JWT" }
 * 2. POST request=VERIFIED_JWT to Anypoint /accounts/login
 *    → returns { access_token: "..." }
 */
export async function verifyMFA(
  username: string,
  password: string,
  code: string,
  baseUrl?: string,
  verificationContext?: { url: string; request: string },
): Promise<AuthTokens> {
  const baseURL = baseUrl ?? getBaseUrl();
  const freshClient = axios.create();

  if (!verificationContext?.url || !verificationContext?.request) {
    throw new Error('MFA verification context missing — please login again.');
  }

  const { url: verifyUrl, request: requestToken } = verificationContext;

  // ── Step 1: Submit code to Salesforce verify endpoint ──
  // Salesforce VaaS processes the code and returns { request: "VERIFIED_JWT" }.
  // The verified JWT may look identical to the original (verification state is
  // tracked server-side), so we ALWAYS proceed to Step 2 with whatever
  // `request` value Salesforce returns.
  //
  // IMPORTANT: TOTP codes are single-use — only submit ONE request to avoid
  // burning the code on multiple attempts.
  logger.log('[MFA] Step 1: Submitting code to Salesforce verify endpoint');
  logger.log('[MFA] Verify URL:', verifyUrl);
  logger.log('[MFA] Original request JWT length:', requestToken.length);

  let sfResponseJWT: string | null = null;

  // Helper: extract JWT or access token from a Salesforce response
  const extractSFResult = (data: any): { jwt?: string; tokens?: AuthTokens } => {
    // Direct access token
    const directToken = data?.access_token ?? data?.token ?? data?.accessToken;
    if (directToken && typeof directToken === 'string') {
      return {
        tokens: {
          accessToken: directToken,
          refreshToken: data?.refresh_token,
          tokenType: data?.token_type ?? 'bearer',
          expiresIn: data?.expires_in ?? 3600,
          expiresAt: Date.now() + (data?.expires_in ?? 3600) * 1000,
        },
      };
    }
    // Verified JWT
    if (data?.request && typeof data.request === 'string') {
      return { jwt: data.request };
    }
    return {};
  };

  // Helper: check if response is HTML (not JSON)
  const isHTMLResponse = (data: any): boolean => {
    return typeof data === 'string' && data.trim().startsWith('<');
  };

  // Try multiple strategies to submit the code to Salesforce.
  // Strategy 1: JSON with X-Requested-With (forces API response, not HTML)
  // Strategy 2: Form-encoded (matches browser form submission)
  // Strategy 3: JSON with different code field names
  //
  // If strategy 1 gets an HTML response (not JSON), the code was NOT consumed
  // and we can safely retry with a different approach.
  const sfAttempts: Array<{
    label: string;
    body: string;
    ct: string;
    skipIfHadJSON?: boolean;
  }> = [
    // JSON with X-Requested-With — forces JSON API response from Salesforce
    {
      label: 'sf-json-xhr',
      body: JSON.stringify({ request: requestToken, code }),
      ct: 'application/json',
    },
    // Form-encoded — matches browser form submission
    {
      label: 'sf-form-code',
      body: `request=${encodeURIComponent(requestToken)}&code=${encodeURIComponent(code)}`,
      ct: 'application/x-www-form-urlencoded',
    },
    // Form-encoded with 'passcode' field (some SF setups use this)
    {
      label: 'sf-form-passcode',
      body: `request=${encodeURIComponent(requestToken)}&passcode=${encodeURIComponent(code)}`,
      ct: 'application/x-www-form-urlencoded',
      skipIfHadJSON: true, // Only try if previous attempts returned HTML
    },
  ];

  let hadJSONResponse = false;

  for (const attempt of sfAttempts) {
    if (sfResponseJWT) break;
    if (attempt.skipIfHadJSON && hadJSONResponse) continue;

    try {
      logger.log(`[MFA] SF ${attempt.label}: posting to ${verifyUrl}`);

      const resp = await freshClient.post(verifyUrl, attempt.body, {
        headers: {
          'Content-Type': attempt.ct,
          Accept: 'application/json',
          // X-Requested-With tells Salesforce to return JSON, not HTML
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 30000,
        maxRedirects: 0,
        validateStatus: (s: number) => s < 500,
      });

      const data = resp.data;

      // Check if we got HTML instead of JSON
      if (isHTMLResponse(data)) {
        logger.warn(`[MFA] SF ${attempt.label}: got HTML response (not JSON), trying next strategy`);
        continue; // Code was NOT consumed — try different approach
      }

      hadJSONResponse = true;
      logger.log(`[MFA] SF ${attempt.label}: status=${resp.status}, keys=${Object.keys(data ?? {}).join(',')}`);

      const result = extractSFResult(data);

      if (result.tokens) {
        logger.log('[MFA] Got direct access token from Salesforce!');
        await storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
        setAuthHeader(result.tokens.accessToken);
        return result.tokens;
      }

      if (result.jwt) {
        const isSame = result.jwt === requestToken;
        logger.log(`[MFA] Got JWT from Salesforce (length: ${result.jwt.length}, same_as_original: ${isSame})`);
        sfResponseJWT = result.jwt;
        break; // Don't burn the code on more attempts
      }

      // Check for a redirect (e.g., back to Anypoint after verification)
      if (resp.status >= 300 && resp.status < 400 && resp.headers?.location) {
        logger.log('[MFA] Salesforce redirect to:', resp.headers.location.slice(0, 120));
        try {
          const redirResp = await freshClient.get(resp.headers.location, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            timeout: 30000,
            maxRedirects: 5,
          });
          const redirResult = extractSFResult(redirResp.data);
          if (redirResult.tokens) {
            await storeTokens(redirResult.tokens.accessToken, redirResult.tokens.refreshToken);
            setAuthHeader(redirResult.tokens.accessToken);
            return redirResult.tokens;
          }
          if (redirResult.jwt) {
            sfResponseJWT = redirResult.jwt;
            break;
          }
        } catch (_) { /* fall through */ }
      }

      logger.warn(`[MFA] SF ${attempt.label}: unexpected response:`, JSON.stringify(data).slice(0, 300));
      // If we got a JSON response but no JWT, don't try more (code may be consumed)
      break;
    } catch (err: any) {
      logger.warn(`[MFA] SF ${attempt.label}: ${err?.response?.status ?? err?.message}`);
      if (err?.response?.data) {
        const errData = err.response.data;
        if (isHTMLResponse(errData)) {
          logger.warn(`[MFA] SF ${attempt.label}: error response is HTML, trying next`);
          continue;
        }
        logger.warn('[MFA] SF error body:', JSON.stringify(errData).slice(0, 300));
      }
      if (!err?.response?.status) throw err;
    }
  }

  // ── Step 2: Submit the JWT back to Anypoint to get access token ──
  // Try with both the SF-returned JWT and the original request token.
  // The server-side verification state has changed after Step 1, so even
  // the original JWT may now resolve to an access token.
  const jwtsToTry: Array<{ label: string; jwt: string }> = [];
  if (sfResponseJWT && sfResponseJWT !== requestToken) {
    jwtsToTry.push({ label: 'sf-verified', jwt: sfResponseJWT });
  }
  if (sfResponseJWT) {
    jwtsToTry.push({ label: 'sf-response', jwt: sfResponseJWT });
  }
  // Always try the original token too — verification state is server-side
  jwtsToTry.push({ label: 'original', jwt: requestToken });

  // Deduplicate by jwt value
  const seenJWTs = new Set<string>();
  const uniqueJWTs = jwtsToTry.filter(({ jwt }) => {
    if (seenJWTs.has(jwt)) return false;
    seenJWTs.add(jwt);
    return true;
  });

  for (const { label: jwtLabel, jwt } of uniqueJWTs) {
    logger.log(`[MFA] Step 2: Trying ${jwtLabel} JWT (length: ${jwt.length}) against Anypoint login`);

    const apAttempts: Array<{ label: string; body: string; ct: string }> = [
      // Form-encoded with just the request JWT
      { label: `ap-${jwtLabel}-form`, body: `request=${encodeURIComponent(jwt)}`, ct: 'application/x-www-form-urlencoded' },
      // Form-encoded with credentials + request JWT
      { label: `ap-${jwtLabel}-full`, body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&request=${encodeURIComponent(jwt)}`, ct: 'application/x-www-form-urlencoded' },
      // JSON with the request JWT
      { label: `ap-${jwtLabel}-json`, body: JSON.stringify({ request: jwt }), ct: 'application/json' },
    ];

    for (const attempt of apAttempts) {
      try {
        const resp = await freshClient.post(`${baseURL}/accounts/login`, attempt.body, {
          headers: {
            'Content-Type': attempt.ct,
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 30000,
          withCredentials: false,
          maxRedirects: 5,
          validateStatus: (s: number) => s < 500,
        });

        logger.log(`[MFA] ${attempt.label}: status=${resp.status}, keys=${Object.keys(resp.data ?? {}).join(',')}`);
      logger.log(`[MFA] ${attempt.label}: preview=${typeof resp.data === 'object' ? JSON.stringify(resp.data).slice(0, 600) : String(resp.data).slice(0, 600)}`);

        const data = resp.data;
        const accessToken = data?.access_token ?? data?.token ?? data?.accessToken;

        if (accessToken && typeof accessToken === 'string' && accessToken.length > 0) {
          logger.log(`[MFA] SUCCESS! Got access token via ${attempt.label} (length: ${accessToken.length})`);
          const tokens: AuthTokens = {
            accessToken,
            refreshToken: data?.refresh_token ?? data?.refreshToken,
            tokenType: data?.token_type ?? 'bearer',
            expiresIn: data?.expires_in ?? 3600,
            expiresAt: Date.now() + (data?.expires_in ?? 3600) * 1000,
          };
          await storeTokens(tokens.accessToken, tokens.refreshToken);
          setAuthHeader(tokens.accessToken);
          return tokens;
        }

        // If we get another MFA challenge, the JWT wasn't verified yet
        if (data?.url && data?.body?.request) {
          logger.warn(`[MFA] ${attempt.label}: got another MFA challenge — JWT not yet verified`);
          // Don't try more formats for this JWT, move to next JWT
          break;
        }
      } catch (err: any) {
        logger.warn(`[MFA] ${attempt.label}: ${err?.response?.status ?? err?.message}`);
        if (!err?.response?.status) break;
      }
    }
  }

  throw new Error('MFA verification failed — could not obtain access token. Check console logs for details. The code may be incorrect or expired.');
}

/**
 * Log out by clearing tokens and headers.
 * We intentionally skip the server-side token-revocation call because it
 * goes through the Axios interceptor, which can trigger a refresh-loop
 * and leave stale state that causes 403 on the next login.
 */
export async function completeMFAWithRequestToken(
  username: string,
  password: string,
  requestToken: string,
  baseUrl?: string,
): Promise<AuthTokens> {
  const baseURL = baseUrl ?? getBaseUrl();
  const freshClient = axios.create();

  const pendingTokens: Array<{ label: string; jwt: string }> = [
    { label: 'verified', jwt: requestToken },
  ];
  const seenTokens = new Set<string>();

  while (pendingTokens.length > 0) {
    const current = pendingTokens.shift()!;
    if (!current.jwt || seenTokens.has(current.jwt)) continue;
    seenTokens.add(current.jwt);

    logger.log(`[MFA] Completing login with ${current.label} request token (length: ${current.jwt.length})`);

    const apAttempts: Array<{ label: string; body: string; ct: string }> = [
      {
        label: `ap-${current.label}-form`,
        body: `request=${encodeURIComponent(current.jwt)}`,
        ct: 'application/x-www-form-urlencoded',
      },
      {
        label: `ap-${current.label}-full`,
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&request=${encodeURIComponent(current.jwt)}`,
        ct: 'application/x-www-form-urlencoded',
      },
      {
        label: `ap-${current.label}-json`,
        body: JSON.stringify({ request: current.jwt }),
        ct: 'application/json',
      },
    ];

    for (const attempt of apAttempts) {
      try {
        const resp = await freshClient.post(`${baseURL}/accounts/login`, attempt.body, {
          headers: {
            'Content-Type': attempt.ct,
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 30000,
          withCredentials: false,
          maxRedirects: 5,
          validateStatus: (s: number) => s < 500,
        });

        logger.log(`[MFA] ${attempt.label}: status=${resp.status}, keys=${Object.keys(resp.data ?? {}).join(',')}`);
        logger.log(`[MFA] ${attempt.label}: preview=${typeof resp.data === 'object' ? JSON.stringify(resp.data).slice(0, 600) : String(resp.data).slice(0, 600)}`);

        const data = resp.data;
        const accessToken = data?.access_token ?? data?.token ?? data?.accessToken;
        if (accessToken && typeof accessToken === 'string' && accessToken.length > 0) {
          const tokens: AuthTokens = {
            accessToken,
            refreshToken: data?.refresh_token ?? data?.refreshToken,
            tokenType: data?.token_type ?? 'bearer',
            expiresIn: data?.expires_in ?? 3600,
            expiresAt: Date.now() + (data?.expires_in ?? 3600) * 1000,
          };
          await storeTokens(tokens.accessToken, tokens.refreshToken);
          setAuthHeader(tokens.accessToken);
          return tokens;
        }

        if (data?.url && data?.body?.request) {
          const nextRequest = String(data.body.request);
          logger.warn(`[MFA] ${attempt.label}: got another MFA challenge`);
          logger.warn(`[MFA] ${attempt.label}: challenge url=${data.url}`);
          logger.warn(`[MFA] ${attempt.label}: challenge body preview=${JSON.stringify(data.body).slice(0, 400)}`);
          logger.warn(`[MFA] ${attempt.label}: next request length=${nextRequest.length}, same_as_input=${nextRequest === current.jwt}`);
          if (!seenTokens.has(nextRequest)) {
            pendingTokens.push({ label: `${current.label}-next`, jwt: nextRequest });
          }
          break;
        }
      } catch (err: any) {
        logger.warn(`[MFA] ${attempt.label}: ${err?.response?.status ?? err?.message}`);
        if (!err?.response?.status) break;
      }
    }
  }

  throw new Error('MFA verification succeeded, but Anypoint did not return an access token.');
}
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




