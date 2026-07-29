// ============================================================
// OAuth redirect URL parsing
// ============================================================
// Kept out of the SSO screen so it can be tested without pulling in
// react-native-webview's native module.
// ============================================================

/** Where the OAuth implicit flow lands with the token in its fragment. */
export const SILENT_AUTH_CALLBACK_PATH = '/shared/silentAuthCallback.html';

/**
 * Pull `access_token` out of a silent-auth callback URL.
 *
 * The implicit flow returns it in the fragment; the callback page also
 * forwards a query string for the auth-code variant, so both are checked.
 * The fragment wins when both are present, matching the callback page's own
 * `window.location.hash || window.location.search` precedence.
 */
export function parseAccessTokenFromUrl(url: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const segments: string[] = [];

  if (hashIndex !== -1) segments.push(url.slice(hashIndex + 1));
  if (queryIndex !== -1) {
    segments.push(url.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex));
  }

  for (const segment of segments) {
    for (const pair of segment.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      let key: string;
      let value: string;
      try {
        key = decodeURIComponent(pair.slice(0, eq));
        value = decodeURIComponent(pair.slice(eq + 1));
      } catch {
        continue; // malformed escape — ignore this pair rather than throw
      }
      if (key === 'access_token' && value) return value;
    }
  }

  return null;
}

/**
 * Console OAuth clients to try, in order, for an implicit-flow token.
 *
 * Captured traffic shows the console asking for `response_type=token` with a
 * per-product client id. `anypoint_spa` answers the callback with no token —
 * it appears to be configured for auth-code + PKCE — so the others are tried
 * as fallbacks before giving up.
 */
export const SILENT_AUTH_CLIENT_IDS = [
  'anypoint_spa',
  'monitoring_center_ui',
  'cloudhub_ui',
] as const;

/** Build the implicit-flow authorize URL for a control plane. */
export function buildSilentAuthUrl(
  baseUrl: string,
  clientId: string = SILENT_AUTH_CLIENT_IDS[0],
): {
  authorizeUrl: string;
  callbackUrl: string;
} {
  const callbackUrl = `${baseUrl}${SILENT_AUTH_CALLBACK_PATH}`;
  return {
    callbackUrl,
    authorizeUrl:
      `${baseUrl}/accounts/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&response_type=token&redirect_uri=${encodeURIComponent(callbackUrl)}`,
  };
}
