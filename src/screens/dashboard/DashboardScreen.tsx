// ============================================================
// Dashboard Screen — 2026 Modern Dark UI
//
// Design: Glassmorphic cards, gradient accent borders,
// large bold metrics, generous spacing, vibrant accents
// ============================================================

import React, { useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import {
  Text,
  useTheme,
  ProgressBar,
  type MD3Theme,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../../stores/authStore';
import { getRegionById } from '../../config/regions';
import { statusColors, typeScale, useTokens, withAlpha, type Tokens } from '../../theme';
import { useApplications, useManagedAPIs } from '../../hooks/queries';
import { getAppName, getAppId, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { StatCard } from './home/StatCard';
import IncidentFeed from './incidents/IncidentFeed';
import { useIncidentFeed } from './incidents/useIncidentFeed';
import type { Incident } from '../../services/incidentFeed';
import type { IconName } from '../../types/icons';

// ── Quick Actions ──

type QuickActionRole = 'brand' | 'secondary' | 'tertiary' | 'success';

/** Resolve a quick action's categorical accent from the token set. */
function quickActionRole(t: Tokens, role: QuickActionRole) {
  if (role === 'success') return t.color.status.success;
  return t.color.accent[role];
}

const QUICK_ACTIONS: { icon: IconName; label: string; role: QuickActionRole; route: string }[] = [
  { icon: 'rocket-launch', label: 'Apps', role: 'brand', route: '/(main)/runtime' },
  { icon: 'api', label: 'APIs', role: 'secondary', route: '/(main)/apis' },
  { icon: 'chart-line', label: 'Monitor', role: 'success', route: '/(main)/monitoring' },
  { icon: 'cog', label: 'Settings', role: 'tertiary', route: '/(main)/settings' },
];

// ── App Row Item ──

const AppRowItem: React.FC<{
  app: any;
  isLast: boolean;
  onPress: () => void;
  theme: MD3Theme;
}> = React.memo(({ app, isLast, onPress, theme }) => {
  const t = useTokens();
  const name = getAppName(app);
  const version = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);
  const cpu = app.monitoring?.cpuUsage ?? null;
  const memUsage = app.monitoring?.memoryUsage ?? 0;
  const memTotal = app.monitoring?.memoryTotal ?? 0;
  const memPct = memTotal > 0 ? Math.round((memUsage / memTotal) * 100) : null;
  const statusRole = app.status === 'STARTED' ? t.color.status.success
    : app.status === 'FAILED' ? t.color.status.danger
    : t.color.status.warning;
  const statusColor = statusRole.base;

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
        backgroundColor: pressed ? withAlpha(t.color.text.primary, 'faint') : 'transparent',
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
              color={(cpu > 80 ? t.color.status.danger : cpu > 60 ? t.color.status.warning : t.color.accent.brand).base}
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
                color={(memPct > 80 ? t.color.status.danger : t.color.accent.secondary).base}
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
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { isLandscape, isPhoneLandscape } = useResponsiveLayout();
  const t = useTokens();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const user = useAuthStore((s) => s.user);

  const selectedRegion = useAuthStore((s) => s.selectedRegion);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const region = getRegionById(selectedRegion);

  // Real data queries
  const { data: applications, isLoading: appsLoading, error: appsError, refetch: refetchApps } = useApplications({ enabled: isFocused });
  const { data: apisResponse, isLoading: apisLoading, error: apisError, refetch: refetchApis } = useManagedAPIs(undefined, { enabled: isFocused });

  const {
    incidents,
    summary: incidentSummary,
    isLoading: incidentsLoading,
    refetch: refetchIncidents,
  } = useIncidentFeed({ enabled: isFocused });

  // Returns the combined promise so the pull spinner clears only once every
  // query has settled. allSettled, not all — a single failure must not leave
  // the control spinning.
  const handleRefresh = () => Promise.allSettled([refetchApps(), refetchApis(), refetchIncidents()]);

  const pullRefresh = usePullRefresh(handleRefresh);

  const handleIncidentPress = useCallback((incident: Incident) => {
    if (!incident.route) return;
    router.navigate({
      pathname: incident.route as never,
      params: (incident.routeParams ?? {}) as never,
    });
  }, [router]);

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
      refreshControl={<RefreshControl refreshing={pullRefresh.refreshing} onRefresh={pullRefresh.onRefresh} />}
    >
      {/* ── Profile Header ── */}
      <View style={styles.headerSection}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: t.color.brand.surface }]}>
            <Text style={[typeScale.subheading, { color: t.color.text.accent }]}>
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
            <View style={[styles.metaChip, { backgroundColor: t.color.brand.surface }]}>
              <Icon name="earth" size={11} color={t.color.text.accent} />
              <Text style={[styles.metaText, { color: t.color.text.accent }]}>{region.label}</Text>
            </View>
          </View>
          {currentEnv && (
            <View style={styles.metaRow}>
              <View style={[
                styles.envBadge,
                { backgroundColor: (currentEnv.isProduction ? t.color.status.success : t.color.status.warning).surface },
              ]}>
                <View style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: (currentEnv.isProduction ? t.color.status.success : t.color.status.warning).base,
                }} />
                <Text style={{
                  fontSize: 11, fontWeight: '600',
                  color: (currentEnv.isProduction ? t.color.status.success : t.color.status.warning).base,
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
        <View style={[styles.errorBanner, { backgroundColor: t.color.status.danger.surface, borderColor: t.color.status.danger.border }]}>
          <Icon name="alert-circle" size={18} color={t.color.status.danger.base} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.onSurface }}>
              Failed to load data
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {appsError instanceof Error ? appsError.message : apisError instanceof Error ? (apisError as Error).message : 'Network error'}
            </Text>
          </View>
          <Pressable onPress={handleRefresh} style={styles.retryButton}>
            <Icon name="refresh" size={16} color={t.color.text.accent} />
          </Pressable>
        </View>
      )}

      {/* ── Incident Feed: what needs attention right now ── */}
      <IncidentFeed
        incidents={incidents}
        summary={incidentSummary}
        isLoading={incidentsLoading}
        onSelect={handleIncidentPress}
        onViewAll={() => router.navigate('/(main)/alerts')}
      />

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
              role={t.color.status.info}
              subtitle={`${runningApps} running`}
              onPress={() => router.navigate('/(main)/runtime')}
              loading={appsLoading}
            />
            <StatCard
              title="APIs"
              value={totalApis}
              icon="api"
              role={t.color.accent.secondary}
              subtitle={`${activeApis} active`}
              onPress={() => router.navigate('/(main)/apis')}
              loading={apisLoading}
            />
            <StatCard
              title="Failed"
              value={failedApps}
              icon="alert-circle"
              role={failedApps > 0 ? t.color.status.danger : t.color.status.success}
              subtitle={failedApps > 0 ? 'Needs attention' : 'All healthy'}
              loading={appsLoading}
            />
            <StatCard
              title="Workers"
              value={appsList.reduce((sum, a) => sum + (a.workers?.amount ?? 0), 0)}
              icon="server"
              role={t.color.status.success}
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
                role={t.color.status.info}
                subtitle={`${runningApps} running`}
                onPress={() => router.navigate('/(main)/runtime')}
                loading={appsLoading}
              />
              <StatCard
                title="APIs"
                value={totalApis}
                icon="api"
                role={t.color.accent.secondary}
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
                role={failedApps > 0 ? t.color.status.danger : t.color.status.success}
                subtitle={failedApps > 0 ? 'Needs attention' : 'All healthy'}
                loading={appsLoading}
              />
              <StatCard
                title="Workers"
                value={appsList.reduce((sum, a) => sum + (a.workers?.amount ?? 0), 0)}
                icon="server"
                role={t.color.status.success}
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
              <Text style={[typeScale.caption, { color: t.color.status.success.base }]}>{runningApps}</Text>
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
            {QUICK_ACTIONS.map((action) => (
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
                <View style={[styles.actionIcon, { backgroundColor: quickActionRole(t, action.role).surface }]}>
                  <Icon name={action.icon} size={18} color={quickActionRole(t, action.role).base} />
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
      backgroundColor: statusColors.running,
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
      backgroundColor: withAlpha(statusColors.running, 'subtle'),
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
