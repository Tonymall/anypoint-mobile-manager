// ============================================================
// MuleOps - OAuth Configuration
// ============================================================
// Connected App configuration for Authorization Code + PKCE flow.
// This flow uses the system browser (ASWebAuthenticationSession on iOS,
// Chrome Custom Tabs on Android) so that Salesforce MFA / biometric
// verification completes in the same browser context and the
// authenticated session is handed back to the app via redirect URI.
// ============================================================

import { makeRedirectUri } from 'expo-auth-session';

/**
 * The redirect URI the Anypoint Connected App must be configured with.
 * Uses the `muleops` scheme defined in app.json.
 *
 * Resolves to:
 *   - Native: muleops://auth/callback
 *   - Web (dev): http://localhost:8081/auth/callback
 */
export const REDIRECT_URI = makeRedirectUri({
  scheme: 'muleops',
  path: 'auth/callback',
});

/**
 * OAuth paths relative to the control-plane base URL.
 * These are the standard Anypoint Platform OAuth2 endpoints.
 */
export const OAUTH_PATHS = {
  authorization: '/accounts/api/v2/oauth2/authorize',
  token: '/accounts/api/v2/oauth2/token',
  revoke: '/accounts/api/v2/oauth2/revoke',
} as const;

/**
 * Connected App client ID.
 *
 * To create one:
 * 1. Go to Anypoint → Access Management → Connected Apps
 * 2. Create a new app with grant type "Authorization Code"
 * 3. Set the redirect URI to the value of REDIRECT_URI above
 * 4. Grant the required scopes
 * 5. Replace the placeholder below with the generated client ID
 */
export const OAUTH_CLIENT_ID = '__REPLACE_WITH_CONNECTED_APP_CLIENT_ID__';

/**
 * Scopes requested during authorization.
 * "full" gives complete access; narrow as needed.
 */
export const OAUTH_SCOPES = ['full'];
