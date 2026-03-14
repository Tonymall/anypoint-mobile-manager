// ============================================================
// MuleOps - Browser-Based Auth Service
// ============================================================
// Implements OAuth 2.0 Authorization Code + PKCE flow using
// the system browser. This ensures Salesforce MFA / identity
// verification happens in the same browser context, and the
// authenticated session is handed back to the app via the
// registered redirect URI (deep link).
//
// Uses expo-auth-session which leverages:
// - ASWebAuthenticationSession on iOS
// - Chrome Custom Tabs on Android
// Both share session cookies with the system browser, so MFA
// verification (Face ID, Touch ID, passkeys) works seamlessly.
//
// WHY THIS FIXES THE MFA SESSION HANDOFF PROBLEM:
// The existing WebView approach opens MFA verification in Safari,
// but the verified session stays in Safari — when the app tries to
// resume, Anypoint sees a new unauthenticated session.
//
// With this approach, the ENTIRE login flow (including MFA) runs
// in a single system browser session. After successful auth,
// Anypoint redirects to muleops://auth/callback?code=..., which
// expo-auth-session intercepts. We exchange the code for tokens
// natively — no session transfer needed.
// ============================================================

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { storeTokens, setAuthHeader } from './api';
import { getRegionUrl } from '../config/regions';
import {
  REDIRECT_URI,
  OAUTH_PATHS,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPES,
} from '../config/oauth';
import logger from '../utils/logger';
import type { AuthTokens, ControlPlaneRegionId } from '../types';

// Ensure any lingering browser sessions are cleaned up (Android)
WebBrowser.maybeCompleteAuthSession();

// ---------------------------------------------------------------------------
// Discovery document builder — constructs OAuth endpoints for a given region
// ---------------------------------------------------------------------------

export function getDiscovery(regionId: ControlPlaneRegionId): AuthSession.DiscoveryDocument {
  const baseUrl = getRegionUrl(regionId);
  return {
    authorizationEndpoint: `${baseUrl}${OAUTH_PATHS.authorization}`,
    tokenEndpoint: `${baseUrl}${OAUTH_PATHS.token}`,
    revocationEndpoint: `${baseUrl}${OAUTH_PATHS.revoke}`,
  };
}

// ---------------------------------------------------------------------------
// Full browser login flow (imperative version)
// ---------------------------------------------------------------------------

export interface BrowserLoginResult {
  tokens: AuthTokens;
}

/**
 * Launches the system browser for OAuth login with PKCE.
 *
 * Flow:
 * 1. Opens the Anypoint authorize URL in ASWebAuthenticationSession / Custom Tab
 * 2. User logs in (username/password, SSO, Salesforce MFA — all handled by browser)
 * 3. After successful auth, Anypoint redirects to muleops://auth/callback?code=…
 * 4. expo-auth-session intercepts the redirect and returns the authorization code
 * 5. We exchange the code for tokens via the token endpoint
 *
 * Because the browser is a system browser (not a WebView), the MFA verification
 * session is preserved throughout — no session isolation issue.
 */
export async function loginWithBrowser(
  regionId: ControlPlaneRegionId,
  providerHint?: string,
): Promise<BrowserLoginResult> {
  const discovery = getDiscovery(regionId);

  logger.log('[BrowserAuth] Starting OAuth Authorization Code + PKCE flow');
  logger.log('[BrowserAuth] Redirect URI:', REDIRECT_URI);
  logger.log('[BrowserAuth] Authorization endpoint:', discovery.authorizationEndpoint);

  const extraParams: Record<string, string> = {};
  if (providerHint) {
    // Anypoint supports identity_provider hint for SSO
    extraParams.identity_provider = providerHint;
  }

  const request = new AuthSession.AuthRequest({
    clientId: OAUTH_CLIENT_ID,
    scopes: OAUTH_SCOPES,
    redirectUri: REDIRECT_URI,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    extraParams,
  });

  // Open the system browser
  const result = await request.promptAsync(discovery);

  logger.log('[BrowserAuth] Auth result type:', result.type);

  if (result.type !== 'success' || !result.params.code) {
    if (result.type === 'cancel' || result.type === 'dismiss') {
      logger.log('[BrowserAuth] User cancelled authentication');
      throw new AuthCancelledError();
    }
    const errorDesc = result.type === 'error'
      ? result.params?.error_description ?? result.params?.error ?? 'Unknown error'
      : 'Authentication was not completed.';
    logger.error('[BrowserAuth] Auth failed:', errorDesc);
    throw new Error(errorDesc);
  }

  logger.log('[BrowserAuth] Authorization code received, exchanging for tokens');

  // Exchange authorization code for tokens
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: OAUTH_CLIENT_ID,
      code: result.params.code,
      redirectUri: REDIRECT_URI,
      extraParams: {
        code_verifier: request.codeVerifier ?? '',
      },
    },
    discovery,
  );

  logger.log('[BrowserAuth] Token exchange successful');

  const tokens: AuthTokens = {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken ?? undefined,
    tokenType: tokenResult.tokenType ?? 'bearer',
    expiresIn: tokenResult.expiresIn ?? 3600,
    expiresAt: tokenResult.issuedAt
      ? tokenResult.issuedAt * 1000 + (tokenResult.expiresIn ?? 3600) * 1000
      : Date.now() + (tokenResult.expiresIn ?? 3600) * 1000,
  };

  await storeTokens(tokens.accessToken, tokens.refreshToken);
  setAuthHeader(tokens.accessToken);

  logger.log('[BrowserAuth] Tokens stored and auth header set');

  return { tokens };
}

// ---------------------------------------------------------------------------
// Custom error for user cancellation
// ---------------------------------------------------------------------------

export class AuthCancelledError extends Error {
  constructor() {
    super('Authentication was cancelled by the user.');
    this.name = 'AuthCancelledError';
  }
}
