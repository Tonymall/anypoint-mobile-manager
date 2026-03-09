// ============================================================
// Settings Screen - App preferences, region, theme, logout
// 2026 Modern Dark-First Design
// ============================================================

import React, { useCallback, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  Switch,
  useTheme,
  Button,
  RadioButton,
  Portal,
  Dialog,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { useLegalStore } from '../../stores/legalStore';
import { TERMS_VERSION } from '../../constants/legal';
import * as authService from '../../services/authService';
import { resetSessionFlags } from '../../services/runtimeService';
import { getRegionById } from '../../config/regions';
import { hapticWarning, hapticSelection } from '../../utils/haptics';
import { anypointColors } from '../../theme';
import { requestPermissions } from '../../services/notificationService';
import { useNotificationStore } from '../../stores/notificationStore';
import { useRemoteConfigStore } from '../../stores/remoteConfigStore';
import logger from '../../utils/logger';
import Constants from 'expo-constants';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const RELEASE_STAGE = ((Constants.expoConfig?.extra as { releaseStage?: string } | undefined)?.releaseStage ?? 'beta').toUpperCase();

// â”€â”€ Reusable Setting Row â”€â”€
const SettingRow: React.FC<{
  icon: string;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}> = ({ icon, iconColor, iconBg, title, subtitle, right, onPress, showChevron }) => {
  const theme = useTheme();
  const content = (
    <View style={rowStyles.container}>
      <View style={[rowStyles.iconBox, { backgroundColor: iconBg ?? theme.colors.surfaceVariant }]}>
        <Icon name={icon} size={18} color={iconColor ?? theme.colors.onSurfaceVariant} />
      </View>
      <View style={rowStyles.textCol}>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '500' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron && !right && (
        <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
      )}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: theme.colors.primaryContainer }}
        accessibilityLabel={`${title}${subtitle ? ': ' + subtitle : ''}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to change"
      >
        {content}
      </Pressable>
    );
  }
  return content;
};

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
  },
});

const SettingsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useAuthStore((s) => s.user);
  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const logout = useAuthStore((s) => s.logout);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const queryClient = useQueryClient();
  const termsAcceptance = useLegalStore((s) => user ? s.getAcceptance(user.id) : undefined);
  const remoteReleaseStage = useRemoteConfigStore((s) => s.config?.releaseStage);

  const [themeDialogVisible, setThemeDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const currentRegion = getRegionById(selectedRegion);

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
      // Clear notifications â€” they belong to the current account/session.
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

  const envColor = currentEnv?.isProduction ? anypointColors.success : anypointColors.warning;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* â”€â”€ Profile Card â”€â”€ */}
      <View style={styles.profileCard}>
        {/* Accent glow at top */}
        <View style={styles.profileAccent} />

        <View style={styles.profileContent}>
          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '18' }]}>
            <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
              {initials}
            </Text>
            {/* Online indicator */}
            <View style={styles.onlineDot} />
          </View>

          <Text variant="titleLarge" style={[styles.profileName, { color: theme.colors.onSurface }]}>
            {user ? `${user.firstName} ${user.lastName}` : 'User'}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {user?.email ?? ''}
          </Text>

          {/* Chips row */}
          <View style={styles.chipsRow}>
            <View style={[styles.chip, { backgroundColor: theme.colors.primary + '14' }]}>
              <Icon name="domain" size={13} color={theme.colors.primary} />
              <Text style={[styles.chipText, { color: theme.colors.primary }]}>
                {currentOrg?.name ?? user?.organizationName ?? 'N/A'}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.colors.secondary + '14' }]}>
              <Icon name="earth" size={13} color={theme.colors.secondary} />
              <Text style={[styles.chipText, { color: theme.colors.secondary }]}>
                {currentRegion.label}
              </Text>
            </View>
          </View>

          {currentEnv && (
            <View style={[styles.chip, { backgroundColor: envColor + '14', marginTop: 6 }]}>
              <Icon
                name={currentEnv.isProduction ? 'shield-check' : 'test-tube'}
                size={13}
                color={envColor}
              />
              <Text style={[styles.chipText, { color: envColor }]}>
                {currentEnv.name}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* â”€â”€ Administration Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: anypointColors.mulePurple }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          ADMINISTRATION
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon="shield-crown-outline"
          iconColor={anypointColors.mulePurple}
          iconBg={anypointColors.mulePurple + '14'}
          title="Admin Panel"
          subtitle="Users, Connected Apps, Secrets"
          onPress={() => router.push('/(main)/admin' as any)}
          showChevron
        />
      </View>

      {/* â”€â”€ Organization Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: theme.colors.primary }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          ORGANIZATION
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon="domain"
          iconColor={theme.colors.primary}
          iconBg={theme.colors.primary + '14'}
          title="Switch Organization"
          subtitle={currentOrg?.name ?? 'Not selected'}
          onPress={handleSwitchOrg}
          showChevron
        />
        <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
        <SettingRow
          icon="server"
          iconColor={theme.colors.tertiary}
          iconBg={theme.colors.tertiary + '14'}
          title="Switch Environment"
          subtitle={currentEnv?.name ?? 'Not selected'}
          onPress={handleSwitchEnv}
          showChevron
        />
      </View>

      {/* â”€â”€ Connection Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: theme.colors.secondary }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          CONNECTION
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon="earth"
          iconColor={theme.colors.secondary}
          iconBg={theme.colors.secondary + '14'}
          title="Control Plane"
          subtitle={`${currentRegion.label} - ${currentRegion.notes}`}
        />
        <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
        <SettingRow
          icon="link-variant"
          iconColor={theme.colors.onSurfaceVariant}
          title="API Endpoint"
          subtitle={currentRegion.url}
        />
      </View>

      {/* â”€â”€ Appearance Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: anypointColors.mulePurple }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          APPEARANCE
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon={themeIcon}
          iconColor={anypointColors.mulePurple}
          iconBg={anypointColors.mulePurple + '14'}
          title="Theme"
          subtitle={themeLabel}
          onPress={() => setThemeDialogVisible(true)}
          showChevron
        />
      </View>

      {/* â”€â”€ Notifications Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: anypointColors.warning }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          NOTIFICATIONS
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon="bell-outline"
          iconColor={anypointColors.warning}
          iconBg={anypointColors.warning + '14'}
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
        <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
        <SettingRow
          icon="alert-circle-outline"
          iconColor={anypointColors.error}
          iconBg={anypointColors.error + '14'}
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
        <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
        <SettingRow
          icon="rocket-launch-outline"
          iconColor={anypointColors.info}
          iconBg={anypointColors.info + '14'}
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
      </View>

      {/* â”€â”€ Legal Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: theme.colors.tertiary }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          LEGAL
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon="file-document-outline"
          iconColor={theme.colors.tertiary}
          iconBg={theme.colors.tertiary + '14'}
          title="Terms & Conditions"
          subtitle={
            termsAcceptance
              ? `Accepted \u00B7 Version ${termsAcceptance.version}`
              : `Version ${TERMS_VERSION}`
          }
          onPress={() => router.push('/(main)/terms' as any)}
          showChevron
        />
        <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
        <SettingRow
          icon="bug-outline"
          iconColor={anypointColors.warning}
          iconBg={anypointColors.warning + '14'}
          title="Report a Bug"
          subtitle="Tell us what went wrong"
          onPress={() => router.push('/(main)/report-bug' as any)}
          showChevron
        />
      </View>

      {/* â”€â”€ About Section â”€â”€ */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: theme.colors.onSurfaceVariant }]} />
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
          ABOUT
        </Text>
      </View>
      <View style={styles.card}>
        <SettingRow
          icon="information-outline"
          iconColor={theme.colors.onSurfaceVariant}
          title="Version"
          subtitle={`${APP_VERSION} (${(remoteReleaseStage ?? RELEASE_STAGE.toLowerCase()).toUpperCase()})`}
        />
      </View>

      {/* â”€â”€ Sign Out â”€â”€ */}
      <Pressable
        onPress={() => setLogoutDialogVisible(true)}
        disabled={loggingOut}
        style={[styles.logoutBtn, { borderColor: theme.colors.error + '40' }]}
        android_ripple={{ color: theme.colors.error + '20' }}
        accessibilityLabel="Sign out"
        accessibilityRole="button"
      >
        <Icon name="logout" size={18} color={theme.colors.error} />
        <Text style={[styles.logoutText, { color: theme.colors.error }]}>
          {loggingOut ? 'Signing Out...' : 'Sign Out'}
        </Text>
      </Pressable>

      {/* Theme Dialog */}
      <Portal>
        <Dialog
          visible={themeDialogVisible}
          onDismiss={() => setThemeDialogVisible(false)}
          style={styles.dialog}
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
          style={styles.dialog}
        >
          <Dialog.Title>Sign Out</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to sign out? You will need to enter your credentials again to access the platform.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleLogout} textColor={theme.colors.error}>Sign Out</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

    </ScrollView>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    // â”€â”€ Profile Card â”€â”€
    profileCard: {
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    },
    profileAccent: {
      height: 3,
      backgroundColor: theme.colors.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    profileContent: {
      alignItems: 'center',
      padding: 24,
      paddingTop: 20,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarText: {
      fontSize: 26,
      fontWeight: '700',
    },
    onlineDot: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: anypointColors.success,
      borderWidth: 2.5,
      borderColor: theme.colors.surface,
    },
    profileName: {
      fontWeight: '700',
      marginBottom: 2,
      letterSpacing: -0.3,
    },
    chipsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      gap: 5,
    },
    chipText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    // â”€â”€ Sections â”€â”€
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      marginTop: 20,
      marginBottom: 8,
    },
    sectionAccent: {
      width: 3,
      height: 14,
      borderRadius: 2,
    },
    card: {
      marginHorizontal: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 66,
    },
    // â”€â”€ Logout â”€â”€
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 28,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
    },
    logoutText: {
      fontSize: 15,
      fontWeight: '600',
    },
    // â”€â”€ Dialog â”€â”€
    dialog: {
      borderRadius: 24,
    },
  });

export default SettingsScreen;


