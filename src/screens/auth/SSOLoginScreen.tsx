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
import { getBaseUrl, setAuthHeader, storeTokens, enableCookieSessionAuth } from '../../services/api';
import * as authService from '../../services/authService';
import type { AuthTokens } from '../../types';
import logger from '../../utils/logger';

const INJECTED_JS = `
  (function() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/accounts/api/me', false);
      xhr.withCredentials = true;
      xhr.send();

      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        var user = data.user || data;
        var orgs = user.memberOfOrganizations || [];

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
        } catch (cookieErr) {}

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
    } catch (e) {}

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
    } catch (e) {}

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'extraction_failed',
      cookies: document.cookie ? 'present' : 'empty',
    }));
  })();
  true;
`;

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
  const pendingMfaChallenge = authService.getPendingMFAChallenge();
  const isMfaContinuation = !!pendingMfaChallenge;

  const loginPending = useAuthStore((state) => state.loginPending);
  const setOrganizations = useAuthStore((state) => state.setOrganizations);

  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [webViewKey, setWebViewKey] = useState(1);

  const hasInjectedRef = useRef(false);
  const hasPrefilledRef = useRef(false);
  const retryCountRef = useRef(0);
  const baseUrl = getBaseUrl();
  const loginUrl = `${baseUrl}/login/signin`;

  const isPostLoginUrl = useCallback(
    (url: string): boolean => {
      if (!url) return false;
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const path = parsed.pathname;

        if (
          host.includes('verify.salesforce.com') ||
          host.includes('login.salesforce.com') ||
          path.includes('/verify') ||
          path.includes('/mfa')
        ) {
          return false;
        }

        if (
          path === '/accounts/login' ||
          path === '/accounts/login/' ||
          path === '/login/signin' ||
          path === '/login/signin/'
        ) {
          return false;
        }

        if (POST_LOGIN_PATHS.some((p) => path.startsWith(p))) {
          return true;
        }

        if (
          parsed.origin === baseUrl &&
          path !== '/accounts/login' &&
          path !== '/login/signin' &&
          !path.startsWith('/accounts/login') &&
          !path.startsWith('/login/signin')
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

  const completeAuthentication = useCallback(
    async (payload: { user: any; organizations?: any[]; token?: string | null; xsrfToken?: string | null }) => {
      setIsExtracting(true);
      try {
        const { user, organizations, token, xsrfToken } = payload;

        if (!user || typeof user !== 'object') {
          throw new Error('No user profile data received from browser session.');
        }

        if (!token || typeof token !== 'string' || token.length === 0) {
          logger.warn('[SSO] No bearer token extracted — cannot proceed');
          throw new Error(
            'Could not extract an access token from the browser session. ' +
              'Please try signing in with username and password instead.',
          );
        }

        setAuthHeader(token);
        try {
          await storeTokens(token);
        } catch (storeError: any) {
          logger.warn('[SSO] storeTokens failed:', storeError?.message);
        }

        const tokens: AuthTokens = {
          accessToken: token,
          tokenType: 'bearer',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        };

        const orgs = organizations ?? user.memberOfOrganizations ?? [];
        loginPending(user, tokens);
        if (orgs.length > 0) {
          setOrganizations(orgs);
        }
        if (isMfaContinuation) {
          authService.clearPendingMFAChallenge();
        }

        logger.log('[SSO] Authentication complete, navigating to org selection');
        router.replace('/(auth)/select-org');
      } catch (error: any) {
        logger.error('[SSO] Authentication failed:', error?.message);
        setErrorMessage(error?.message ?? 'Authentication failed. Please try again.');
        setSnackbarVisible(true);
        hasInjectedRef.current = false;
        retryCountRef.current = 0;
        setIsExtracting(false);
      }
    },
    [isMfaContinuation, loginPending, router, setOrganizations],
  );

  const completeSessionOnly = useCallback(
    async (xsrfToken: string) => {
      setIsExtracting(true);
      try {
        await enableCookieSessionAuth(xsrfToken);
        const user = await authService.getCurrentUser(undefined, baseUrl);
        const orgs = user.memberOfOrganizations ?? [];
        const tokens: AuthTokens = {
          accessToken: '',
          tokenType: 'session',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        } as AuthTokens;

        loginPending(user, tokens);
        if (orgs.length > 0) {
          setOrganizations(orgs);
        }
        if (isMfaContinuation) {
          authService.clearPendingMFAChallenge();
        }

        logger.log('[SSO] Session-cookie authentication complete');
        router.replace('/(auth)/select-org');
      } catch (error: any) {
        logger.error('[SSO] Session-cookie auth failed:', error?.message);
        setErrorMessage('Authenticated browser session found, but native session setup failed. Please try again.');
        setSnackbarVisible(true);
        hasInjectedRef.current = false;
        retryCountRef.current = 0;
        setIsExtracting(false);
      }
    },
    [baseUrl, isMfaContinuation, loginPending, router, setOrganizations],
  );

  const completeWithTokenOnly = useCallback(
    async (token: string) => {
      setIsExtracting(true);
      try {
        setAuthHeader(token);
        await storeTokens(token);

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
        if (isMfaContinuation) {
          authService.clearPendingMFAChallenge();
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
    [baseUrl, isMfaContinuation, loginPending, router, setOrganizations],
  );

  const prefillCredentialsAndSubmit = useCallback(() => {
    if (!isMfaContinuation || !pendingMfaChallenge || hasPrefilledRef.current) return;
    hasPrefilledRef.current = true;

    const escapedUsername = pendingMfaChallenge.username
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    const escapedPassword = pendingMfaChallenge.password
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    const prefillJS = `
      (function() {
        var attempts = 0;
        function query(selectors) {
          for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el) return el;
          }
          return null;
        }
        function setValue(el, value) {
          if (!el) return false;
          try {
            var nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSet.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          } catch (e) {
            return false;
          }
        }
        function tryFill() {
          attempts += 1;
          var username = query([
            'input[name="username"]',
            'input[type="email"]',
            'input#username',
            '#username',
            'input[autocomplete="username"]'
          ]);
          var password = query([
            'input[name="password"]',
            'input[type="password"]',
            'input#password',
            'input[autocomplete="current-password"]'
          ]);
          if (!username || !password) {
            if (attempts < 20) {
              setTimeout(tryFill, 500);
            }
            return;
          }
          setValue(username, '${escapedUsername}');
          setValue(password, '${escapedPassword}');

          var submit = query([
            'button[type="submit"]',
            'input[type="submit"]',
            'button[name="login"]',
            'button[data-testid="login-button"]'
          ]);
          if (submit && typeof submit.click === 'function') {
            submit.click();
            return;
          }
          var form = username.form || password.form || document.querySelector('form');
          if (form && typeof form.submit === 'function') {
            form.submit();
          }
        }
        tryFill();
      })();
      true;
    `;

    setTimeout(() => {
      webViewRef.current?.injectJavaScript(prefillJS);
    }, 250);
  }, [isMfaContinuation, pendingMfaChallenge]);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState;
      if (!url) return;

      if (isMfaContinuation) {
        logger.log('[SSO] Hosted MFA page:', url);

        if (
          (url.includes('/accounts/login') || url.includes('/login/signin')) &&
          !url.includes('errorMessage=')
        ) {
          prefillCredentialsAndSubmit();
        }

        if (url.includes('/login/signin?errorMessage=')) {
          setErrorMessage('MFA verification could not be completed. Please try again.');
          setSnackbarVisible(true);
          authService.clearPendingMFAChallenge();
          return;
        }

        if (url.includes('/accounts/login/mfa_callback') || isPostLoginUrl(url)) {
          if (!hasInjectedRef.current) {
            hasInjectedRef.current = true;
            retryCountRef.current = 0;
            setIsExtracting(true);
            setTimeout(() => {
              webViewRef.current?.stopLoading();
              webViewRef.current?.injectJavaScript(INJECTED_JS);
            }, 250);
          }
          return;
        }

        return;
      }

      if (hasInjectedRef.current) return;

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
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(INJECTED_JS);
        }, 2500);
      }
    },
    [isMfaContinuation, isPostLoginUrl, prefillCredentialsAndSubmit],
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        logger.log('[SSO] Message:', data.type);

        switch (data.type) {
          case 'auth_complete':
            completeAuthentication({
              user: data.user,
              organizations: data.organizations,
              token: data.token,
            });
            break;

          case 'token_only':
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
              }, 2000);
            } else {
              setErrorMessage('Could not extract session data. Please try signing in again.');
              setSnackbarVisible(true);
              hasInjectedRef.current = false;
              retryCountRef.current = 0;
              setIsExtracting(false);
            }
            break;

          default:
            logger.warn('[SSO] Unknown message type:', data.type);
        }
      } catch (e: any) {
        logger.error('[SSO] Failed to parse WebView message:', e?.message);
      }
    },
    [completeAuthentication, completeSessionOnly, completeWithTokenOnly],
  );

  const handleBack = useCallback(() => {
    if (isMfaContinuation) {
      authService.clearPendingMFAChallenge();
    }
    router.back();
  }, [isMfaContinuation, router]);

  const handleRetry = useCallback(() => {
    setErrorMessage('');
    setSnackbarVisible(false);
    setIsExtracting(false);
    hasInjectedRef.current = false;
    hasPrefilledRef.current = false;
    retryCountRef.current = 0;
    setWebViewKey((k) => k + 1);
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}> 
      <Appbar.Header elevated>
        <Appbar.BackAction
          onPress={handleBack}
          accessibilityLabel="Go back to login screen"
        />
        <Appbar.Content
          title={isMfaContinuation ? 'Verify Identity' : 'Sign in with Browser'}
        />
      </Appbar.Header>

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


