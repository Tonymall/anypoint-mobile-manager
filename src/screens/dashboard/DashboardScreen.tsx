// ============================================================
// Dashboard Screen - Overview of Anypoint Platform health
// Shows real app counts, API stats, running apps
// ============================================================

import React, { useMemo } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl } from 'react-native';
import {
  Text,
  Card,
  useTheme,
  Divider,
  Button,
  Avatar,
  ProgressBar,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../../stores/authStore';
import { getRegionById } from '../../config/regions';
import { anypointColors } from '../../theme';
import { useApplications, useManagedAPIs } from '../../hooks/queries';
import { getAppName, getAppId, getMuleVersion } from '../../utils/appHelpers';
import LoadingState from '../../components/common/LoadingState';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  subtitle?: string;
  onPress?: () => void;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
  onPress,
  loading,
}) => {
  const theme = useTheme();
  return (
    <Card
      style={[statCardStyles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceVariant, borderWidth: 1 }]}
      mode="contained"
      onPress={onPress}
    >
      <Card.Content style={statCardStyles.content}>
        <View style={statCardStyles.topRow}>
          <View style={[statCardStyles.iconCircle, { backgroundColor: color + '20' }]}>
            <Icon name={icon} size={20} color={color} />
          </View>
          <Icon name="chevron-right" size={16} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
        </View>
        <Text variant="headlineMedium" style={[statCardStyles.value, { color: theme.colors.onSurface }]}>
          {loading ? '—' : value}
        </Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {title}
        </Text>
        {subtitle && (
          <View style={[statCardStyles.subtitleRow, { backgroundColor: color + '15' }]}>
            <View style={[statCardStyles.subtitleDot, { backgroundColor: color }]} />
            <Text style={{ color, fontSize: 11, fontWeight: '600' }}>
              {subtitle}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const statCardStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, elevation: 0 },
  content: { paddingVertical: 14, paddingHorizontal: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  value: { fontWeight: '800', fontSize: 28, marginBottom: 2 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  subtitleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
});

const DashboardScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useAuthStore((s) => s.user);
  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const region = getRegionById(selectedRegion);

  // Real data queries
  const {
    data: applications,
    isLoading: appsLoading,
    refetch: refetchApps,
  } = useApplications();

  const {
    data: apisResponse,
    isLoading: apisLoading,
    refetch: refetchApis,
  } = useManagedAPIs();

  const isRefreshing = appsLoading || apisLoading;

  const handleRefresh = () => {
    refetchApps();
    refetchApis();
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    : '?';

  // Compute stats from real data
  const appsList = applications ?? [];
  const totalApps = appsList.length;
  const runningApps = appsList.filter((a) => a.status === 'STARTED').length;
  const failedApps = appsList.filter((a) => a.status === 'FAILED').length;

  const apiList = apisResponse ?? [];
  const totalApis = apiList.length;
  const activeApis = apiList.filter((a) => a.status === 'active').length;

  // Top running apps for display
  const topRunningApps = appsList
    .filter((a) => a.status === 'STARTED')
    .slice(0, 5);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={handleRefresh} />
      }
    >
      {/* Header / Greeting */}
      <Card style={[styles.headerCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceVariant, borderWidth: 1 }]} mode="contained">
        <Card.Content style={styles.header}>
          <View style={styles.headerLeft}>
            <Avatar.Text
              size={52}
              label={initials}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              labelStyle={{ color: theme.colors.primary, fontWeight: '700' }}
            />
            <View style={styles.headerText}>
              <Text variant="titleLarge" style={{ color: theme.colors.onBackground, fontWeight: '700' }}>
                {greeting}
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                {user?.firstName ?? 'User'} {user?.lastName ?? ''}
              </Text>
              <View style={styles.orgRow}>
                <Icon name="domain" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }} numberOfLines={1}>
                  {currentOrg?.name ?? user?.organizationName ?? 'Organization'}
                </Text>
                <View style={styles.regionChip}>
                  <Icon name="earth" size={12} color={theme.colors.primary} />
                  <Text variant="labelSmall" style={{ color: theme.colors.primary, marginLeft: 3 }}>
                    {region.label}
                  </Text>
                </View>
              </View>
              {currentEnv && (
                <View style={styles.orgRow}>
                  <Icon name="server" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                    {currentEnv.name}
                  </Text>
                  <View style={[styles.envTypeBadge, { backgroundColor: currentEnv.isProduction ? '#3FB95020' : '#D2992220' }]}>
                    <Text variant="labelSmall" style={{ color: currentEnv.isProduction ? '#3FB950' : '#D29922', fontSize: 10 }}>
                      {currentEnv.isProduction ? 'PROD' : 'SANDBOX'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Quick Stats */}
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
          Platform Overview
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {currentEnv?.name ?? 'Environment'}
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard
            title="Applications"
            value={totalApps}
            icon="application-cog"
            color={anypointColors.primary}
            subtitle={`${runningApps} running`}
            onPress={() => router.navigate('/(main)/runtime')}
            loading={appsLoading}
          />
          <StatCard
            title="APIs"
            value={totalApis}
            icon="api"
            color={anypointColors.secondary}
            subtitle={`${activeApis} active`}
            onPress={() => router.navigate('/(main)/apis')}
            loading={apisLoading}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            title="Failed"
            value={failedApps}
            icon="alert-circle"
            color={failedApps > 0 ? anypointColors.error : anypointColors.success}
            subtitle={failedApps > 0 ? 'Needs attention' : 'All healthy'}
            loading={appsLoading}
          />
          <StatCard
            title="Workers"
            value={appsList.reduce((sum, a) => sum + (a.workers?.amount ?? 0), 0)}
            icon="server"
            color={anypointColors.accent}
            subtitle="Total allocated"
            onPress={() => router.navigate('/(main)/workers' as any)}
            loading={appsLoading}
          />
        </View>
      </View>

      {/* Running Applications */}
      {topRunningApps.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
              Running Applications
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Top {topRunningApps.length}
            </Text>
          </View>
          <Card style={styles.activityCard} mode="elevated">
            <Card.Content>
              {topRunningApps.map((app, i) => (
                <View key={getAppId(app)}>
                  <View style={styles.appRow}>
                    <View style={[styles.statusDot, { backgroundColor: anypointColors.success }]} />
                    <View style={styles.appInfo}>
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }} numberOfLines={1}>
                        {getAppName(app)}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {[getMuleVersion(app), app.region].filter(Boolean).join(' · ') || 'CloudHub'}
                      </Text>
                      {app.monitoring?.cpuUsage != null && (
                        <View style={styles.metricsRow}>
                          <View style={styles.metricItem}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPU</Text>
                            <ProgressBar
                              progress={(app.monitoring.cpuUsage ?? 0) / 100}
                              color={(app.monitoring.cpuUsage ?? 0) > 80 ? anypointColors.error : anypointColors.primary}
                              style={styles.metricBar}
                            />
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {Math.round(app.monitoring.cpuUsage ?? 0)}%
                            </Text>
                          </View>
                          {(app.monitoring.memoryTotal ?? 0) > 0 && (
                            <View style={styles.metricItem}>
                              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>MEM</Text>
                              <ProgressBar
                                progress={(app.monitoring.memoryUsage ?? 0) / (app.monitoring.memoryTotal ?? 1)}
                                color={anypointColors.secondary}
                                style={styles.metricBar}
                              />
                              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                {Math.round(((app.monitoring.memoryUsage ?? 0) / (app.monitoring.memoryTotal ?? 1)) * 100)}%
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                  {i < topRunningApps.length - 1 && <Divider style={styles.activityDivider} />}
                </View>
              ))}
            </Card.Content>
          </Card>
        </>
      )}

      {/* Quick Actions */}
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
          Quick Actions
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <Button
          mode="contained-tonal"
          icon="rocket-launch"
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          onPress={() => router.navigate('/(main)/runtime')}
        >
          Apps
        </Button>
        <Button
          mode="contained-tonal"
          icon="api"
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          onPress={() => router.navigate('/(main)/apis')}
        >
          APIs
        </Button>
        <Button
          mode="contained-tonal"
          icon="cog"
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          onPress={() => router.navigate('/(main)/settings')}
        >
          Settings
        </Button>
      </View>
    </ScrollView>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    headerCard: {
      marginHorizontal: 16,
      marginTop: 8,
      marginBottom: 4,
      borderRadius: 16,
      elevation: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 4,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    headerText: {
      marginLeft: 16,
      flex: 1,
    },
    orgRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    regionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      backgroundColor: theme.colors.primaryContainer,
    },
    envTypeBadge: {
      marginLeft: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 12,
    },
    sectionTitle: {
      fontWeight: '700',
    },
    statsGrid: {
      paddingHorizontal: 16,
      gap: 10,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    activityCard: {
      marginHorizontal: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
    },
    appRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 12,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 6,
      marginRight: 12,
    },
    appInfo: {
      flex: 1,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 16,
      marginTop: 8,
    },
    metricItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metricBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
    activityDivider: {
      marginLeft: 22,
    },
    actionsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 10,
    },
    actionButton: {
      flex: 1,
      borderRadius: 12,
    },
    actionButtonContent: {
      paddingVertical: 4,
    },
  });

export default DashboardScreen;
