// ============================================================
// Settings — account, organization, appearance, notifications
// ============================================================
// One list, not several improvised ones: every section is the same
// shape (a labelled header over a single card), every row is the same
// height, and every icon sits in the same 34pt well tinted with its
// own status role. Section rhythm and row rhythm each come from one
// constant, so the page reads as a single stack.
//
// Built on the design token layer — no raw colours, no `color + 'NN'`
// alpha strings, no ad-hoc font sizes, and light mode is defined by
// construction rather than inherited by accident.
// ============================================================

import React, { useCallback, useState, useMemo, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  Switch,
  Button,
  RadioButton,
  Portal,
  Dialog,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { useLegalStore } from '../../stores/legalStore';
import { TERMS_VERSION } from '../../constants/legal';
import * as authService from '../../services/authService';
import { activateRememberedAccount } from '../../services/rememberedAccountService';
import { resetSessionFlags } from '../../services/runtimeService';
import { getRegionById } from '../../config/regions';
import { hapticWarning, hapticSelection } from '../../utils/haptics';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { requestPermissions } from '../../services/notificationService';
import { useNotificationStore } from '../../stores/notificationStore';
import { useRemoteConfigStore } from '../../stores/remoteConfigStore';
import { useErrorDialogStore } from '../../stores/errorDialogStore';
import logger from '../../utils/logger';
import Constants from 'expo-constants';
import type { IconName } from '../../types/icons';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const RELEASE_STAGE = ((Constants.expoConfig?.extra as { releaseStage?: string } | undefined)?.releaseStage ?? 'beta').toUpperCase();
const PRIVACY_POLICY_URL = `${(process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://muleops-backend.onrender.com').replace(/\/$/, '')}/privacy-policy`;

/** One icon well size, one row height — the rhythm of the whole page. */
const ICON_WELL = 34;
const ROW_HEIGHT = 60;
/** Separator starts where the row text starts, so the list reads as one column. */
const SEPARATOR_INSET = spacing.lg + ICON_WELL + spacing.md;

async function openExternalUrl(url: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      logger.warn('[Settings] Unable to open external URL:', url);
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    logger.warn('[Settings] Failed to open external URL:', (error as Error)?.message);
  }
}

// ── Section: label + single card, the only section shape on the page ──
const SettingsSection: React.FC<{
  title: string;
  role: StatusRole;
  children: ReactNode;
  t: Tokens;
}> = ({ title, role, children, t }) => {
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: role.base }]} />
        <Text style={[styles.sectionTitle, { color: t.color.text.tertiary }]}>
          {title}
        </Text>
      </View>
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.color.surface.raised,
            borderColor: t.color.border.subtle,
          },
        ]}
      >
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {index > 0 ? (
              <View
                style={[styles.separator, { backgroundColor: t.color.border.subtle }]}
              />
            ) : null}
            {row}
          </React.Fragment>
        ))}
      </View>
    </>
  );
};

// ── Row: one height, one icon well, one type pairing ──
const SettingRow: React.FC<{
  icon: IconName;
  role?: StatusRole;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  t: Tokens;
}> = ({ icon, role, title, subtitle, right, onPress, showChevron, t }) => {
  const wellColor = role?.base ?? t.color.text.secondary;
  const wellSurface = role?.surface ?? t.color.surface.sunken;

  const content = (
    <View style={styles.row}>
      <View style={[styles.iconWell, { backgroundColor: wellSurface }]}>
        <Icon name={icon} size={18} color={wellColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: t.color.text.primary }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.rowSubtitle, { color: t.color.text.tertiary }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron && !right && (
        <Icon name="chevron-right" size={20} color={t.color.text.tertiary} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: t.color.brand.surface }}
        accessibilityLabel={`${title}${subtitle ? ': ' + subtitle : ''}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to change"
        style={({ pressed }) => [
          pressed && { backgroundColor: withAlpha(t.color.text.primary, 'faint') },
        ]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
};

const SettingsScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const userId = useAuthStore((s) => s.user?.id);
  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const logout = useAuthStore((s) => s.logout);
  const rememberedAccountsMap = useAuthStore((s) => s.rememberedAccounts);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const showError = useErrorDialogStore((s) => s.showError);
  const queryClient = useQueryClient();
  const termsAcceptance = useLegalStore((s) => user ? s.getAcceptance(user.id) : undefined);
  const remoteReleaseStage = useRemoteConfigStore((s) => s.config?.releaseStage);

  const [themeDialogVisible, setThemeDialogVisible] = useState(false);
  const [accountDialogVisible, setAccountDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);

  const currentRegion = getRegionById(selectedRegion);
  const rememberedAccounts = useMemo(
    () =>
      Object.values(rememberedAccountsMap).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [rememberedAccountsMap],
  );
  const otherRememberedAccounts = useMemo(
    () => rememberedAccounts.filter((account) => account.accountId !== userId),
    [rememberedAccounts, userId],
  );

  const handleThemeChange = useCallback(
    (value: 'light' | 'dark' | 'system') => {
      updateSettings({ theme: value });
      setThemeDialogVisible(false);
    },
    [updateSettings],
  );

  const handleLogout = useCallback(async () => {
    hapticWarning();
    logger.log('[Settings] Logout initiated');
    setLoggingOut(true);
    setLogoutDialogVisible(false);
    try {
      await authService.logout();
      logger.log('[Settings] authService.logout() complete (API state reset)');
      resetSessionFlags();
      logger.log('[Settings] runtimeService session flags reset');
    } finally {
      queryClient.clear();
      logger.log('[Settings] queryClient cleared');
      // Clear notifications — they belong to the current account/session.
      // Prevents stale notifications from showing on a different account.
      const { clearAll } = require('../../stores/notificationStore').useNotificationStore.getState();
      clearAll();
      logger.log('[Settings] notifications cleared');
      logout();
      logger.log('[Settings] authStore.logout() complete');
      setLoggingOut(false);
    }
  }, [logout, queryClient]);

  const handleSwitchOrg = useCallback(() => {
    router.push({ pathname: '/(auth)/select-org' as any, params: { fromSettings: '1' } });
  }, [router]);

  const handleSwitchEnv = useCallback(() => {
    queryClient.clear();
    router.push({ pathname: '/(auth)/select-env' as any, params: { fromSettings: '1' } });
  }, [router, queryClient]);

  const handleAddAnotherAccount = useCallback(() => {
    router.push({ pathname: '/(auth)/login' as any, params: { fromSettings: '1' } });
  }, [router]);

  const handleSwitchAccount = useCallback(
    async (accountId: string) => {
      if (accountId === userId) {
        setAccountDialogVisible(false);
        return;
      }

      setSwitchingAccountId(accountId);
      setAccountDialogVisible(false);
      queryClient.clear();
      resetSessionFlags();

      try {
        await activateRememberedAccount(accountId);
        router.replace('/(main)' as any);
      } catch (error) {
        logger.warn('[Settings] Failed to switch account:', (error as Error)?.message);
        showError({
          title: 'Unable to switch account',
          message: (error as Error)?.message ?? 'Please try again.',
        });
      } finally {
        setSwitchingAccountId(null);
      }
    },
    [queryClient, router, showError, userId],
  );

  const themeLabel =
    settings.theme === 'system'
      ? 'System'
      : settings.theme === 'dark'
        ? 'Dark'
        : 'Light';

  const themeIcon =
    settings.theme === 'dark'
      ? 'weather-night'
      : settings.theme === 'light'
        ? 'white-balance-sunny'
        : 'theme-light-dark';

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    : '?';

  const envRole = currentEnv?.isProduction
    ? t.color.status.success
    : t.color.status.warning;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: t.color.surface.canvas }]}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile Card ── */}
      <View
        style={[
          styles.profileCard,
          {
            backgroundColor: t.color.surface.raised,
            borderColor: t.color.border.subtle,
          },
        ]}
      >
        <View style={[styles.profileAccent, { backgroundColor: t.color.brand.base }]} />

        <View style={styles.profileContent}>
          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: t.color.brand.surface }]}>
            <Text style={[styles.avatarText, { color: t.color.text.accent }]}>
              {initials}
            </Text>
            <View
              style={[
                styles.onlineDot,
                {
                  backgroundColor: t.color.status.success.base,
                  borderColor: t.color.surface.raised,
                },
              ]}
            />
          </View>

          <Text style={[styles.profileName, { color: t.color.text.primary }]}>
            {user ? `${user.firstName} ${user.lastName}` : 'User'}
          </Text>
          <Text style={[styles.profileEmail, { color: t.color.text.tertiary }]}>
            {user?.email ?? ''}
          </Text>

          {/* Chips row */}
          <View style={styles.chipsRow}>
            <View style={[styles.chip, { backgroundColor: t.color.brand.surface }]}>
              <Icon name="domain" size={13} color={t.color.text.accent} />
              <Text style={[styles.chipText, { color: t.color.text.accent }]}>
                {currentOrg?.name ?? user?.organizationName ?? 'N/A'}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: t.color.accent.secondary.surface }]}>
              <Icon name="earth" size={13} color={t.color.accent.secondary.base} />
              <Text style={[styles.chipText, { color: t.color.accent.secondary.base }]}>
                {currentRegion.label}
              </Text>
            </View>
          </View>

          {currentEnv && (
            <View style={[styles.chip, styles.envChip, { backgroundColor: envRole.surface }]}>
              <Icon
                name={currentEnv.isProduction ? 'shield-check' : 'test-tube'}
                size={13}
                color={envRole.base}
              />
              <Text style={[styles.chipText, { color: envRole.base }]}>
                {currentEnv.name}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Accounts ── */}
      <SettingsSection title="ACCOUNTS" role={t.color.accent.brand} t={t}>
        <SettingRow
          t={t}
          icon="account-switch-outline"
          role={t.color.accent.brand}
          title="Switch Account"
          subtitle={
            otherRememberedAccounts.length > 0
              ? `${otherRememberedAccounts.length} other saved account${otherRememberedAccounts.length === 1 ? '' : 's'}`
              : 'No other saved accounts yet'
          }
          onPress={otherRememberedAccounts.length > 0 ? () => setAccountDialogVisible(true) : undefined}
          showChevron={otherRememberedAccounts.length > 0}
          right={
            switchingAccountId ? (
              <Text style={[styles.rowMeta, { color: t.color.text.tertiary }]}>
                Switching...
              </Text>
            ) : undefined
          }
        />
        <SettingRow
          t={t}
          icon="account-plus-outline"
          role={t.color.accent.secondary}
          title="Add Another Account"
          subtitle="Keep your current account and sign in to another client"
          onPress={handleAddAnotherAccount}
          showChevron
        />
      </SettingsSection>

      {/* ── Administration ── */}
      <SettingsSection title="ADMINISTRATION" role={t.color.accent.tertiary} t={t}>
        <SettingRow
          t={t}
          icon="shield-crown-outline"
          role={t.color.accent.tertiary}
          title="Admin Panel"
          subtitle="Users, Connected Apps, Secrets"
          onPress={() => router.push('/(main)/admin' as any)}
          showChevron
        />
      </SettingsSection>

      {/* ── Organization ── */}
      <SettingsSection title="ORGANIZATION" role={t.color.accent.brand} t={t}>
        <SettingRow
          t={t}
          icon="domain"
          role={t.color.accent.brand}
          title="Switch Organization"
          subtitle={currentOrg?.name ?? 'Not selected'}
          onPress={handleSwitchOrg}
          showChevron
        />
        <SettingRow
          t={t}
          icon="server"
          role={t.color.status.success}
          title="Switch Environment"
          subtitle={currentEnv?.name ?? 'Not selected'}
          onPress={handleSwitchEnv}
          showChevron
        />
      </SettingsSection>

      {/* ── Connection ── */}
      <SettingsSection title="CONNECTION" role={t.color.accent.secondary} t={t}>
        <SettingRow
          t={t}
          icon="earth"
          role={t.color.accent.secondary}
          title="Control Plane"
          subtitle={`${currentRegion.label} - ${currentRegion.notes}`}
        />
        <SettingRow
          t={t}
          icon="link-variant"
          title="API Endpoint"
          subtitle={currentRegion.url}
        />
      </SettingsSection>

      {/* ── Appearance ── */}
      <SettingsSection title="APPEARANCE" role={t.color.accent.tertiary} t={t}>
        <SettingRow
          t={t}
          icon={themeIcon}
          role={t.color.accent.tertiary}
          title="Theme"
          subtitle={themeLabel}
          onPress={() => setThemeDialogVisible(true)}
          showChevron
        />
      </SettingsSection>

      {/* ── Notifications ── */}
      <SettingsSection title="NOTIFICATIONS" role={t.color.status.warning} t={t}>
        <SettingRow
          t={t}
          icon="bell-outline"
          role={t.color.status.warning}
          title="Push Notifications"
          right={
            <Switch
              value={settings.pushNotificationsEnabled}
              onValueChange={async (val) => {
                hapticSelection();
                if (val) {
                  // Request permission when user enables notifications
                  const granted = await requestPermissions();
                  useNotificationStore.getState().setPermissionGranted(granted);
                  if (!granted) return; // Don't enable if permission denied
                }
                updateSettings({ pushNotificationsEnabled: val });
              }}
              accessibilityLabel={`Push notifications ${settings.pushNotificationsEnabled ? 'enabled' : 'disabled'}`}
            />
          }
        />
        <SettingRow
          t={t}
          icon="alert-circle-outline"
          role={t.color.status.danger}
          title="Critical Alerts"
          right={
            <Switch
              value={settings.notificationPreferences.criticalAlerts}
              onValueChange={(val) => {
                hapticSelection();
                updateSettings({
                  notificationPreferences: {
                    ...settings.notificationPreferences,
                    criticalAlerts: val,
                  },
                });
              }}
              accessibilityLabel={`Critical alerts ${settings.notificationPreferences.criticalAlerts ? 'enabled' : 'disabled'}`}
            />
          }
        />
        <SettingRow
          t={t}
          icon="rocket-launch-outline"
          role={t.color.status.info}
          title="Deployment Updates"
          right={
            <Switch
              value={settings.notificationPreferences.deploymentUpdates}
              onValueChange={(val) => {
                hapticSelection();
                updateSettings({
                  notificationPreferences: {
                    ...settings.notificationPreferences,
                    deploymentUpdates: val,
                  },
                });
              }}
              accessibilityLabel={`Deployment updates ${settings.notificationPreferences.deploymentUpdates ? 'enabled' : 'disabled'}`}
            />
          }
        />
      </SettingsSection>

      {/* ── Legal ── */}
      <SettingsSection title="LEGAL" role={t.color.status.success} t={t}>
        <SettingRow
          t={t}
          icon="file-document-outline"
          role={t.color.status.success}
          title="Terms & Conditions"
          subtitle={
            termsAcceptance
              ? `Accepted · Version ${termsAcceptance.version}`
              : `Version ${TERMS_VERSION}`
          }
          onPress={() => router.push('/(main)/terms' as any)}
          showChevron
        />
        <SettingRow
          t={t}
          icon="shield-account-outline"
          role={t.color.accent.brand}
          title="Privacy Policy"
          subtitle="How MuleOps handles data"
          onPress={() => {
            void openExternalUrl(PRIVACY_POLICY_URL);
          }}
          showChevron
        />
        <SettingRow
          t={t}
          icon="bug-outline"
          role={t.color.status.warning}
          title="Report a Bug"
          subtitle="Tell us what went wrong"
          onPress={() => router.push('/(main)/report-bug' as any)}
          showChevron
        />
      </SettingsSection>

      {/* ── About ── */}
      <SettingsSection title="ABOUT" role={t.color.status.neutral} t={t}>
        <SettingRow
          t={t}
          icon="information-outline"
          title="Version"
          subtitle={`${APP_VERSION} (${(remoteReleaseStage ?? RELEASE_STAGE.toLowerCase()).toUpperCase()})`}
        />
      </SettingsSection>

      {/* ── Sign Out ── */}
      <Pressable
        onPress={() => setLogoutDialogVisible(true)}
        disabled={loggingOut}
        style={[
          styles.logoutBtn,
          {
            borderColor: t.color.status.danger.border,
            backgroundColor: t.color.status.danger.surface,
          },
        ]}
        android_ripple={{ color: t.color.status.danger.surface }}
        accessibilityLabel="Sign out"
        accessibilityRole="button"
      >
        <Icon name="logout" size={18} color={t.color.status.danger.base} />
        <Text style={[styles.logoutText, { color: t.color.status.danger.base }]}>
          {loggingOut ? 'Signing Out...' : 'Sign Out'}
        </Text>
      </Pressable>

      {/* Theme Dialog */}
      <Portal>
        <Dialog
          visible={accountDialogVisible}
          onDismiss={() => setAccountDialogVisible(false)}
          style={[styles.dialog, { backgroundColor: t.color.surface.raised }]}
        >
          <Dialog.Title>Switch Account</Dialog.Title>
          <Dialog.Content>
            {rememberedAccounts.map((account) => {
              const fullName = `${account.user.firstName ?? ''} ${account.user.lastName ?? ''}`.trim();
              const isCurrent = account.accountId === userId;

              return (
                <Pressable
                  key={account.accountId}
                  onPress={() => {
                    void handleSwitchAccount(account.accountId);
                  }}
                  disabled={isCurrent}
                  style={[
                    styles.accountOption,
                    {
                      borderColor: isCurrent
                        ? t.color.brand.base
                        : t.color.border.subtle,
                      backgroundColor: isCurrent
                        ? t.color.brand.surface
                        : t.color.surface.sunken,
                    },
                  ]}
                >
                  <View style={styles.accountOptionText}>
                    <Text style={[styles.accountName, { color: t.color.text.primary }]}>
                      {fullName || account.user.username}
                    </Text>
                    <Text style={[styles.accountMeta, { color: t.color.text.tertiary }]}>
                      {account.user.email || account.user.username}
                    </Text>
                    <Text style={[styles.accountMeta, { color: t.color.text.tertiary }]}>
                      {account.currentOrganization?.name ?? account.user.organizationName}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.accountMeta,
                      { color: isCurrent ? t.color.text.accent : t.color.text.tertiary },
                    ]}
                  >
                    {isCurrent ? 'Current' : getRegionById(account.selectedRegion).label}
                  </Text>
                </Pressable>
              );
            })}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAccountDialogVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={themeDialogVisible}
          onDismiss={() => setThemeDialogVisible(false)}
          style={[styles.dialog, { backgroundColor: t.color.surface.raised }]}
        >
          <Dialog.Title>Choose Theme</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              value={settings.theme}
              onValueChange={(v) => handleThemeChange(v as 'light' | 'dark' | 'system')}
            >
              <RadioButton.Item label="Light" value="light" />
              <RadioButton.Item label="Dark" value="dark" />
              <RadioButton.Item label="System default" value="system" />
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setThemeDialogVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Logout Confirmation Dialog */}
      <Portal>
        <Dialog
          visible={logoutDialogVisible}
          onDismiss={() => setLogoutDialogVisible(false)}
          style={[styles.dialog, { backgroundColor: t.color.surface.raised }]}
        >
          <Dialog.Title>Sign Out</Dialog.Title>
          <Dialog.Content>
            <Text style={[styles.dialogBody, { color: t.color.text.secondary }]}>
              Are you sure you want to sign out? You will need to enter your credentials again to access the platform.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleLogout} textColor={t.color.status.danger.base}>Sign Out</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Profile Card ──
  profileCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  profileAccent: {
    height: 3,
  },
  profileContent: {
    alignItems: 'center',
    padding: spacing.xxl,
    paddingTop: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: typeScale.metric,
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: radii.pill,
    borderWidth: 2.5,
  },
  profileName: { ...typeScale.title, marginBottom: 2 },
  profileEmail: typeScale.bodySmall,
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    gap: 5,
  },
  envChip: {
    marginTop: 6,
  },
  chipText: typeScale.caption,
  // ── Sections ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  sectionTitle: { ...typeScale.label, letterSpacing: 0.8 },
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SEPARATOR_INSET,
  },
  // ── Rows ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: typeScale.subheading,
  rowSubtitle: { ...typeScale.bodySmall, fontWeight: '400', marginTop: 1 },
  rowMeta: typeScale.bodySmall,
  // ── Dialogs ──
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    marginBottom: 10,
    gap: spacing.md,
  },
  accountOptionText: {
    flex: 1,
    gap: 2,
  },
  accountName: typeScale.subheading,
  accountMeta: typeScale.bodySmall,
  dialog: {
    borderRadius: radii.xl,
  },
  dialogBody: typeScale.body,
  // ── Logout ──
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  logoutText: typeScale.subheading,
});

export default SettingsScreen;
