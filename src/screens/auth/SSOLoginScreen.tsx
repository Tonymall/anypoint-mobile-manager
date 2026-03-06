// ============================================================
// Anypoint Mobile Platform - SSO / Browser Login Screen
// WebView-based authentication flow supporting MFA, SSO,
// and standard username/password login via the Anypoint web UI.
//
// The WebView handles all cookie-based session management.
// User profile + org list are extracted INSIDE the WebView
// to avoid native Axios calls that can't access WebView cookies.
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Text,
  useTheme,
  Appbar,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { WebView, type WebViewNavigation, type WebViewMessageEvent } from 'react-native-webview';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../stores';
import { getBaseUrl, setAuthHeader, storeTokens } from '../../services/api';
import type { AuthTokens } from '../../types';
import logger from '../../utils/logger';

// ── JavaScript injected after the user completes web-based login ──
// Extracts EVERYTHING from within the WebView cookie context:
//   1. Bearer token (from cookies or API response)
//   2. User profile (from /accounts/api/me)
//   3. Organization list (embedded in user profile)
//
// This avoids native Axios calls that can't access WebView cookies.
const INJECTED_JS = `
  (function() {
    try {
      // Step 1: Fetch full user profile using session cookies
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/accounts/api/me', false);
      xhr.withCredentials = true;
      xhr.send();

      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        var user = data.user || data;
        var orgs = user.memberOfOrganizations || [];

        // Step 2: Try to extract a bearer token from cookies
        var token = null;
        try {
          var cookies = document.cookie.split(';');
          for (var i = 0; i < cookies.length; i++) {
            var c = cookies[i].trim();
            if (c.startsWith('access_token=') || c.startsWith('_access_token=')) {
              token = c.split('=')[1];
              break;
            }
          }
        } catch(cookieErr) {}

        // Also check if the /me response itself contained a token
        if (!token && data.access_token) token = data.access_token;
        if (!token && user.properties && user.properties.cs_token) token = user.properties.cs_token;

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'auth_complete',
          user: user,
          organizations: orgs,
          token: token,
        }));
        return;
      }
    } catch(e) {}

    // Fallback: try cookie-only token extraction
    try {
      var cookies = document.cookie.split(';');
      var token = null;
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].trim();
        if (c.startsWith('access_token=') || c.startsWith('_access_token=')) {
          token = c.split('=')[1];
          break;
        }
      }
      if (token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'token_only',
          token: token,
        }));
        return;
      }
    } catch(e) {}

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'extraction_failed',
      cookies: document.cookie ? 'present' : 'empty',
    }));
  })();
  true;
`;

// URL path segments that indicate a successful post-login redirect
const POST_LOGIN_PATHS = [
  '/home/',
  '/home',
  '/accounts/',
  '/exchange/',
  '/apimanager/',
  '/cloudhub/',
  '/design-center/',
  '/runtime-manager/',
  '/visualizer/',
  '/monitoring/',
  '/api-manager/',
  '/access-management/',
];

const SSOLoginScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const webViewRef = useRef<WebView>(null);

  // ── Auth store ──
  const loginPending = useAuthStore((state) => state.loginPending);
  const setOrganizations = useAuthStore((state) => state.setOrganizations);

  // ── State ──
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [webViewKey, setWebViewKey] = useState(1);

  const hasInjectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const baseUrl = getBaseUrl();
  const loginUrl = `${baseUrl}/accounts/login`;

  // ── Determine if a URL is a post-login page ──
  const isPostLoginUrl = useCallback(
    (url: string): boolean => {
      if (!url) return false;
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const path = parsed.pathname;

        // Don't trigger extraction on MFA / verification pages
        if (
          host.includes('verify.salesforce.com') ||
          host.includes('login.salesforce.com') ||
          path.includes('/verify') ||
          path.includes('/mfa')
        ) {
          return false;
        }

        // Still on the login page — not post-login
        if (path === '/accounts/login' || path === '/accounts/login/') {
          return false;
        }
        // Check against known post-login paths
        if (POST_LOGIN_PATHS.some((p) => path.startsWith(p))) {
          return true;
        }
        // Also detect any path that is NOT the login page on the same domain
        if (
          parsed.origin === baseUrl &&
          path !== '/accounts/login' &&
          !path.startsWith('/accounts/login')
        ) {
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [baseUrl],
  );

  // ── Complete auth using data extracted FROM the WebView ──
  const completeAuthentication = useCallback(
    async (payload: {
      user: any;
      organizations?: any[];
      token?: string | null;
    }) => {
      setIsExtracting(true);
      try {
        const { user, organizations, token } = payload;

        if (!user || typeof user !== 'object') {
          throw new Error('No user profile data received from browser session.');
        }

        // A bearer token is REQUIRED — the native app uses Axios with
        // Authorization headers for every API call. Cookie-only sessions
        // from the WebView cannot be shared with native HTTP clients.
        if (!token || typeof token !== 'string' || token.length === 0) {
          logger.warn('[SSO] No bearer token extracted — cannot proceed');
          throw new Error(
            'Could not extract an access token from the browser session. ' +
            'Please try signing in with username and password instead.',
          );
        }

        const accessToken = token;
        setAuthHeader(accessToken);
        try {
          await storeTokens(accessToken);
        } catch (storeError: any) {
          logger.warn('[SSO] storeTokens failed:', storeError?.message);
        }
        logger.log('[SSO] Bearer token stored');

        const tokens: AuthTokens = {
          accessToken,
          tokenType: 'bearer',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        };

        const orgs = organizations ?? user.memberOfOrganizations ?? [];

        loginPending(user, tokens);
        if (orgs.length > 0) {
          setOrganizations(orgs);
        }

        logger.log('[SSO] Authentication complete, navigating to org selection');
        router.replace('/(auth)/select-org');
      } catch (error: any) {
        logger.error('[SSO] Authentication failed:', error?.message);
        setErrorMessage('Authentication failed. Please try again.');
        setSnackbarVisible(true);
        hasInjectedRef.current = false;
        retryCountRef.current = 0;
        setIsExtracting(false);
      }
    },
    [loginPending, setOrganizations, router],
  );

  // ── Handle token-only extraction (no user data from WebView) ──
  const completeWithTokenOnly = useCallback(
    async (token: string) => {
      setIsExtracting(true);
      try {
        setAuthHeader(token);
        await storeTokens(token);

        // We have a bearer token, so native Axios calls will work
        const authService = require('../../services/authService');
        const user = await authService.getCurrentUser(token, baseUrl);
        const orgs = user.memberOfOrganizations ?? [];

        const tokens: AuthTokens = {
          accessToken: token,
          tokenType: 'bearer',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        };

        loginPending(user, tokens);
        if (orgs.length > 0) {
          setOrganizations(orgs);
        }

        logger.log('[SSO] Token-only authentication complete');
        router.replace('/(auth)/select-org');
      } catch (error: any) {
        logger.error('[SSO] Token-only auth failed:', error?.message);
        setErrorMessage('Authentication failed. Please try again.');
        setSnackbarVisible(true);
        hasInjectedRef.current = false;
        retryCountRef.current = 0;
        setIsExtracting(false);
      }
    },
    [baseUrl, loginPending, setOrganizations, router],
  );

  // ── Handle navigation changes — detect post-login redirect ──
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState;
      if (!url || hasInjectedRef.current) return;

      // Let the user complete MFA / verification — do NOT inject extraction JS
      if (
        url.includes('verify.salesforce.com') ||
        url.includes('login.salesforce.com') ||
        url.includes('/verify') ||
        url.includes('/mfa')
      ) {
        logger.log('[SSO] MFA/verification page — waiting for user');
        return;
      }

      if (isPostLoginUrl(url)) {
        logger.log('[SSO] Post-login redirect detected');
        hasInjectedRef.current = true;
        retryCountRef.current = 0;
        // Give the page a moment to settle, then inject extraction script
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(INJECTED_JS);
        }, 2500);
      }
    },
    [isPostLoginUrl],
  );

  // ── Handle messages from injected JavaScript ──
  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        logger.log('[SSO] Message:', data.type);

        switch (data.type) {
          case 'auth_complete':
            // Got user + orgs + optional token from WebView
            completeAuthentication({
              user: data.user,
              organizations: data.organizations,
              token: data.token,
            });
            break;

          case 'token_only':
            // Got a token but no user data — use native API
            completeWithTokenOnly(data.token);
            break;

          case 'extraction_failed':
            logger.warn('[SSO] Extraction failed, retry #', retryCountRef.current);
            if (retryCountRef.current < 2) {
              retryCountRef.current += 1;
              hasInjectedRef.current = false;
              setTimeout(() => {
                if (!hasInjectedRef.current) {
                  hasInjectedRef.current = true;
                  webViewRef.current?.injectJavaScript(INJECTED_JS);
                }
              }, 3000);
            } else {
              setErrorMessage(
                'Could not extract session data. Please try signing in again.',
              );
              setSnackbarVisible(true);
              hasInjectedRef.current = false;
              retryCountRef.current = 0;
            }
            break;

          default:
            logger.warn('[SSO] Unknown message type:', data.type);
        }
      } catch (e: any) {
        logger.error('[SSO] Failed to parse WebView message:', e?.message);
      }
    },
    [completeAuthentication, completeWithTokenOnly],
  );

  // ── Handlers ──
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleRetry = useCallback(() => {
    setErrorMessage('');
    setSnackbarVisible(false);
    setIsExtracting(false);
    hasInjectedRef.current = false;
    retryCountRef.current = 0;
    // Force WebView to reload by changing the key
    setWebViewKey((k) => k + 1);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  // ── Render ──
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <Appbar.Header elevated>
        <Appbar.BackAction
          onPress={handleBack}
          accessibilityLabel="Go back to login screen"
        />
        <Appbar.Content title="Sign in with Browser" />
      </Appbar.Header>

      {/* WebView — fills remaining space */}
      <View style={styles.webViewContainer}>
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={{ uri: loginUrl }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleWebViewMessage}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          incognito={false}
          cacheEnabled={true}
          renderLoading={() => (
            <View
              style={[
                styles.webViewLoading,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <ActivityIndicator
                animating
                size="large"
                color={theme.colors.primary}
              />
              <Text
                variant="bodyMedium"
                style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}
              >
                Loading sign-in page...
              </Text>
            </View>
          )}
          onError={() => {
            setErrorMessage(
              'Failed to load the sign-in page. Please check your internet connection.',
            );
            setSnackbarVisible(true);
          }}
          accessibilityLabel="Anypoint Platform sign-in page"
        />

        {/* Extraction overlay */}
        {isExtracting && (
          <View
            style={[
              styles.extractionOverlay,
              {
                backgroundColor: theme.dark
                  ? 'rgba(11, 15, 25, 0.92)'
                  : 'rgba(255, 255, 255, 0.92)',
              },
            ]}
          >
            <ActivityIndicator
              animating
              size="large"
              color={theme.colors.primary}
            />
            <Text
              variant="titleMedium"
              style={[styles.extractionTitle, { color: theme.colors.onBackground }]}
            >
              Completing authentication...
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.extractionSubtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Setting up your session
            </Text>
          </View>
        )}
      </View>

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={6000}
        action={{
          label: 'Retry',
          onPress: handleRetry,
        }}
        style={styles.snackbar}
      >
        {errorMessage}
      </Snackbar>
    </View>
  );
};

// ── Styles ──
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  extractionOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  extractionTitle: {
    marginTop: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  extractionSubtitle: {
    marginTop: 8,
    textAlign: 'center',
  },
  snackbar: {
    marginBottom: 16,
  },
});

export default SSOLoginScreen;
