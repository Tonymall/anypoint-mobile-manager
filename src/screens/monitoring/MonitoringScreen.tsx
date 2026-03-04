// ============================================================
// Monitoring Screen - Application Health Overview
// Shows health summary, status distribution, and per-app
// monitoring data (CPU, memory) with pull-to-refresh.
// ============================================================

import React, { useMemo } from 'react';
import { View, ScrollView, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Text, Card, useTheme, ProgressBar, Icon } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApplications, useManagedAPIs } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors, statusColors } from '../../theme';
import { getAppName, getAppId, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Status helpers ---

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'STARTED':
      return statusColors.started;
    case 'STOPPED':
      return statusColors.stopped;
    case 'FAILED':
      return statusColors.failed;
    case 'DEPLOYING':
    case 'UNDEPLOYING':
      return statusColors.deploying;
    default:
      return statusColors.stopped;
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'STARTED': return 'Running';
    case 'STOPPED': return 'Stopped';
    case 'FAILED': return 'Failed';
    case 'DEPLOYING': return 'Deploying';
    default: return status;
  }
};

// --- Relative time formatter ---

const formatRelativeTime = (raw: any): string => {
  if (!raw) return '';
  const date = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// --- Summary Card ---

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  subtitle?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, color, subtitle }) => {
  const theme = useTheme();
  return (
    <Card
      style={{
        flex: 1,
        borderRadius: 14,
        elevation: 0,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.surfaceVariant,
      }}
      mode="contained"
    >
      <Card.Content style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: color + '20',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon source={icon} size={18} color={color} />
          </View>
        </View>
        <Text
          variant="headlineSmall"
          style={{ fontWeight: '800', fontSize: 26, color: theme.colors.onSurface, marginBottom: 2 }}
        >
          {value}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {title}
        </Text>
        {subtitle ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: color + '15',
              alignSelf: 'flex-start',
            }}
          >
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, marginRight: 4 }} />
            <Text style={{ color, fontSize: 10, fontWeight: '600' }}>{subtitle}</Text>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
};

// --- App Health Card ---

interface AppHealthCardProps {
  app: any;
  theme: MD3Theme;
  styles: ReturnType<typeof createStyles>;
}

const AppHealthCard: React.FC<AppHealthCardProps> = ({ app, theme, styles }) => {
  const status = app?.status ?? 'UNKNOWN';
  const color = getStatusColor(status);
  const appName = getAppName(app);
  const muleVer = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);
  const region = app?.region ?? '';

  // Monitoring data (may or may not exist)
  const monitoring = app?.monitoring;
  const cpuPercent = monitoring?.cpu != null ? Number(monitoring.cpu) : null;
  const memoryPercent = monitoring?.memory != null ? Number(monitoring.memory) : null;

  const lastUpdated = app?.lastUpdateTime;

  return (
    <Card style={styles.appCard} mode="contained">
      <Card.Content style={styles.cardContent}>
        {/* Header: status indicator + name + badge */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusIndicator, { backgroundColor: color }]} />
          <View style={styles.appNameWrap}>
            <Text variant="titleMedium" style={styles.appName} numberOfLines={1}>
              {appName}
            </Text>
            {region ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                {region}
              </Text>
            ) : null}
          </View>
          <View style={[styles.statusChip, { backgroundColor: color + '20', borderColor: color + '40' }]}>
            <Text style={{ color, fontSize: 11, fontWeight: '700' }}>
              {getStatusLabel(status)}
            </Text>
          </View>
        </View>

        {/* Info row: worker info, mule version */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Icon source="server" size={13} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={styles.infoText}>
              {workerInfo.amount}x {workerInfo.typeName}
            </Text>
          </View>
          {muleVer ? (
            <View style={styles.infoItem}>
              <Icon source="puzzle" size={13} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={styles.infoText}>Mule {muleVer}</Text>
            </View>
          ) : null}
          {lastUpdated ? (
            <View style={styles.infoItem}>
              <Icon source="clock-outline" size={13} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={styles.infoText}>
                {formatRelativeTime(lastUpdated)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Monitoring bars (CPU / Memory) */}
        {monitoring ? (
          <View style={styles.monitoringSection}>
            {cpuPercent != null ? (
              <View style={styles.metricRow}>
                <View style={styles.metricLabelRow}>
                  <Text variant="labelSmall" style={styles.metricLabel}>CPU</Text>
                  <Text variant="labelSmall" style={styles.metricValue}>
                    {Math.round(cpuPercent)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={Math.min(cpuPercent / 100, 1)}
                  color={cpuPercent > 80 ? anypointColors.error : cpuPercent > 60 ? anypointColors.warning : anypointColors.primary}
                  style={styles.progressBar}
                />
              </View>
            ) : null}
            {memoryPercent != null ? (
              <View style={styles.metricRow}>
                <View style={styles.metricLabelRow}>
                  <Text variant="labelSmall" style={styles.metricLabel}>Memory</Text>
                  <Text variant="labelSmall" style={styles.metricValue}>
                    {Math.round(memoryPercent)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={Math.min(memoryPercent / 100, 1)}
                  color={memoryPercent > 80 ? anypointColors.error : memoryPercent > 60 ? anypointColors.warning : anypointColors.accent}
                  style={styles.progressBar}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
};

// --- Main Component ---

const MonitoringScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const currentEnv = useAuthStore((s) => s.currentEnvironment);

  const {
    data: applications,
    isLoading: appsLoading,
    error: appsError,
    refetch: refetchApps,
    isRefetching: appsRefetching,
  } = useApplications();

  const {
    data: apisResponse,
    isLoading: apisLoading,
    refetch: refetchApis,
    isRefetching: apisRefetching,
  } = useManagedAPIs();

  const isRefreshing = appsRefetching || apisRefetching;

  const handleRefresh = () => {
    refetchApps();
    refetchApis();
  };

  // Compute stats
  const appsList = useMemo(() => applications ?? [], [applications]);
  const apiList = useMemo(() => apisResponse ?? [], [apisResponse]);

  const totalApps = appsList.length;
  const runningApps = useMemo(
    () => appsList.filter((a: any) => a?.status === 'STARTED').length,
    [appsList],
  );
  const failedApps = useMemo(
    () => appsList.filter((a: any) => a?.status === 'FAILED').length,
    [appsList],
  );

  const totalAPIs = apiList.length;
  const activeAPIs = useMemo(
    () => apiList.filter((api: any) => api?.status === 'active').length,
    [apiList],
  );

  const envName = currentEnv?.name ?? 'No environment';

  // Loading state
  if (appsLoading && !appsList.length) {
    return <LoadingState message="Loading monitoring data..." />;
  }

  // Error state
  if (appsError && !appsList.length) {
    return (
      <ErrorState
        message={(appsError as Error).message}
        onRetry={() => refetchApps()}
      />
    );
  }

  const renderAppCard = ({ item }: { item: any }) => (
    <AppHealthCard app={item} theme={theme} styles={styles} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon source="monitor-dashboard" size={64} color={theme.colors.outlineVariant} />
      <Text variant="titleMedium" style={styles.emptyTitle}>
        No applications to monitor
      </Text>
      <Text variant="bodyMedium" style={styles.emptySubtitle}>
        Deploy applications to see monitoring data here.
      </Text>
    </View>
  );

  const ListHeader = () => (
    <View>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Monitoring
        </Text>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>
          {envName}
        </Text>
      </View>

      {/* Health Summary Cards */}
      <View style={styles.summaryRow}>
        <SummaryCard
          title="Total Apps"
          value={totalApps}
          icon="application-outline"
          color={anypointColors.primary}
          subtitle={failedApps > 0 ? `${failedApps} failed` : undefined}
        />
        <SummaryCard
          title="Running"
          value={`${runningApps}/${totalApps}`}
          icon="check-circle-outline"
          color={anypointColors.success}
          subtitle={
            totalApps > 0
              ? `${Math.round((runningApps / totalApps) * 100)}% healthy`
              : undefined
          }
        />
        <SummaryCard
          title="APIs"
          value={totalAPIs}
          icon="api"
          color={anypointColors.secondary}
          subtitle={activeAPIs > 0 ? `${activeAPIs} active` : undefined}
        />
      </View>

      {/* Section title */}
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Application Health
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {appsList.length} app{appsList.length !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={appsList}
        keyExtractor={(item: any) => getAppId(item)}
        renderItem={renderAppCard}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
};

// --- Styles ---

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    headerTitle: {
      fontWeight: '700',
      color: theme.colors.onBackground,
    },
    headerSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 20,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    sectionTitle: {
      fontWeight: '600',
      color: theme.colors.onBackground,
    },
    listContent: {
      paddingBottom: 32,
    },
    appCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
      elevation: 0,
    },
    cardContent: {
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusIndicator: {
      width: 4,
      height: 36,
      borderRadius: 2,
    },
    appNameWrap: {
      flex: 1,
    },
    appName: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    statusChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    infoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outlineVariant,
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    infoText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
    monitoringSection: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outlineVariant,
      gap: 8,
    },
    metricRow: {
      gap: 4,
    },
    metricLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    metricLabel: {
      color: theme.colors.onSurfaceVariant,
      fontWeight: '500',
    },
    metricValue: {
      color: theme.colors.onSurface,
      fontWeight: '600',
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.surfaceVariant,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      marginTop: 16,
      color: theme.colors.onSurface,
    },
    emptySubtitle: {
      marginTop: 8,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
  });

export default MonitoringScreen;
