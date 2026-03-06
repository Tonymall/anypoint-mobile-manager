// ============================================================
// Platform Alerts — Alert List (2026 Design)
//
// Card-based alert list with severity filtering, search,
// pull-to-refresh, and navigation to alert detail.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
  Pressable,
} from 'react-native';
import {
  Searchbar,
  Text,
  Chip,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useRouter } from 'expo-router';

import type { Alert, AlertSeverity } from '../../types';
import { anypointColors, severityColors } from '../../theme';
import { usePlatformAlerts } from '../../hooks/queries/useAlertQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Filter Definitions ---
type SeverityFilter = AlertSeverity | 'ALL';

const SEVERITY_FILTERS: { label: string; value: SeverityFilter; icon: string }[] = [
  { label: 'All', value: 'ALL', icon: 'bell-outline' },
  { label: 'Critical', value: 'CRITICAL', icon: 'alert-octagon' },
  { label: 'Warning', value: 'WARNING', icon: 'alert' },
  { label: 'Info', value: 'INFO', icon: 'information' },
];

// --- Severity helpers ---
const getSeverityColor = (severity: AlertSeverity): string => {
  return severityColors[severity] ?? anypointColors.info;
};

const getSeverityIcon = (severity: AlertSeverity): string => {
  switch (severity) {
    case 'CRITICAL': return 'alert-octagon';
    case 'WARNING': return 'alert';
    case 'INFO': return 'information';
    default: return 'bell-outline';
  }
};

const getStatusColor = (status: string, theme: MD3Theme): string => {
  switch (status) {
    case 'ACTIVE': return anypointColors.error;
    case 'ACKNOWLEDGED': return anypointColors.warning;
    case 'RESOLVED': return anypointColors.success;
    case 'DISMISSED': return theme.colors.onSurfaceVariant;
    default: return theme.colors.onSurfaceVariant;
  }
};

// ── Alert Card ──
const AlertCard = React.memo<{
  alert: Alert;
  onPress: () => void;
  theme: MD3Theme;
}>(({ alert, onPress, theme }) => {
  const sevColor = getSeverityColor(alert.severity);
  const statColor = getStatusColor(alert.status, theme);

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityLabel={`${alert.name}, ${alert.severity} alert, ${alert.status}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view details"
      style={({ pressed }) => [
        {
          marginBottom: 8,
          borderRadius: 18,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
          overflow: 'hidden',
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Severity accent border at left */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          borderRadius: 1.5,
          backgroundColor: sevColor,
        }}
      />

      <View style={{ padding: 16, paddingLeft: 18 }}>
        {/* Header: name + status badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            <Icon name={getSeverityIcon(alert.severity)} size={18} color={sevColor} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: theme.colors.onSurface,
                letterSpacing: -0.2,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {alert.name}
            </Text>
          </View>

          {/* Status chip badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: statColor + '12',
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: statColor,
                ...(alert.status === 'ACTIVE'
                  ? {
                      shadowColor: statColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 3,
                    }
                  : {}),
              }}
            />
            <Text
              style={{
                color: statColor,
                fontSize: 11,
                fontWeight: '700',
                letterSpacing: 0.2,
              }}
            >
              {alert.status}
            </Text>
          </View>
        </View>

        {/* Message (2 lines max) */}
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.onSurfaceVariant,
            marginTop: 8,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {alert.message}
        </Text>

        {/* Meta: source app + relative time */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {alert.applicationName && (
            <View style={tagStyle(theme)}>
              <Icon name="application-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{alert.applicationName}</Text>
            </View>
          )}
          {alert.source && (
            <View style={tagStyle(theme)}>
              <Icon name="source-branch" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{alert.source}</Text>
            </View>
          )}
          <View style={tagStyle(theme)}>
            <Icon name="clock-outline" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={tagTextStyle(theme)}>{formatRelativeTime(alert.createdAt)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
AlertCard.displayName = 'AlertCard';

// Tag helpers (match ApplicationsListScreen style)
const tagStyle = (theme: MD3Theme) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 8,
  backgroundColor: theme.colors.surfaceVariant + '80',
});

const tagTextStyle = (theme: MD3Theme) => ({
  fontSize: 11,
  color: theme.colors.onSurfaceVariant,
  fontWeight: '500' as const,
});

// --- Component ---
const PlatformAlertsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');

  const { data: alerts, isLoading, error, refetch, isRefetching } = usePlatformAlerts();

  const alertsList = useMemo(() => (alerts as Alert[] | undefined) ?? [], [alerts]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    alertsList.forEach((a) => {
      counts[a.severity] = (counts[a.severity] ?? 0) + 1;
    });
    return counts;
  }, [alertsList]);

  const filteredAlerts = useMemo(() => {
    return alertsList.filter((alert) => {
      const matchesSearch =
        searchQuery === '' ||
        alert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (alert.applicationName ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [alertsList, searchQuery, severityFilter]);

  const renderAlertCard = useCallback(
    ({ item }: ListRenderItemInfo<Alert>) => (
      <AlertCard
        alert={item}
        onPress={() =>
          router.push({
            pathname: '/(main)/alerts/detail' as any,
            params: { alertId: item.id },
          })
        }
        theme={theme}
      />
    ),
    [theme, router],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: theme.colors.surfaceVariant,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="bell-off-outline" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: theme.colors.onSurface,
            marginBottom: 6,
          }}
        >
          No platform alerts
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.onSurfaceVariant,
            textAlign: 'center',
          }}
        >
          {searchQuery || severityFilter !== 'ALL'
            ? 'Try adjusting your filters or search query.'
            : 'All clear! No alerts have been triggered.'}
        </Text>
      </View>
    ),
    [searchQuery, severityFilter, theme],
  );

  if (isLoading) return <LoadingState message="Loading alerts..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.topBar, { paddingTop: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
          <View style={[styles.sectionAccent, { backgroundColor: theme.colors.primary }]} />
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: theme.colors.onSurface,
              flex: 1,
              letterSpacing: -0.3,
            }}
          >
            Alerts
          </Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: anypointColors.primary + '12',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>
              {alertsList.length}
            </Text>
          </View>
        </View>
        <Searchbar
          placeholder="Search by name or app..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* ── Severity filter chips ── */}
      <View style={styles.filterRow}>
        {SEVERITY_FILTERS.map((f) => {
          const isActive = severityFilter === f.value;
          const chipColor =
            f.value === 'ALL'
              ? anypointColors.primary
              : getSeverityColor(f.value as AlertSeverity);
          const count =
            f.value === 'ALL' ? alertsList.length : (severityCounts[f.value] ?? 0);

          return (
            <Chip
              key={f.value}
              icon={f.icon}
              onPress={() => {
                hapticLight();
                setSeverityFilter(f.value);
              }}
              style={[
                styles.filterChip,
                { borderColor: theme.colors.outline },
                isActive && {
                  backgroundColor: chipColor + '15',
                  borderColor: chipColor + '30',
                },
              ]}
              selected={isActive}
              selectedColor={isActive ? chipColor : undefined}
              compact
              accessibilityRole="button"
              accessibilityLabel={`Filter: ${f.label} (${count})`}
            >
              {`${f.label} (${count})`}
            </Chip>
          );
        })}
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {filteredAlerts.length} result{filteredAlerts.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* ── Alerts list ── */}
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    marginRight: 10,
  },
  searchBar: {
    elevation: 0,
    borderRadius: 16,
    height: 44,
  },
  searchInput: {
    fontSize: 14,
    minHeight: 44,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    borderRadius: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
});

export default PlatformAlertsScreen;
