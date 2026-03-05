// ============================================================
// Dashboard Screen — 2026 Modern Dark UI
//
// Design: Glassmorphic cards, gradient accent borders,
// large bold metrics, generous spacing, vibrant accents
// ============================================================

import React, { useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Pressable,
  Platform,
} from 'react-native';
import {
  Text,
  useTheme,
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
import { getAppName, getAppId, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import LoadingState from '../../components/common/LoadingState';

// ── Glassmorphic Stat Card ──

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
  title, value, icon, color, subtitle, onPress, loading,
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${title}: ${loading ? 'loading' : value}${subtitle ? '. ' + subtitle : ''}`}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flex: 1,
          borderRadius: 20,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: color + '18',
          overflow: 'hidden',
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {/* Accent glow at top */}
      <View style={{ height: 3, backgroundColor: color, opacity: 0.6 }} />
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <View style={{
            width: 42, height: 42, borderRadius: 14,
            backgroundColor: color + '15',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Icon name={icon} size={20} color={color} />
          </View>
          <Icon name="chevron-right" size={14} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.4 }} />
        </View>
        <Text style={{
          fontSize: 32, fontWeight: '800', color: theme.colors.onSurface,
          letterSpacing: -1, marginBottom: 2, lineHeight: 36,
        }}>
          {loading ? '—' : value}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: theme.colors.onSurfaceVariant, letterSpacing: 0.3 }}>
          {title}
        </Text>
        {subtitle && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', marginTop: 8,
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
            backgroundColor: color + '12', alignSelf: 'flex-start',
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 6 }} />
            <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{subtitle}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
};

// ── App Row Item ──

const AppRowItem: React.FC<{
  app: any;
  isLast: boolean;
  onPress: () => void;
  theme: MD3Theme;
}> = React.memo(({ app, isLast, onPress, theme }) => {
  const name = getAppName(app);
  const version = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);
  const cpu = app.monitoring?.cpuUsage ?? null;
  const memUsage = app.monitoring?.memoryUsage ?? 0;
  const memTotal = app.monitoring?.memoryTotal ?? 0;
  const memPct = memTotal > 0 ? Math.round((memUsage / memTotal) * 100) : null;
  const statusColor = app.status === 'STARTED' ? anypointColors.success
    : app.status === 'FAILED' ? anypointColors.error
    : anypointColors.warning;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${name}, status ${app.status === 'STARTED' ? 'running' : (app.status ?? '').toLowerCase()}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view details"
      style={({ pressed }) => ({
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: theme.colors.outlineVariant,
        backgroundColor: pressed ? theme.colors.surfaceVariant + '40' : 'transparent',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Glowing status dot */}
        <View style={{
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: statusColor, marginRight: 14,
          shadowColor: statusColor, shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6, shadowRadius: 4, elevation: 3,
        }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.onSurface }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {[version, app.region, `${workerInfo.amount}x ${workerInfo.typeName}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.3 }} />
      </View>
      {/* Mini metrics bar */}
      {cpu != null && (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, marginLeft: 24 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '500', color: theme.colors.onSurfaceVariant, width: 26 }}>CPU</Text>
            <ProgressBar
              progress={cpu / 100}
              color={cpu > 80 ? anypointColors.error : cpu > 60 ? anypointColors.warning : anypointColors.primary}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceVariant }}
            />
            <Text style={{ fontSize: 10, fontWeight: '600', color: theme.colors.onSurfaceVariant, width: 30, textAlign: 'right' }}>
              {Math.round(cpu)}%
            </Text>
          </View>
          {memPct != null && (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: theme.colors.onSurfaceVariant, width: 26 }}>MEM</Text>
              <ProgressBar
                progress={memPct / 100}
                color={memPct > 80 ? anypointColors.error : anypointColors.secondary}
                style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceVariant }}
              />
              <Text style={{ fontSize: 10, fontWeight: '600', color: theme.colors.onSurfaceVariant, width: 30, textAlign: 'right' }}>
                {memPct}%
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
});
AppRowItem.displayName = 'AppRowItem';

// ── Main Screen ──

const CONTENT_MAX_WIDTH = 768;

const DashboardScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { isLandscape, isTablet, isPhoneLandscape, isTabletLandscape, columns } = useResponsiveLayout();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const user = useAuthStore((s) => s.user);

  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const region = getRegionById(selectedRegion);

  // Real data queries
  const { data: applications, isLoading: appsLoading, error: appsError, refetch: refetchApps } = useApplications();
  const { data: apisResponse, isLoading: apisLoading, error: apisError, refetch: refetchApis } = useManagedAPIs();

  const handleRefresh = () => { refetchApps(); refetchApis(); };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
    : '?';

  // Compute stats
  const appsList = applications ?? [];
  const totalApps = appsList.length;
  const runningApps = appsList.filter((a) => a.status === 'STARTED').length;
  const failedApps = appsList.filter((a) => a.status === 'FAILED').length;
  const apiList = apisResponse ?? [];
  const totalApis = apiList.length;
  const activeApis = apiList.filter((a) => a.status === 'active').length;

  const topRunningApps = appsList.filter((a) => a.status === 'STARTED').slice(0, 6);

  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 8 },
        isWide && { paddingHorizontal: sidePadding },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} />}
    >
      {/* ── Profile Header ── */}
      <View style={styles.headerSection}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: anypointColors.primary + '20' }]}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: anypointColors.primary }}>
              {initials}
            </Text>
          </View>
          {/* Online indicator */}
          <View style={styles.onlineDot} />
        </View>
        <View style={styles.headerText}>
          <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
            {greeting},
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.onSurface, letterSpacing: -0.5 }}>
            {user?.firstName ?? 'User'} {user?.lastName ?? ''}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Icon name="domain" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={styles.metaText} numberOfLines={1}>
                {currentOrg?.name ?? user?.organizationName ?? 'Organization'}
              </Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: anypointColors.primary + '12' }]}>
              <Icon name="earth" size={11} color={anypointColors.primary} />
              <Text style={[styles.metaText, { color: anypointColors.primary }]}>{region.label}</Text>
            </View>
          </View>
          {currentEnv && (
            <View style={styles.metaRow}>
              <View style={[
                styles.envBadge,
                { backgroundColor: currentEnv.isProduction ? anypointColors.success + '15' : anypointColors.warning + '15' },
              ]}>
                <View style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: currentEnv.isProduction ? anypointColors.success : anypointColors.warning,
                }} />
                <Text style={{
                  fontSize: 11, fontWeight: '600',
                  color: currentEnv.isProduction ? anypointColors.success : anypointColors.warning,
                }}>
                  {currentEnv.name} · {currentEnv.isProduction ? 'PRODUCTION' : 'SANDBOX'}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Error Banner ── */}
      {(appsError || apisError) && (
        <View style={[styles.errorBanner, { backgroundColor: anypointColors.error + '10', borderColor: anypointColors.error + '25' }]}>
          <Icon name="alert-circle" size={18} color={anypointColors.error} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface }}>
              Failed to load data
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {appsError instanceof Error ? appsError.message : apisError instanceof Error ? (apisError as Error).message : 'Network error'}
            </Text>
          </View>
          <Pressable onPress={handleRefresh} style={styles.retryButton}>
            <Icon name="refresh" size={16} color={anypointColors.primary} />
          </Pressable>
        </View>
      )}

      {/* ── Section: Platform Overview ── */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>Platform Overview</Text>
        <Text style={styles.sectionSubtitle}>{currentEnv?.name ?? 'Environment'}</Text>
      </View>

      {/* ── Stat Cards Grid ── */}
      <View style={styles.statsGrid}>
        {isLandscape ? (
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
        ) : (
          <>
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
          </>
        )}
      </View>

      {/* ── Running Applications ── */}
      {topRunningApps.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>Running Applications</Text>
            <View style={styles.countBadge}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: anypointColors.success }}>{runningApps}</Text>
            </View>
          </View>
          <View style={styles.appsCard}>
            {topRunningApps.map((app, i) => (
              <AppRowItem
                key={getAppId(app)}
                app={app}
                isLast={i === topRunningApps.length - 1}
                onPress={() => router.push({ pathname: '/(main)/runtime/[domain]' as any, params: { domain: app.domain } })}
                theme={theme}
              />
            ))}
          </View>
        </>
      )}

      {/* ── Quick Actions (hidden in phone landscape — accessible via tab bar) ── */}
      {!isPhoneLandscape && (
        <>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>

          <View style={styles.actionsRow}>
            {[
              { icon: 'rocket-launch', label: 'Apps', color: anypointColors.primary, route: '/(main)/runtime' },
              { icon: 'api', label: 'APIs', color: anypointColors.secondary, route: '/(main)/apis' },
              { icon: 'chart-line', label: 'Monitor', color: anypointColors.accent, route: '/(main)/monitoring' },
              { icon: 'cog', label: 'Settings', color: anypointColors.mulePurple, route: '/(main)/settings' },
            ].map((action) => (
              <Pressable
                key={action.label}
                onPress={() => router.navigate(action.route as any)}
                accessibilityLabel={`Go to ${action.label}`}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: theme.colors.surface, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={[styles.actionIcon, { backgroundColor: action.color + '15' }]}>
                  <Icon name={action.icon} size={18} color={action.color} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.onSurface, marginTop: 6 }}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
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
      paddingBottom: 40,
    },

    // ── Header ──
    headerSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    avatarContainer: {
      position: 'relative',
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    onlineDot: {
      position: 'absolute',
      bottom: 0,
      right: -2,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: anypointColors.success,
      borderWidth: 2.5,
      borderColor: theme.colors.background,
    },
    headerText: {
      marginLeft: 16,
      flex: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      gap: 6,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceVariant,
    },
    metaText: {
      fontSize: 11,
      fontWeight: '500',
      color: theme.colors.onSurfaceVariant,
    },
    envBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },

    // ── Error ──
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
    },
    retryButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Sections ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginTop: 28,
      marginBottom: 14,
    },
    sectionAccent: {
      width: 3,
      height: 16,
      borderRadius: 1.5,
      backgroundColor: theme.colors.primary,
      marginRight: 10,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.onSurface,
      letterSpacing: 0.1,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    countBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: anypointColors.success + '15',
    },

    // ── Stats ──
    statsGrid: {
      paddingHorizontal: 16,
      gap: 10,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },

    // ── Running apps ──
    appsCard: {
      marginHorizontal: 16,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    },

    // ── Actions ──
    actionsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 10,
    },
    actionButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    actionIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

export default DashboardScreen;
