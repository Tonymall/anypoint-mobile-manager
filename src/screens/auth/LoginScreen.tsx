// ============================================================
// Anypoint Mobile Platform - Login Screen
// Username/password authentication with region selector,
// SSO, and biometric options.
// Fully responsive: phones, tablets (iPad), landscape/portrait.
// ============================================================

import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  ScrollView,
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
  Surface,
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

const LoginScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // ── Responsive breakpoints ──
  // Tablet: shortest side ≥ 768px (covers iPad Mini through iPad Pro)
  // Landscape: width > height
  // TabletLandscape: both → triggers horizontal (side-by-side) layout
  const isTablet = Math.min(width, height) >= 768;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;

  // Dynamic sizing based on device class
  const formMaxWidth = isTabletLandscape ? 480 : isTablet ? 560 : 420;
  const logoSize = isTabletLandscape ? 64 : isTablet ? 56 : 44;
  const logoCircleSize = isTabletLandscape ? 112 : isTablet ? 100 : 88;
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

  // --- Ref-based guard against concurrent login attempts ---
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

    // ── Synchronous guard: prevent concurrent login attempts ──
    if (loginInProgressRef.current) {
      console.log('[Login] Already in progress — ignoring duplicate tap');
      return;
    }
    loginInProgressRef.current = true;

    setIsLoading(true);
    setIsLoadingStore(true);
    setErrorMessage('');

    try {
      console.log('[Login] Starting login flow...');

      // Clear ALL stale state from any previous session to prevent 403
      await resetApiState();
      resetSessionFlags(); // Clear stale log/monitoring endpoint caches
      console.log('[Login] API state reset complete');

      // Ensure the API client points to the selected region
      await setRegion(selectedRegion);

      // Build the region URL directly from config
      const regionUrl = getRegionUrl(selectedRegion);
      console.log('[Login] Region set to:', selectedRegion, regionUrl);

      const tokens: AuthTokens = await authService.login(
        { username: username.trim(), password },
        regionUrl,
      );
      console.log('[Login] Login succeeded, token obtained');

      // Pass the token and region URL explicitly — completely bypasses
      // interceptors / SecureStore timing to prevent 403 on re-login.
      const user: User = await authService.getCurrentUser(
        tokens.accessToken,
        regionUrl,
      );
      console.log('[Login] User fetched:', user.firstName, user.lastName);

      // Store user & tokens but keep isAuthenticated false until org/env selected
      loginPending(user, tokens);
      console.log('[Login] loginPending called, navigating to select-org');
      router.push('/(auth)/select-org' as any);
    } catch (error: any) {
      const status = error?.response?.status;
      const url = error?.config?.url ?? error?.request?.responseURL ?? 'unknown';
      const responseBody = error?.response?.data;
      console.error('[Login] FAILED', {
        status,
        url,
        responseBody: typeof responseBody === 'object'
          ? JSON.stringify(responseBody).slice(0, 500)
          : String(responseBody ?? '').slice(0, 500),
        message: error?.message,
      });

      const message =
        error?.response?.data?.message ??
        error?.message ??
        'Authentication failed. Please check your credentials and try again.';
      setErrorMessage(message);
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
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + (isTabletLandscape ? 24 : isLandscape ? 16 : 0),
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: horizontalPadding,
            minHeight: height,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Inner content wrapper ──
            Portrait: vertical stack, centered.
            Tablet landscape: horizontal row, branding left, form right. */}
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
                  backgroundColor: theme.colors.primaryContainer,
                  width: logoCircleSize,
                  height: logoCircleSize,
                  borderRadius: logoCircleSize / 2,
                },
              ]}
            >
              <Icon name="api" size={logoSize} color={theme.colors.primary} />
            </View>
            <Text
              variant={isTablet ? 'headlineLarge' : 'headlineMedium'}
              style={[styles.appTitle, { color: theme.colors.onBackground }]}
            >
              Anypoint Platform
            </Text>
            <Text
              variant={isTablet ? 'bodyLarge' : 'bodyMedium'}
              style={[styles.appSubtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Mobile Management Console
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
            <Surface
              style={[
                styles.formCard,
                { backgroundColor: theme.colors.surface, maxWidth: formMaxWidth },
              ]}
              elevation={2}
            >
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
                            { backgroundColor: theme.colors.primaryContainer },
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
              >
                Sign in with SSO
              </Button>
            </Surface>

            {/* Footer */}
            <View style={styles.footer}>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                MuleSoft Anypoint Platform
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.outline, marginTop: 2 }}
              >
                Version 1.0.0
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Inner content layout ──
  // Default (phone / tablet portrait): vertical stack, centered
  innerContent: {
    width: '100%',
    maxWidth: 600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tablet landscape: horizontal row, items vertically centered
  innerContentLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 900,
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
  // Tablet landscape: branding takes the left panel
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
  // Tablet landscape: form takes the right panel
  formColumnLandscape: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Form card ──
  formCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
  },
  fieldLabel: {
    marginBottom: 8,
    fontWeight: '600',
  },
  regionSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
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
    borderRadius: 10,
  },
  signInButton: {
    marginBottom: 16,
    borderRadius: 12,
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
    borderRadius: 12,
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
