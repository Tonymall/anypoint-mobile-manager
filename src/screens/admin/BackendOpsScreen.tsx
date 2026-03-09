import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Text, TextInput, useTheme, type MD3Theme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  fetchAdminAlerts,
  fetchAdminBugReports,
  fetchAdminMobileConfig,
  type AdminAlertEvent,
  type AdminBugReport,
  type MobileRemoteConfig,
} from '../../services/backendService';
import logger from '../../utils/logger';

const BackendOpsScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [bugReports, setBugReports] = useState<AdminBugReport[]>([]);
  const [alertEvents, setAlertEvents] = useState<AdminAlertEvent[]>([]);
  const [remoteConfig, setRemoteConfig] = useState<MobileRemoteConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    if (!adminKey.trim()) {
      setError('Enter an admin key first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [reports, alerts, config] = await Promise.all([
        fetchAdminBugReports(adminKey.trim()),
        fetchAdminAlerts(adminKey.trim()),
        fetchAdminMobileConfig(adminKey.trim()),
      ]);

      setBugReports(reports);
      setAlertEvents(alerts);
      setRemoteConfig(config);
    } catch (loadError) {
      logger.warn('[BackendOpsScreen] Failed to load admin data:', (loadError as Error)?.message);
      setError((loadError as Error)?.message ?? 'Failed to load backend data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Backend Ops" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Admin Access
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              Inspect recent bug reports, alert history, and live remote config from the hosted backend.
            </Text>
            <TextInput
              mode="outlined"
              label="Admin API Key"
              value={adminKey}
              onChangeText={setAdminKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
            <Button mode="contained" onPress={handleLoad} loading={loading} disabled={loading}>
              Load Backend Data
            </Button>
            {error ? (
              <Text variant="bodySmall" style={styles.error}>
                {error}
              </Text>
            ) : null}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Remote Config
            </Text>
            {remoteConfig ? (
              <View style={styles.kvList}>
                <Text style={styles.kvItem}>Minimum Supported Version: {remoteConfig.minimumSupportedVersion}</Text>
                <Text style={styles.kvItem}>Release Stage: {remoteConfig.releaseStage}</Text>
                <Text style={styles.kvItem}>Bug Reporting: {remoteConfig.bugReportingEnabled ? 'Enabled' : 'Disabled'}</Text>
                <Text style={styles.kvItem}>Alert Sync: {remoteConfig.alertSyncEnabled ? 'Enabled' : 'Disabled'}</Text>
                <Text style={styles.kvItem}>Notifications Default: {remoteConfig.notificationsEnabledByDefault ? 'Enabled' : 'Disabled'}</Text>
                <Text style={styles.kvItem}>Support Email: {remoteConfig.supportEmail}</Text>
              </View>
            ) : (
              <Text variant="bodySmall" style={styles.muted}>
                No config loaded yet.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent Bug Reports
            </Text>
            {bugReports.length > 0 ? bugReports.slice(0, 10).map((report) => (
              <View key={report.id} style={styles.listItem}>
                <Text style={styles.itemTitle}>{report.title}</Text>
                <Text style={styles.itemMeta}>{report.userName} · {report.controlPlane} · {report.appVersion}</Text>
                <Text style={styles.itemMeta}>Email delivered: {report.emailDelivered ? 'Yes' : 'No'}</Text>
              </View>
            )) : (
              <Text variant="bodySmall" style={styles.muted}>
                No bug reports loaded yet.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent Alert Events
            </Text>
            {alertEvents.length > 0 ? alertEvents.slice(0, 12).map((event) => (
              <View key={event.id} style={styles.listItem}>
                <Text style={styles.itemTitle}>{event.title}</Text>
                <Text style={styles.itemMeta}>{event.applicationName ?? event.domain ?? 'Unknown app'}</Text>
                <Text style={styles.itemMeta}>{event.controlPlane ?? 'Unknown plane'} · {event.action}</Text>
              </View>
            )) : (
              <Text variant="bodySmall" style={styles.muted}>
                No alert events loaded yet.
              </Text>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    content: {
      padding: 16,
      gap: 12,
      paddingBottom: 32,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
    },
    sectionTitle: {
      fontWeight: '700',
      marginBottom: 8,
    },
    muted: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 12,
    },
    input: {
      marginBottom: 12,
    },
    error: {
      color: theme.colors.error,
      marginTop: 10,
    },
    kvList: {
      gap: 8,
    },
    kvItem: {
      color: theme.colors.onSurface,
      fontSize: 14,
    },
    listItem: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.outlineVariant,
    },
    itemTitle: {
      color: theme.colors.onSurface,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    itemMeta: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
  });

export default BackendOpsScreen;
