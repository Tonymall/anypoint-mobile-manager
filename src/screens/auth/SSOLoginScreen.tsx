// ============================================================
// Anypoint Mobile Platform - SSO / Browser Login Screen
// WebView-based authentication flow supporting MFA, SSO,
// and standard username/password login via the Anypoint web UI.
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Appbar,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../stores';
import { getBaseUrl, setAuthHeader, storeTokens } from '../../services/api';
import * as authService from '../../services/authService';
import type { AuthTokens } from '../../types';

// ── JavaScript injected after the user completes web-based login ──
// Tries multiple strategies to extract the access token / user session.
const INJECTED_JS = `
  (function() {
    try {
      // Method 1: Fetch user data from the accounts API using session cookies
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/accounts/api/me', false);
      xhr.withCredentials = true;
      xhr.send();
      if (xhr.status === 200) {
        var data = JSON.parse(xhr.responseText);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'auth_success',
          user: data.user || data,
        }));
        return;
      }
    } catch(e) {}

    try {
      // Method 2: Look for access_token in cookies
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
          type: 'token_found',
          token: token,
        }));
        return;
      }
    } catch(e) {}

    try {
      // Method 3: Try the profile API endpoint
      var xhr2 = new XMLHttpRequest();
      xhr2.open('GET', '/accounts/api/profile', false);
      xhr2.withCredentials = true;
      xhr2.send();
      if (xhr2.status === 200) {
        var profileData = JSON.parse(xhr2.responseText);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'profile_found',
          profile: profileData,
        }));
        return;
      }
    } catch(e) {}

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'extraction_failed',
      cookies: document.cookie ? 'present' : 'empty',
      url: window.location.href,
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
  const selectedRegion = useAuthStore((state) => state.selectedRegion);

  // ── State ──
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [webViewKey, setWebViewKey] = useState(1);

  const hasInjectedRef = useRef(false);
  const baseUrl = getBaseUrl();
  const loginUrl = `${baseUrl}/accounts/login`;

  // ── Determine if a URL is a post-login page ──
  const isPostLoginUrl = useCallback(
    (url: string): boolean => {
      if (!url) return false;
      try {
        const parsed = new URL(url);
        const path = parsed.pathname;
        // Still on the login page — not post-login
        if (path === '/accounts/login' || path === '/accounts/login/') {
          return false;
        }
        // Check against known post-login paths
        if (POST_LOGIN_PATHS.some((p) => path.startsWith(p))) {
          return true;
        }
        // Also detect any path that is NOT the login page on the same domain
        // (e.g. when user is redirected to /accounts#/ or /)
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

  // ── Complete the native auth flow using an extracted token or user data ──
  const completeAuthentication = useCallback(
    async (tokenOrUserData: any) => {
      setIsExtracting(true);
      try {
        let token: string | undefined;

        if (typeof tokenOrUserData === 'string') {
          token = tokenOrUserData;
        } else if (typeof tokenOrUserData === 'object') {
          token =
            tokenOrUserData.access_token ??
            tokenOrUserData.token ??
            tokenOrUserData.properties?.cs_token ??
            undefined;
        }

        if (token && typeof token === 'string') {
          setAuthHeader(token);
          await storeTokens(token);
        }

        // Fetch user profile using the session/token
        const user = await authService.getCurrentUser(
          token,
          baseUrl,
        );
        const orgs = await authService.getOrganizations();

        // Build AuthTokens object
        const tokens: AuthTokens = {
          accessToken: token ?? '',
          tokenType: 'bearer',
          expiresIn: 3600,
          expiresAt: Date.now() + 3600 * 1000,
        };

        loginPending(user, tokens);
        setOrganizations(orgs);

        // Navigate to org selection
        router.replace('/(auth)/select-org');
      } catch (error: any) {
        console.error('[SSO] Authentication completion failed:', error?.message);
        setErrorMessage('Authentication failed. Please try again.');
        setSnackbarVisible(true);
        // Reset so the user can try again
        hasInjectedRef.current = false;
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

      if (isPostLoginUrl(url)) {
        console.log('[SSO] Post-login URL detected:', url);
        hasInjectedRef.current = true;
        // Give the page a moment to settle, then inject extraction script
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(INJECTED_JS);
        }, 1500);
      }
    },
    [isPostLoginUrl],
  );

  // ── Handle messages from injected JavaScript ──
  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        console.log('[SSO] Message received:', data.type);

        switch (data.type) {
          case 'auth_success':
            // Got user data from /accounts/api/me — session cookies are valid
            completeAuthentication(data.user);
            break;

          case 'token_found':
            // Got a raw token from cookies
            completeAuthentication(data.token);
            break;

          case 'profile_found':
            // Got profile data — may contain token
            completeAuthentication(data.profile);
            break;

          case 'extraction_failed':
            console.warn('[SSO] Token extraction failed:', data);
            // Try a second time after a longer delay
            hasInjectedRef.current = false;
            setTimeout(() => {
              if (!hasInjectedRef.current) {
                hasInjectedRef.current = true;
                webViewRef.current?.injectJavaScript(INJECTED_JS);
              }
            }, 3000);
            break;

          default:
            console.warn('[SSO] Unknown message type:', data.type);
        }
      } catch (e) {
        console.error('[SSO] Failed to parse WebView message:', e);
      }
    },
    [completeAuthentication],
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
