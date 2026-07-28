// ============================================================
// Anypoint Mobile Platform - Auth Mode State
// ============================================================
// Single owner of the in-memory credential mode used by the API
// client. Two mutually exclusive modes exist:
//   - bearer:  Authorization header from the stored access token
//   - session: cookie session + X-XSRF-TOKEN header (browser SSO)
// The Anypoint login response carries no refresh token, so there is
// no refresh flow here — see api.ts.
// ============================================================

import logger from '../utils/logger';

export interface AuthModeState {
  token: string | null;
  sessionMode: boolean;
  xsrfToken: string | null;
}

export const authState: AuthModeState = {
  token: null,
  sessionMode: false,
  xsrfToken: null,
};

/** Async reads of persisted credentials (SecureStore in the app, mocks in tests). */
export interface StoredCredentialReader {
  getAccessToken(): Promise<string | null>;
  getSessionMode(): Promise<string | null>;
  getXsrfToken(): Promise<string | null>;
}

export type RequestAuth =
  | { kind: 'login' }
  | { kind: 'bearer'; token: string }
  | { kind: 'session'; xsrfToken: string | null }
  | { kind: 'none' };

/**
 * Decide how to authenticate one outgoing request, refreshing the
 * in-memory state from persisted credentials when needed.
 * Bearer tokens always win over session mode.
 */
export async function resolveRequestAuth(
  url: string | undefined,
  store: StoredCredentialReader,
): Promise<RequestAuth> {
  if (url?.includes('/accounts/login')) {
    return { kind: 'login' };
  }

  if (authState.token) {
    authState.sessionMode = false;
    return { kind: 'bearer', token: authState.token };
  }

  try {
    const token = await store.getAccessToken();
    if (token) {
      authState.sessionMode = false;
      authState.token = token;
      return { kind: 'bearer', token };
    }

    const storedSessionMode = authState.sessionMode
      ? 'true'
      : await store.getSessionMode();
    if (storedSessionMode === 'true') {
      authState.sessionMode = true;
      const xsrfToken = authState.xsrfToken ?? (await store.getXsrfToken());
      if (xsrfToken) {
        authState.xsrfToken = xsrfToken;
      }
      return { kind: 'session', xsrfToken };
    }

    logger.warn('[API Interceptor] No token in memory or SecureStore for:', url);
    return { kind: 'none' };
  } catch (error: any) {
    logger.warn(
      '[API Interceptor] SecureStore token read failed:',
      error?.message ?? 'unknown error',
    );
    return { kind: 'none' };
  }
}
