// ============================================================
// Settings Screen - App preferences, region, theme, logout
// ============================================================

import React, { useCallback, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View, ScrollView } from 'react-native';
import {
  Text,
  List,
  Switch,
  Divider,
  useTheme,
  Button,
  RadioButton,
  Portal,
  Dialog,
  Avatar,
  Surface,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import * as authService from '../../services/authService';
import { setRegion } from '../../services/api';
import { resetSessionFlags } from '../../services/runtimeService';
import { CONTROL_PLANE_REGIONS, getRegionById } from '../../config/regions';
import type { ControlPlaneRegionId } from '../../types';

const SettingsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useAuthStore((s) => s.user);
  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const setSelectedRegion = useAuthStore((s) => s.setSelectedRegion);
  const logout = useAuthStore((s) => s.logout);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const queryClient = useQueryClient();

  const [regionDialogVisible, setRegionDialogVisible] = useState(false);
  const [themeDialogVisible, setThemeDialogVisible] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const currentRegion = getRegionById(selectedRegion);

  const handleRegionChange = useCallback(
    async (id: ControlPlaneRegionId) => {
      setSelectedRegion(id);
      await setRegion(id);
      setRegionDialogVisible(false);
    },
    [setSelectedRegion],
  );

  const handleThemeChange = useCallback(
    (value: 'light' | 'dark' | 'system') => {
      updateSettings({ theme: value });
      setThemeDialogVisible(false);
    },
    [updateSettings],
  );

  const handleLogout = useCallback(async () => {
    console.log('[Settings] Logout initiated');
    setLoggingOut(true);
    setLogoutDialogVisible(false);
    try {
      await authService.logout(); // calls resetApiState() — clears tokens, headers, auth, refresh state
      console.log('[Settings] authService.logout() complete (API state reset)');
      resetSessionFlags(); // Clear stale log/monitoring endpoint caches
      console.log('[Settings] runtimeService session flags reset');
    } finally {
      queryClient.clear();
      console.log('[Settings] queryClient cleared');
      logout();
      console.log('[Settings] authStore.logout() complete');
      setLoggingOut(false);
    }
  }, [logout, queryClient]);

  const handleSwitchOrg = useCallback(() => {
    // Navigate to org selection.
    // Don't clear org/env state yet — user may press back.
    // State is cleared in OrgSelectScreen only when user actually selects a new org.
    router.push({ pathname: '/(auth)/select-org' as any, params: { fromSettings: '1' } });
  }, [router]);

  const handleSwitchEnv = useCallback(() => {
    // Don't clear currentEnvironment — keep it until user picks a new one.
    // This prevents "Not selected" if the user presses back.
    queryClient.clear();
    router.push({ pathname: '/(auth)/select-env' as any, params: { fromSettings: '1' } });
  }, [router, queryClient]);

  const themeLabel =
    settings.theme === 'system'
      ? 'System default'
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <Surface style={styles.profileCard} elevation={2}>
        <Avatar.Text
          size={64}
          label={initials}
          style={{ backgroundColor: theme.colors.primaryContainer }}
          labelStyle={{ color: theme.colors.primary, fontWeight: '700' }}
        />
        <Text variant="titleLarge" style={[styles.profileName, { color: theme.colors.onSurface }]}>
          {user ? `${user.firstName} ${user.lastName}` : 'User'}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {user?.email ?? ''}
        </Text>
        <View style={styles.profileChips}>
          <View style={[styles.profileChip, { backgroundColor: theme.colors.primaryContainer }]}>
            <Icon name="domain" size={14} color={theme.colors.primary} />
            <Text variant="labelSmall" style={{ color: theme.colors.primary, marginLeft: 4 }}>
              {currentOrg?.name ?? user?.organizationName ?? 'N/A'}
            </Text>
          </View>
          <View style={[styles.profileChip, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Icon name="earth" size={14} color={theme.colors.secondary} />
            <Text variant="labelSmall" style={{ color: theme.colors.secondary, marginLeft: 4 }}>
              {currentRegion.label}
            </Text>
          </View>
        </View>
        {currentEnv && (
          <View style={[styles.profileChip, { backgroundColor: currentEnv.isProduction ? '#3FB95018' : '#D2992218', marginTop: 8 }]}>
            <Icon name={currentEnv.isProduction ? 'shield-check' : 'test-tube'} size={14} color={currentEnv.isProduction ? '#3FB950' : '#D29922'} />
            <Text variant="labelSmall" style={{ color: currentEnv.isProduction ? '#3FB950' : '#D29922', marginLeft: 4 }}>
              {currentEnv.name}
            </Text>
          </View>
        )}
      </Surface>

      {/* Organization Section */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Organization</List.Subheader>
        <List.Item
          title="Switch Organization"
          description={currentOrg?.name ?? 'Not selected'}
          left={(props) => <List.Icon {...props} icon="domain" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={handleSwitchOrg}
          style={styles.listItem}
        />
        <List.Item
          title="Switch Environment"
          description={currentEnv?.name ?? 'Not selected'}
          left={(props) => <List.Icon {...props} icon="server" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={handleSwitchEnv}
          style={styles.listItem}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      {/* Connection Section */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Connection</List.Subheader>
        <List.Item
          title="Control Plane"
          description={`${currentRegion.label} — ${currentRegion.notes}`}
          left={(props) => <List.Icon {...props} icon="earth" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => setRegionDialogVisible(true)}
          style={styles.listItem}
        />
        <List.Item
          title="API Endpoint"
          description={currentRegion.url}
          left={(props) => <List.Icon {...props} icon="link-variant" />}
          style={styles.listItem}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      {/* Appearance */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Appearance</List.Subheader>
        <List.Item
          title="Theme"
          description={themeLabel}
          left={(props) => <List.Icon {...props} icon={themeIcon} />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => setThemeDialogVisible(true)}
          style={styles.listItem}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      {/* Notifications */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Notifications</List.Subheader>
        <List.Item
          title="Push Notifications"
          left={(props) => <List.Icon {...props} icon="bell" />}
          right={() => (
            <Switch
              value={settings.pushNotificationsEnabled}
              onValueChange={(val) =>
                updateSettings({ pushNotificationsEnabled: val })
              }
            />
          )}
          style={styles.listItem}
        />
        <List.Item
          title="Critical Alerts"
          left={(props) => <List.Icon {...props} icon="alert-circle" />}
          right={() => (
            <Switch
              value={settings.notificationPreferences.criticalAlerts}
              onValueChange={(val) =>
                updateSettings({
                  notificationPreferences: {
                    ...settings.notificationPreferences,
                    criticalAlerts: val,
                  },
                })
              }
            />
          )}
          style={styles.listItem}
        />
        <List.Item
          title="Deployment Updates"
          left={(props) => <List.Icon {...props} icon="rocket-launch" />}
          right={() => (
            <Switch
              value={settings.notificationPreferences.deploymentUpdates}
              onValueChange={(val) =>
                updateSettings({
                  notificationPreferences: {
                    ...settings.notificationPreferences,
                    deploymentUpdates: val,
                  },
                })
              }
            />
          )}
          style={styles.listItem}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      {/* Security */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>Security</List.Subheader>
        <List.Item
          title="Biometric Authentication"
          description="Coming soon"
          left={(props) => <List.Icon {...props} icon="fingerprint" />}
          style={[styles.listItem, { opacity: 0.5 }]}
        />
      </List.Section>

      <Divider style={styles.sectionDivider} />

      {/* About */}
      <List.Section>
        <List.Subheader style={styles.sectionHeader}>About</List.Subheader>
        <List.Item
          title="Version"
          description="1.0.0"
          left={(props) => <List.Icon {...props} icon="information" />}
          style={styles.listItem}
        />
      </List.Section>

      {/* Logout */}
      <View style={styles.logoutContainer}>
        <Button
          mode="outlined"
          onPress={() => setLogoutDialogVisible(true)}
          loading={loggingOut}
          disabled={loggingOut}
          icon="logout"
          textColor={theme.colors.error}
          style={[styles.logoutButton, { borderColor: theme.colors.error }]}
          contentStyle={styles.logoutButtonContent}
        >
          Sign Out
        </Button>
      </View>

      {/* Region Dialog */}
      <Portal>
        <Dialog
          visible={regionDialogVisible}
          onDismiss={() => setRegionDialogVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Select Control Plane</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              value={selectedRegion}
              onValueChange={(v) => handleRegionChange(v as ControlPlaneRegionId)}
            >
              {CONTROL_PLANE_REGIONS.map((r) => (
                <RadioButton.Item
                  key={r.id}
                  label={`${r.label} — ${r.notes}`}
                  value={r.id}
                />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRegionDialogVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
    profileCard: {
      margin: 16,
      padding: 24,
      borderRadius: 20,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    profileName: {
      fontWeight: '700',
      marginTop: 12,
      marginBottom: 4,
    },
    profileChips: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    profileChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
    },
    sectionHeader: {
      fontWeight: '600',
    },
    sectionDivider: {
      marginHorizontal: 16,
    },
    listItem: {
      paddingHorizontal: 8,
    },
    logoutContainer: {
      padding: 24,
      paddingBottom: 48,
    },
    logoutButton: {
      borderRadius: 12,
    },
    logoutButtonContent: {
      paddingVertical: 4,
    },
    dialog: {
      borderRadius: 20,
    },
  });

export default SettingsScreen;
