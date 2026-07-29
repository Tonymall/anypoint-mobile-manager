// ============================================================
// Login
// ============================================================
// First impression of the app. This file owns the auth flow and
// the page composition only — every piece of chrome lives in
// ./login and is built on the design tokens, so both colour
// schemes are defined by construction rather than by whichever
// hex literal happened to be pasted in.
// ============================================================

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedBackground from '../../components/common/AnimatedBackground';
import { Card } from '../../components/ui';
import { CONTROL_PLANE_REGIONS, getRegionUrl } from '../../config/regions';
import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { useAuthStore } from '../../stores';
import { resetApiState, setRegion } from '../../services/api';
import * as authService from '../../services/authService';
import { activateRememberedAccount } from '../../services/rememberedAccountService';
import { resetSessionFlags } from '../../services/runtimeService';
import { spacing, useTokens } from '../../theme';
import type { AuthTokens, ControlPlaneRegionId, User } from '../../types';
import { hapticError, hapticSuccess } from '../../utils/haptics';
import logger from '../../utils/logger';
import {
  BackPill,
  BrandLockup,
  ErrorBanner,
  GhostButton,
  LoginField,
  LoginFooter,
  OrDivider,
  PrimaryButton,
  RegionSelector,
  RememberToggle,
  Reveal,
  SavedAccounts,
  type LoginErrorState,
} from './login';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Entrance stagger, in ms, for the three bands of the page. */
const REVEAL = { brand: 0, form: 90, extras: 180, footer: 260 };

const LoginScreen: React.FC = () => {
  const t = useTokens();
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
  const horizontalPadding = isTablet ? spacing.xxxl + spacing.sm : spacing.xxl;

  const [username, setUsername] = useState(rememberedUsername ?? '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [showAllRememberedAccounts, setShowAllRememberedAccounts] = useState(false);
  // Mirrors whatever the global error dialog was told, so the message is
  // still readable after the dialog is dismissed. Never holds credentials.
  const [formError, setFormError] = useState<LoginErrorState | null>(null);
  const [touched, setTouched] = useState({ username: false, password: false });

  const passwordRef = useRef<RNTextInput>(null);

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

  const isFormValid = username.trim().length > 0 && password.trim().length > 0;
  const isAddAccountMode = fromSettings === '1';
  const busy = isLoading || Boolean(switchingAccountId);

  const usernameError =
    touched.username && username.trim().length === 0
      ? 'Enter your Anypoint username'
      : null;
  const passwordError =
    touched.password && password.trim().length === 0 ? 'Enter your password' : null;

  const handleRegionSelect = useCallback(
    async (regionId: ControlPlaneRegionId) => {
      setSelectedRegion(regionId);
      await setRegion(regionId);
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

  /**
   * Surfaces a failure in both places: the global error dialog, exactly as
   * before, and the inline banner — which is still there after the dialog
   * is dismissed and the user is retyping. Same wording, one source.
   */
  const reportFailure = useCallback(
    (failure: LoginErrorState) => {
      setFormError(failure);
      showError({
        title: failure.title,
        message: failure.message,
        details: failure.detail,
      });
    },
    [showError],
  );

  const handleUsernameChange = useCallback((next: string) => {
    setUsername(next);
    setFormError(null);
  }, []);

  const handlePasswordChange = useCallback((next: string) => {
    setPassword(next);
    setFormError(null);
  }, []);

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      setTouched({ username: true, password: true });
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
    setFormError(null);
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
        reportFailure({
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
          reportFailure({
            title: 'Session rejected',
            message: 'Session token was rejected. Please sign in again.',
            detail: 'HTTP 401 while loading the authenticated profile.',
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
      reportFailure({
        title: 'Login failed',
        message,
        detail: status ? `HTTP ${status}` : undefined,
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
    reportFailure,
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
        reportFailure({
          title: 'Unable to continue',
          message: error?.message ?? 'Saved session could not be restored.',
        });
        hapticError();
      } finally {
        setSwitchingAccountId(null);
        setIsLoadingStore(false);
      }
    },
    [queryClient, reportFailure, router, selectedRegion, setIsLoadingStore],
  );

  const handleForgetRememberedAccount = useCallback(
    (accountId: string) => {
      removeRememberedAccount(accountId);
    },
    [removeRememberedAccount],
  );

  const handleOpenRememberedAccount = useCallback(
    (accountId: string) => {
      void handleRememberedAccountLogin(accountId);
    },
    [handleRememberedAccountLogin],
  );

  const handleToggleShowAllAccounts = useCallback(() => {
    setShowAllRememberedAccounts((current) => !current);
  }, []);

  const handleSelectRegion = useCallback(
    (regionId: ControlPlaneRegionId) => {
      void handleRegionSelect(regionId);
    },
    [handleRegionSelect],
  );

  const dismissFormError = useCallback(() => setFormError(null), []);

  const markUsernameTouched = useCallback(
    () => setTouched((current) => ({ ...current, username: true })),
    [],
  );
  const markPasswordTouched = useCallback(
    () => setTouched((current) => ({ ...current, password: true })),
    [],
  );

  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);
  const submit = useCallback(() => {
    void handleLogin();
  }, [handleLogin]);

  // ── Composition ───────────────────────────────────────────────────

  const brand = (
    <Reveal delay={REVEAL.brand} style={isTabletLandscape ? styles.brandColumn : styles.brandStack}>
      <BrandLockup
        variant={isTablet ? 'large' : isLandscape ? 'compact' : 'regular'}
        align={isTabletLandscape ? 'left' : 'center'}
      />
    </Reveal>
  );

  const form = (
    <View
      style={[
        styles.formColumn,
        { maxWidth: formMaxWidth },
        isTabletLandscape && styles.formColumnLandscape,
      ]}
    >
      <Reveal delay={REVEAL.form} style={styles.band}>
        <Card accent={t.color.brand.base}>
          <View style={styles.cardInner}>
            <ErrorBanner error={formError} onDismiss={dismissFormError} />

            <RegionSelector
              selectedRegion={selectedRegion}
              onSelect={handleSelectRegion}
              disabled={busy}
            />

            <LoginField
              label="Username"
              icon="account-outline"
              value={username}
              onChangeText={handleUsernameChange}
              onBlur={markUsernameTouched}
              error={usernameError}
              disabled={busy}
              autoComplete="username"
              textContentType="username"
              keyboardType="default"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={focusPassword}
              testID="login-username"
            />

            <LoginField
              label="Password"
              icon="lock-outline"
              value={password}
              onChangeText={handlePasswordChange}
              onBlur={markPasswordTouched}
              error={passwordError}
              disabled={busy}
              secure
              inputRef={passwordRef}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={submit}
              testID="login-password"
            />

            <RememberToggle
              value={rememberSession}
              onChange={setRememberSessionState}
              disabled={busy}
            />

            <PrimaryButton
              label="Sign in"
              loadingLabel="Signing in…"
              icon="arrow-right"
              onPress={submit}
              loading={isLoading}
              disabled={!isFormValid || busy}
              accessibilityLabel={
                isLoading ? 'Signing in, please wait' : 'Sign in to Anypoint Platform'
              }
              accessibilityHint={
                isFormValid ? undefined : 'Enter your username and password first'
              }
              testID="login-submit"
            />

            <OrDivider label="or" />

            <GhostButton
              label="Continue with SSO"
              icon="shield-key-outline"
              onPress={handleSSOLogin}
              disabled={busy}
              accessibilityLabel="Sign in with single sign-on"
              testID="login-sso"
            />
          </View>
        </Card>
      </Reveal>

      {!isAddAccountMode && rememberedAccounts.length > 0 ? (
        <Reveal delay={REVEAL.extras} style={styles.band}>
          <SavedAccounts
            accounts={rememberedAccounts}
            switchingAccountId={switchingAccountId}
            busy={isLoading}
            showAll={showAllRememberedAccounts}
            onToggleShowAll={handleToggleShowAllAccounts}
            onOpen={handleOpenRememberedAccount}
            onForget={handleForgetRememberedAccount}
          />
        </Reveal>
      ) : null}

      <Reveal delay={REVEAL.footer} style={styles.band}>
        <LoginFooter version={APP_VERSION} />
      </Reveal>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.color.surface.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AnimatedBackground />

      <ScrollView
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: insets.bottom + spacing.xxl,
            paddingHorizontal: horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          {isAddAccountMode ? (
            <BackPill
              label="Back"
              onPress={handleReturnFromAddAccount}
              accessibilityLabel="Back to settings"
            />
          ) : null}

          <View style={[styles.inner, isTabletLandscape && styles.innerLandscape]}>
            {brand}
            {form}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentContainer: {
    // flexGrow (not flex) so the form stays centred when it fits and
    // scrolls when the keyboard or a large Dynamic Type size pushes it
    // past the viewport.
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  page: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  inner: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  innerLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 900,
    gap: spacing.xxxl,
  },
  brandStack: {
    width: '100%',
    alignItems: 'center',
  },
  brandColumn: {
    flex: 2,
  },
  formColumn: {
    width: '100%',
    alignSelf: 'center',
    gap: spacing.xl,
  },
  formColumnLandscape: {
    flex: 3,
    width: undefined,
  },
  band: {
    width: '100%',
  },
  cardInner: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
});

export default LoginScreen;
