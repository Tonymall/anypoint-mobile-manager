import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Divider,
  Menu,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedBackground from '../../components/common/AnimatedBackground';
import { CONTROL_PLANE_REGIONS, getRegionById, getRegionUrl } from '../../config/regions';
import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { useAuthStore } from '../../stores';
import { resetApiState, setRegion } from '../../services/api';
import * as authService from '../../services/authService';
import { activateRememberedAccount } from '../../services/rememberedAccountService';
import { resetSessionFlags } from '../../services/runtimeService';
import type { AuthTokens, ControlPlaneRegionId, User } from '../../types';
import { hapticError, hapticSuccess } from '../../utils/haptics';
import logger from '../../utils/logger';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const LoginScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const {
    fromSettings,
    rememberedUsername,
    rememberedRegion,
  } = useLocalSearchParams<{
    fromSettings?: string;
    rememberedUsername?: string;
    rememberedRegion?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isTablet = Math.min(width, height) >= 768;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;

  const formMaxWidth = isTabletLandscape ? 480 : isTablet ? 560 : 420;
  const logoSize = isTabletLandscape ? 56 : isTablet ? 48 : 40;
  const logoCircleSize = isTabletLandscape ? 100 : isTablet ? 88 : 76;
  const horizontalPadding = isTabletLandscape ? 40 : isTablet ? 40 : 24;

  const [username, setUsername] = useState(rememberedUsername ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [regionMenuVisible, setRegionMenuVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [showAllRememberedAccounts, setShowAllRememberedAccounts] = useState(false);

  const selectedRegion = useAuthStore((state) => state.selectedRegion);
  const setSelectedRegion = useAuthStore((state) => state.setSelectedRegion);
  const storedRememberSession = useAuthStore((state) => state.rememberSession);
  const persistRememberSession = useAuthStore((state) => state.setRememberSession);
  const rememberedAccountsMap = useAuthStore((state) => state.rememberedAccounts);
  const removeRememberedAccount = useAuthStore((state) => state.removeRememberedAccount);
  const loginPending = useAuthStore((state) => state.loginPending);
  const setIsLoadingStore = useAuthStore((state) => state.setIsLoading);
  const showError = useErrorDialogStore((state) => state.showError);
  const queryClient = useQueryClient();
  const [rememberSession, setRememberSessionState] = useState(storedRememberSession);

  const loginInProgressRef = useRef(false);
  const rememberedAccounts = useMemo(
    () =>
      Object.values(rememberedAccountsMap).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [rememberedAccountsMap],
  );

  const currentRegion = getRegionById(selectedRegion);
  const isFormValid = username.trim().length > 0 && password.trim().length > 0;
  const isAddAccountMode = fromSettings === '1';
  const visibleRememberedAccounts = useMemo(
    () => showAllRememberedAccounts ? rememberedAccounts : rememberedAccounts.slice(0, 1),
    [rememberedAccounts, showAllRememberedAccounts],
  );

  const handleRegionSelect = useCallback(
    async (regionId: ControlPlaneRegionId) => {
      setSelectedRegion(regionId);
      await setRegion(regionId);
      setRegionMenuVisible(false);
    },
    [setSelectedRegion],
  );

  React.useEffect(() => {
    if (rememberedUsername && typeof rememberedUsername === 'string') {
      setUsername(rememberedUsername);
    }
  }, [rememberedUsername]);

  React.useEffect(() => {
    if (
      rememberedRegion &&
      typeof rememberedRegion === 'string' &&
      CONTROL_PLANE_REGIONS.some((region) => region.id === rememberedRegion)
    ) {
      void handleRegionSelect(rememberedRegion as ControlPlaneRegionId);
    }
  }, [handleRegionSelect, rememberedRegion]);

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      showError({
        title: 'Missing credentials',
        message: 'Please enter both username and password.',
      });
      return;
    }

    if (loginInProgressRef.current) {
      logger.log('[Login] Already in progress - ignoring duplicate tap');
      return;
    }

    loginInProgressRef.current = true;
    setIsLoading(true);
    setIsLoadingStore(true);

    const regionUrl = getRegionUrl(selectedRegion);
    persistRememberSession(rememberSession);

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

      if (!tokens.accessToken) {
        logger.warn('[Login] No access_token and no MFA context - cannot proceed');
        showError({
          title: 'Authentication failed',
          message: 'Authentication returned an unexpected response. Please try again.',
        });
        hapticError();
        return;
      }

      logger.log('[Login] Login succeeded, token obtained');

      let user: User;
      try {
        user = await authService.getCurrentUser(tokens.accessToken, regionUrl);
      } catch (meError: any) {
        if (meError?.response?.status === 401) {
          logger.warn('[Login] getCurrentUser 401 - token unusable, no MFA context');
          showError({
            title: 'Session rejected',
            message: 'Session token was rejected. Please sign in again.',
            details: 'HTTP 401 while loading the authenticated profile.',
          });
          hapticError();
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
      if (error instanceof authService.MFARequiredError) {
        logger.log('[Login] MFA required - opening hosted WebView for Salesforce verification');
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

      const status = error?.response?.status;
      logger.error('[Login] FAILED', { status, message: error?.message });
      logger.log('[Login] Debug:', {
        url: error?.config?.url,
        responseBody:
          typeof error?.response?.data === 'object'
            ? JSON.stringify(error.response.data).slice(0, 500)
            : String(error?.response?.data ?? '').slice(0, 500),
      });

      const responseData = error?.response?.data;
      if (responseData?.url?.includes('verify.salesforce.com') && responseData?.body?.request) {
        logger.log('[Login] MFA detected from error response - opening hosted WebView');
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
      showError({
        title: 'Login failed',
        message,
        details: status ? `HTTP ${status}` : undefined,
      });
      hapticError();
    } finally {
      setIsLoading(false);
      setIsLoadingStore(false);
      loginInProgressRef.current = false;
    }
  }, [
    username,
    password,
    selectedRegion,
    rememberSession,
    loginPending,
    router,
    setIsLoadingStore,
    persistRememberSession,
    showError,
  ]);

  const handleSSOLogin = useCallback(() => {
    persistRememberSession(rememberSession);
    router.push('/(auth)/sso');
  }, [persistRememberSession, rememberSession, router]);

  const handleReturnFromAddAccount = useCallback(() => {
    router.back();
  }, [router]);

  const handleRememberedAccountLogin = useCallback(
    async (accountId: string) => {
      setSwitchingAccountId(accountId);
      setIsLoadingStore(true);
      queryClient.clear();
      resetSessionFlags();

      try {
        await activateRememberedAccount(accountId);
        hapticSuccess();

        const state = useAuthStore.getState();
        if (state.currentOrganization && state.currentEnvironment && state.isAuthenticated) {
          router.replace('/(main)' as any);
        } else if (state.currentOrganization) {
          router.replace('/(auth)/select-env' as any);
        } else {
          router.replace('/(auth)/select-org' as any);
        }
      } catch (error: any) {
        if (error?.code === 'REMEMBERED_ACCOUNT_EXPIRED') {
          router.push({
            pathname: '/(auth)/login' as any,
            params: {
              fromSettings: '1',
              rememberedUsername: error.username ?? error.email ?? '',
              rememberedRegion: error.selectedRegion ?? selectedRegion,
            },
          });
          return;
        }
        showError({
          title: 'Unable to continue',
          message: error?.message ?? 'Saved session could not be restored.',
        });
        hapticError();
      } finally {
        setSwitchingAccountId(null);
        setIsLoadingStore(false);
      }
    },
    [queryClient, router, setIsLoadingStore, showError],
  );

  const handleForgetRememberedAccount = useCallback(
    (accountId: string) => {
      removeRememberedAccount(accountId);
    },
    [removeRememberedAccount],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AnimatedBackground />

      <ScrollView
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: insets.top + (isTabletLandscape ? 24 : isLandscape ? 16 : 0),
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.innerContent, isTabletLandscape && styles.innerContentLandscape]}>
          {isAddAccountMode ? (
            <View style={styles.authNavRow}>
              <Pressable
                onPress={handleReturnFromAddAccount}
                style={[
                  styles.backPill,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.outlineVariant,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Back to settings"
              >
                <Icon name="arrow-left" size={18} color={theme.colors.onSurface} />
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                >
                  Back
                </Text>
              </Pressable>
            </View>
          ) : null}

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

          <View style={[styles.formColumn, isTabletLandscape && styles.formColumnLandscape]}>
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
              <View style={[styles.formAccent, { backgroundColor: theme.colors.primary }]} />

              <View style={styles.formInner}>
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
                      disabled={isLoading || !!switchingAccountId}
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
                      title={`${region.label} - ${region.notes}`}
                      leadingIcon={selectedRegion === region.id ? 'check-circle' : 'earth'}
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
                  disabled={isLoading || !!switchingAccountId}
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
                  disabled={isLoading || !!switchingAccountId}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  outlineStyle={styles.inputOutline}
                />

                <Pressable
                  onPress={() => setRememberSessionState(!rememberSession)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberSession }}
                  accessibilityLabel="Stay signed in"
                  style={styles.rememberRow}
                >
                  <View
                    style={[
                      styles.rememberCheckboxBox,
                      {
                        borderColor: rememberSession ? theme.colors.primary : theme.colors.outline,
                        backgroundColor: rememberSession
                          ? theme.colors.primary + '10'
                          : theme.colors.surface,
                      },
                    ]}
                  >
                    <Checkbox status={rememberSession ? 'checked' : 'unchecked'} />
                  </View>
                  <View style={styles.rememberTextWrap}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface, fontWeight: '500' }}
                    >
                      Stay signed in
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Keep this account logged in on this device
                    </Text>
                  </View>
                </Pressable>

                <Button
                  mode="contained"
                  onPress={handleLogin}
                  disabled={!isFormValid || isLoading || !!switchingAccountId}
                  loading={isLoading}
                  style={styles.signInButton}
                  contentStyle={styles.signInButtonContent}
                  labelStyle={styles.signInButtonLabel}
                  accessibilityLabel={
                    isLoading ? 'Signing in, please wait' : 'Sign in to Anypoint Platform'
                  }
                  accessibilityRole="button"
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Button>

                <View style={styles.dividerRow}>
                  <Divider style={styles.dividerLine} />
                  <Text
                    variant="labelMedium"
                    style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}
                  >
                    or
                  </Text>
                  <Divider style={styles.dividerLine} />
                </View>

                <Button
                  mode="outlined"
                  onPress={handleSSOLogin}
                  disabled={isLoading || !!switchingAccountId}
                  icon="shield-key-outline"
                  style={styles.ssoButton}
                  contentStyle={styles.ssoButtonContent}
                  accessibilityLabel="Sign in with Single Sign-On"
                  accessibilityRole="button"
                >
                  Sign in with SSO
                </Button>

                {!isAddAccountMode && rememberedAccounts.length > 0 ? (
                  <>
                    <View style={styles.dividerRow}>
                      <Divider style={styles.dividerLine} />
                      <Text
                        variant="labelMedium"
                        style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}
                      >
                        saved accounts
                      </Text>
                      <Divider style={styles.dividerLine} />
                    </View>

                    <View style={styles.savedAccountsSection}>
                      {visibleRememberedAccounts.map((account) => {
                        const isSwitching = switchingAccountId === account.accountId;
                        const fullName =
                          `${account.user.firstName ?? ''} ${account.user.lastName ?? ''}`.trim();
                        const metaLine = [
                          account.currentOrganization?.name ?? account.user.organizationName,
                          getRegionById(account.selectedRegion).label,
                        ].filter(Boolean).join(' • ');

                        return (
                          <Pressable
                            key={account.accountId}
                            onPress={() => void handleRememberedAccountLogin(account.accountId)}
                            disabled={isLoading || !!switchingAccountId}
                            style={[
                              styles.savedAccountCard,
                              {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.outlineVariant,
                              },
                            ]}
                          >
                            <View style={styles.savedAccountHeader}>
                              <View
                                style={[
                                  styles.savedAccountAvatar,
                                  { backgroundColor: theme.colors.primary + '14' },
                                ]}
                              >
                                <Text
                                  variant="labelLarge"
                                  style={{ color: theme.colors.primary, fontWeight: '700' }}
                                >
                                  {(account.user.firstName?.[0] ??
                                    account.user.username?.[0] ??
                                    '?'
                                  ).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.savedAccountText}>
                                <Text
                                  variant="bodyMedium"
                                  style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                                  numberOfLines={1}
                                >
                                  {fullName || account.user.username}
                                </Text>
                                <Text
                                  variant="bodySmall"
                                  style={{ color: theme.colors.onSurfaceVariant }}
                                  numberOfLines={1}
                                >
                                  {metaLine || account.user.email || account.user.username}
                                </Text>
                              </View>
                              <View style={styles.savedAccountActions}>
                                <Button
                                  compact
                                  mode="text"
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    handleForgetRememberedAccount(account.accountId);
                                  }}
                                  disabled={isLoading || !!switchingAccountId}
                                  textColor={theme.colors.onSurfaceVariant}
                                  style={styles.savedAccountForgetButton}
                                >
                                  Forget
                                </Button>
                                <Button
                                  compact
                                  mode="contained-tonal"
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    void handleRememberedAccountLogin(account.accountId);
                                  }}
                                  loading={isSwitching}
                                  disabled={isLoading || !!switchingAccountId}
                                  contentStyle={styles.savedAccountContinueContent}
                                  labelStyle={styles.savedAccountContinueLabel}
                                >
                                  Open
                                </Button>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}

                      {rememberedAccounts.length > 1 ? (
                        <Button
                          compact
                          mode="text"
                          onPress={() => setShowAllRememberedAccounts((current) => !current)}
                          style={styles.savedAccountsToggle}
                        >
                          {showAllRememberedAccounts
                            ? 'Show fewer accounts'
                            : `Show ${rememberedAccounts.length - 1} more account${rememberedAccounts.length - 1 === 1 ? '' : 's'}`}
                        </Button>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>
            </View>

            <View style={styles.footer}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                MuleOps - Mobile Operations Control
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.outline, marginTop: 2 }}>
                Version {APP_VERSION}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {isLoading ? (
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
      ) : null}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  authNavRow: {
    width: '100%',
    marginBottom: 16,
  },
  backPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
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
  formColumn: {
    width: '100%',
    alignItems: 'center',
  },
  formColumnLandscape: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 12,
    paddingRight: 8,
  },
  rememberCheckboxBox: {
    borderWidth: 1,
    borderRadius: 12,
    marginRight: 8,
  },
  rememberTextWrap: {
    flex: 1,
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
  savedAccountsSection: {
    gap: 6,
  },
  savedAccountCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  savedAccountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  savedAccountAvatar: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  savedAccountText: {
    flex: 1,
  },
  savedAccountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    gap: 4,
  },
  savedAccountForgetButton: {
    minWidth: 0,
  },
  savedAccountContinueContent: {
    minHeight: 30,
  },
  savedAccountContinueLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  savedAccountsToggle: {
    alignSelf: 'flex-start',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    width: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LoginScreen;
