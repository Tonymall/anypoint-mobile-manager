// ============================================================
// Settings Screen - App preferences, region, theme, logout
// ============================================================

import React, { useCallback, useState } from 'react';
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
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import * as authService from '../../services/authService';
import { setRegion } from '../../services/api';
import { CONTROL_PLANE_REGIONS, getRegionById } from '../../config/regions';
import type { ControlPlaneRegionId } from '../../types';

const SettingsScreen: React.FC = () => {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const setSelectedRegion = useAuthStore((s) => s.setSelectedRegion);
  const logout = useAuthStore((s) => s.logout);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [regionDialogVisible, setRegionDialogVisible] = useState(false);
  const [themeDialogVisible, setThemeDialogVisible] = useState(false);
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
    setLoggingOut(true);
    try {
      await authService.logout();
    } finally {
      logout();
      setLoggingOut(false);
    }
  }, [logout]);

  const themeLabel =
    settings.theme === 'system'
      ? 'System default'
      : settings.theme === 'dark'
        ? 'Dark'
        : 'Light';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Account Section */}
      <List.Section>
        <List.Subheader>Account</List.Subheader>
        <List.Item
          title={user ? `${user.firstName} ${user.lastName}` : 'User'}
          description={user?.email ?? ''}
          left={(props) => <List.Icon {...props} icon="account-circle" />}
        />
        <List.Item
          title="Organization"
          description={user?.organizationName ?? 'N/A'}
          left={(props) => <List.Icon {...props} icon="domain" />}
        />
      </List.Section>

      <Divider />

      {/* Connection Section */}
      <List.Section>
        <List.Subheader>Connection</List.Subheader>
        <List.Item
          title="Control Plane"
          description={`${currentRegion.label} — ${currentRegion.notes}`}
          left={(props) => <List.Icon {...props} icon="earth" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => setRegionDialogVisible(true)}
        />
        <List.Item
          title="API Endpoint"
          description={currentRegion.url}
          left={(props) => <List.Icon {...props} icon="link-variant" />}
        />
      </List.Section>

      <Divider />

      {/* Appearance */}
      <List.Section>
        <List.Subheader>Appearance</List.Subheader>
        <List.Item
          title="Theme"
          description={themeLabel}
          left={(props) => <List.Icon {...props} icon="palette" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => setThemeDialogVisible(true)}
        />
      </List.Section>

      <Divider />

      {/* Notifications */}
      <List.Section>
        <List.Subheader>Notifications</List.Subheader>
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
        />
      </List.Section>

      <Divider />

      {/* Security */}
      <List.Section>
        <List.Subheader>Security</List.Subheader>
        <List.Item
          title="Biometric Authentication"
          left={(props) => <List.Icon {...props} icon="fingerprint" />}
          right={() => (
            <Switch
              value={settings.biometricEnabled}
              onValueChange={(val) =>
                updateSettings({ biometricEnabled: val })
              }
            />
          )}
        />
      </List.Section>

      <Divider />

      {/* About */}
      <List.Section>
        <List.Subheader>About</List.Subheader>
        <List.Item
          title="Version"
          description="1.0.0"
          left={(props) => <List.Icon {...props} icon="information" />}
        />
      </List.Section>

      {/* Logout */}
      <View style={styles.logoutContainer}>
        <Button
          mode="outlined"
          onPress={handleLogout}
          loading={loggingOut}
          disabled={loggingOut}
          icon="logout"
          textColor={theme.colors.error}
          style={[styles.logoutButton, { borderColor: theme.colors.error }]}
        >
          Sign Out
        </Button>
      </View>

      {/* Region Dialog */}
      <Portal>
        <Dialog
          visible={regionDialogVisible}
          onDismiss={() => setRegionDialogVisible(false)}
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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoutContainer: {
    padding: 24,
    paddingBottom: 48,
  },
  logoutButton: {
    borderRadius: 8,
  },
});

export default SettingsScreen;
