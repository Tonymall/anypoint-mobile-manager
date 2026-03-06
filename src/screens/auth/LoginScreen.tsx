// ============================================================
// Anypoint Mobile Platform - Login Screen
// 2026 Modern Dark-First Design with glassmorphic card,
// animated background, and refined typography.
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Snackbar,
  useTheme,
  ActivityIndicator,
  Divider,
  Menu,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../stores';
import * as authService from '../../services/authService';
import { setRegion, resetApiState } from '../../services/api';
import { resetSessionFlags } from '../../services/runtimeService';
import { CONTROL_PLANE_REGIONS, getRegionById, getRegionUrl } from '../../config/regions';
import type { AuthTokens, User, ControlPlaneRegionId } from '../../types';
import AnimatedBackground from '../../components/common/AnimatedBackground';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import Constants from 'expo-constants';
import logger from '../../utils/logger';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const LoginScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // ── Responsive breakpoints ──
  const isTablet = Math.min(width, height) >= 768;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;

  const formMaxWidth = isTabletLandscape ? 480 : isTablet ? 560 : 420;
  const logoSize = isTabletLandscape ? 56 : isTablet ? 48 : 40;
  const logoCircleSize = isTabletLandscape ? 100 : isTablet ? 88 : 76;
  const horizontalPadding = isTabletLandscape ? 40 : isTablet ? 40 : 24;

  // --- Form State ---
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // --- Region State ---
  const selectedRegion = useAuthStore((state) => state.selectedRegion);
  const setSelectedRegion = useAuthStore((state) => state.setSelectedRegion);
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);

  // --- UI State ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [snackbarVisible, setSnackbarVisible] = useState<boolean>(false);

  // --- Store ---
  const loginPending = useAuthStore((state) => state.loginPending);
  const setIsLoadingStore = useAuthStore((state) => state.setIsLoading);

  const loginInProgressRef = useRef(false);

  // --- Handlers ---
  const handleRegionSelect = useCallback(
    async (regionId: ControlPlaneRegionId) => {
      setSelectedRegion(regionId);
      await setRegion(regionId);
      setRegionMenuVisible(false);
    },
    [setSelectedRegion],
  );

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      setSnackbarVisible(true);
      return;
    }

    if (loginInProgressRef.current) {
      logger.log('[Login] Already in progress — ignoring duplicate tap');
      return;
    }
    loginInProgressRef.current = true;

    setIsLoading(true);
    setIsLoadingStore(true);
    setErrorMessage('');

    const regionUrl = getRegionUrl(selectedRegion);

    try {
      logger.log('[Login] Starting login flow...');
      await resetApiState();
      resetSessionFlags();
      logger.log('[Login] API state reset complete');

      await setRegion(selectedRegion);
      logger.log('[Login] Region set to:', selectedRegion, regionUrl);

      const tokens: AuthTokens = await authService.login(
        { username: username.trim(), password },
        regionUrl,
      );

      // If login returned without a token AND without throwing MFARequiredError,
      // we can't show the MFA dialog (no verification context). Fail cleanly.
      if (!tokens.accessToken) {
        logger.warn('[Login] No access_token and no MFA context — cannot proceed');
        setErrorMessage('Authentication returned an unexpected response. Please try again.');
        hapticError();
        setSnackbarVisible(true);
        return;
      }

      logger.log('[Login] Login succeeded, token obtained');

      let user: User;
      try {
        user = await authService.getCurrentUser(
          tokens.accessToken,
          regionUrl,
        );
      } catch (meError: any) {
        // If getCurrentUser fails with 401, the token is partial/expired.
        // Without an MFA verification context we can't show the MFA dialog —
        // fail cleanly and let the user retry the full login flow.
        if (meError?.response?.status === 401) {
          logger.warn('[Login] getCurrentUser 401 — token unusable, no MFA context');
          setErrorMessage('Session token was rejected. Please sign in again.');
          hapticError();
          setSnackbarVisible(true);
          return;
        }
        throw meError;
      }
      logger.log('[Login] User fetched:', user.firstName, user.lastName);

      loginPending(user, tokens);
      hapticSuccess();
      logger.log('[Login] loginPending called, navigating to select-org');
      router.push('/(auth)/select-org' as any);
    } catch (error: any) {
      // ── MFA Required — continue login in hosted WebView ──
      if (error instanceof authService.MFARequiredError) {
        logger.log('[Login] MFA required — opening hosted WebView for Salesforce verification');
        authService.setPendingMFAChallenge({
          username: username.trim(),
          password,
          verifyUrl: error.verifyUrl,
          requestToken: error.requestToken,
          baseUrl: regionUrl,
        });
        router.push({
          pathname: '/(auth)/sso' as any,
          params: { mfaUsername: username.trim() },
        });
        return;
      }

      // Log sanitized error — no response bodies or full URLs in production
      const status = error?.response?.status;
      logger.error('[Login] FAILED', { status, message: error?.message });
      // Detailed debug info only in dev
      logger.log('[Login] Debug:', {
        url: error?.config?.url,
        responseBody: typeof error?.response?.data === 'object'
          ? JSON.stringify(error.response.data).slice(0, 500)
          : String(error?.response?.data ?? '').slice(0, 500),
      });

      // Fallback MFA detection from error responses — continue in hosted WebView
      const responseData = error?.response?.data;
      if (responseData?.url?.includes('verify.salesforce.com') && responseData?.body?.request) {
        logger.log('[Login] MFA detected from error response — opening hosted WebView');
        authService.setPendingMFAChallenge({
          username: username.trim(),
          password,
          verifyUrl: responseData.url,
          requestToken: responseData.body.request,
          baseUrl: regionUrl,
        });
        router.push({
          pathname: '/(auth)/sso' as any,
          params: { mfaUsername: username.trim() },
        });
        return;
      }

      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Authentication failed. Please check your credentials and try again.';
      setErrorMessage(message);
      hapticError();
      setSnackbarVisible(true);
    } finally {
      setIsLoading(false);
      setIsLoadingStore(false);
      loginInProgressRef.current = false;
    }
  }, [username, password, selectedRegion, loginPending, setIsLoadingStore, router]);

  const handleSSOLogin = useCallback(() => {
    router.push('/(auth)/sso');
  }, [router]);

  const dismissSnackbar = useCallback(() => {
    setSnackbarVisible(false);
  }, []);

  const isFormValid = username.trim().length > 0 && password.trim().length > 0;
  const currentRegion = getRegionById(selectedRegion);

  // --- Render ---
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Animated gradient orbs background */}
      <AnimatedBackground />

      <View
        style={[
          styles.contentContainer,
          {
            paddingTop: insets.top + (isTabletLandscape ? 24 : isLandscape ? 16 : 0),
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        <View
          style={[
            styles.innerContent,
            isTabletLandscape && styles.innerContentLandscape,
          ]}
        >
          {/* ── Branding Area ── */}
          <View
            style={[
              styles.brandingContainer,
              isLandscape && !isTabletLandscape && styles.brandingLandscape,
              isTabletLandscape && styles.brandingTabletLandscape,
            ]}
          >
            <View
              style={[
                styles.logoCircle,
                {
                  backgroundColor: theme.colors.primary + '14',
                  width: logoCircleSize,
                  height: logoCircleSize,
                  borderRadius: logoCircleSize * 0.26,
                },
              ]}
            >
              <Icon name="api" size={logoSize} color={theme.colors.primary} />
            </View>
            <Text
              variant={isTablet ? 'headlineLarge' : 'headlineMedium'}
              style={[styles.appTitle, { color: theme.colors.onBackground }]}
            >
              MuleOps
            </Text>
            <Text
              variant={isTablet ? 'bodyLarge' : 'bodyMedium'}
              style={[styles.appSubtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Mobile Operations Control
            </Text>
          </View>

          {/* ── Form + Footer Column ── */}
          <View
            style={[
              styles.formColumn,
              isTabletLandscape && styles.formColumnLandscape,
            ]}
          >
            {/* Login Form */}
            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: theme.colors.surface,
                  maxWidth: formMaxWidth,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
            >
              {/* Accent glow */}
              <View style={[styles.formAccent, { backgroundColor: theme.colors.primary }]} />

              <View style={styles.formInner}>
                {/* Region Selector */}
                <Text
                  variant="labelMedium"
                  style={[styles.fieldLabel, { color: theme.colors.onSurfaceVariant }]}
                >
                  Control Plane Region
                </Text>
                <Menu
                  visible={regionMenuVisible}
                  onDismiss={() => setRegionMenuVisible(false)}
                  anchor={
                    <Pressable
                      onPress={() => setRegionMenuVisible(true)}
                      disabled={isLoading}
                      accessibilityLabel={`Control plane region: ${currentRegion.label}. Double tap to change.`}
                      accessibilityRole="button"
                    >
                      <View
                        style={[
                          styles.regionSelector,
                          {
                            borderColor: theme.colors.outline,
                            backgroundColor: theme.colors.background,
                          },
                        ]}
                      >
                        <View style={styles.regionLeft}>
                          <View
                            style={[
                              styles.regionIconWrap,
                              { backgroundColor: theme.colors.primary + '14' },
                            ]}
                          >
                            <Icon name="earth" size={18} color={theme.colors.primary} />
                          </View>
                          <View style={styles.regionTextContainer}>
                            <Text
                              variant="bodyMedium"
                              style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                            >
                              {currentRegion.label}
                            </Text>
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant }}
                            >
                              {currentRegion.notes}
                            </Text>
                          </View>
                        </View>
                        <Icon
                          name="chevron-down"
                          size={20}
                          color={theme.colors.onSurfaceVariant}
                        />
                      </View>
                    </Pressable>
                  }
                  contentStyle={{ backgroundColor: theme.colors.surface }}
                >
                  {CONTROL_PLANE_REGIONS.map((region) => (
                    <Menu.Item
                      key={region.id}
                      title={`${region.label} — ${region.notes}`}
                      leadingIcon={
                        selectedRegion === region.id ? 'check-circle' : 'earth'
                      }
                      onPress={() => handleRegionSelect(region.id)}
                    />
                  ))}
                </Menu>

                <Divider style={styles.formDivider} />

                <TextInput
                  label="Username"
                  value={username}
                  onChangeText={setUsername}
                  mode="outlined"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  left={<TextInput.Icon icon="account-outline" />}
                  disabled={isLoading}
                  style={styles.input}
                  returnKeyType="next"
                  outlineStyle={styles.inputOutline}
                />

                <TextInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  mode="outlined"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  left={<TextInput.Icon icon="lock-outline" />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(!showPassword)}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    />
                  }
                  disabled={isLoading}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  outlineStyle={styles.inputOutline}
                />

                {/* Sign In Button */}
                <Button
                  mode="contained"
                  onPress={handleLogin}
                  disabled={!isFormValid || isLoading}
                  loading={isLoading}
                  style={styles.signInButton}
                  contentStyle={styles.signInButtonContent}
                  labelStyle={styles.signInButtonLabel}
                  accessibilityLabel={isLoading ? 'Signing in, please wait' : 'Sign in to Anypoint Platform'}
                  accessibilityRole="button"
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <Divider style={styles.dividerLine} />
                  <Text
                    variant="labelMedium"
                    style={[
                      styles.dividerText,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    or
                  </Text>
                  <Divider style={styles.dividerLine} />
                </View>

                {/* SSO Button */}
                <Button
                  mode="outlined"
                  onPress={handleSSOLogin}
                  disabled={isLoading}
                  icon="shield-key-outline"
                  style={styles.ssoButton}
                  contentStyle={styles.ssoButtonContent}
                  accessibilityLabel="Sign in with Single Sign-On"
                  accessibilityRole="button"
                >
                  Sign in with SSO
                </Button>

              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                MuleOps — Mobile Operations Control
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.outline, marginTop: 2 }}
              >
                Version {APP_VERSION}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Loading Overlay */}
      {isLoading && (
        <View
          style={[
            styles.loadingOverlay,
            {
              backgroundColor: theme.dark
                ? 'rgba(0, 0, 0, 0.5)'
                : 'rgba(255, 255, 255, 0.6)',
            },
          ]}
        >
          <ActivityIndicator animating size="large" color={theme.colors.primary} />
        </View>
      )}

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={dismissSnackbar}
        duration={4000}
        action={{ label: 'Dismiss', onPress: dismissSnackbar }}
        style={styles.snackbar}
      >
        {errorMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Inner content layout ──
  innerContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerContentLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 880,
    alignSelf: 'center',
  },

  // ── Branding ──
  brandingContainer: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  brandingLandscape: {
    marginBottom: 20,
  },
  brandingTabletLandscape: {
    flex: 2,
    marginBottom: 0,
    justifyContent: 'center',
    paddingRight: 32,
  },
  logoCircle: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Form + Footer column ──
  formColumn: {
    width: '100%',
    alignItems: 'center',
  },
  formColumnLandscape: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Form card ──
  formCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  formAccent: {
    height: 3,
  },
  formInner: {
    padding: 24,
  },
  fieldLabel: {
    marginBottom: 8,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  regionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  regionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  regionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  regionTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  formDivider: {
    marginVertical: 20,
  },
  input: {
    marginBottom: 14,
  },
  inputOutline: {
    borderRadius: 12,
  },
  signInButton: {
    marginBottom: 16,
    borderRadius: 14,
  },
  signInButtonContent: {
    paddingVertical: 6,
  },
  signInButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
  ssoButton: {
    borderRadius: 14,
  },
  ssoButtonContent: {
    paddingVertical: 6,
  },
  // ── Footer ──
  footer: {
    alignItems: 'center',
    marginTop: 32,
    width: '100%',
  },

  // ── Overlays ──
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snackbar: {
    marginBottom: 16,
  },
});

export default LoginScreen;





