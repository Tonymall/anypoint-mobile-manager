// ============================================================
// Deployment History — Timeline-style list of deployments
//
// Modern card layout with timeline connector, glowing status
// dots, filter chips, and clean typography hierarchy.
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
  Text,
  Chip,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import type { DeploymentHistory, DeploymentStatus } from '../../types';
import { anypointColors } from '../../theme';
import { useDeploymentHistory } from '../../hooks/queries/useDeploymentQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Status colors for deployment ---
const DEPLOYMENT_STATUS_COLOR: Record<DeploymentStatus, string> = {
  DEPLOYED: anypointColors.success,
  FAILED: anypointColors.error,
  DEPLOYING: anypointColors.info,
  UNDEPLOYING: anypointColors.warning,
  PARTIALLY_DEPLOYED: '#EAB308',
};

const getDeploymentStatusColor = (status: string): string =>
  DEPLOYMENT_STATUS_COLOR[status as DeploymentStatus] ?? '#6B7280';

const getDeploymentStatusLabel = (status: string): string => {
  switch (status) {
    case 'DEPLOYED': return 'Deployed';
    case 'FAILED': return 'Failed';
    case 'DEPLOYING': return 'Deploying';
    case 'UNDEPLOYING': return 'Undeploying';
    case 'PARTIALLY_DEPLOYED': return 'Partial';
    default: return status;
  }
};

// --- Filter Definitions ---
type StatusFilter = 'ALL' | 'DEPLOYED' | 'FAILED' | 'DEPLOYING';

const FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Deployed', value: 'DEPLOYED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Deploying', value: 'DEPLOYING' },
];

// --- Timeline Card ---
const TimelineCard = React.memo<{
  item: DeploymentHistory;
  isLast: boolean;
  onPress?: () => void;
  theme: MD3Theme;
}>(({ item, isLast, onPress, theme }) => {
  const color = getDeploymentStatusColor(item.status);
  const label = getDeploymentStatusLabel(item.status);
  const isInteractive = !!onPress;

  return (
    <View style={{ flexDirection: 'row', marginBottom: 0 }}>
      {/* Left timeline */}
      <View style={{ width: 32, alignItems: 'center', paddingTop: 18 }}>
        {/* Status dot */}
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: item.status === 'DEPLOYED' ? 0.6 : 0.3,
            shadowRadius: 4,
            elevation: 2,
            zIndex: 1,
          }}
        />
        {/* Connector line */}
        {!isLast && (
          <View
            style={{
              flex: 1,
              width: 2,
              backgroundColor: theme.colors.outlineVariant,
              marginTop: 4,
            }}
          />
        )}
      </View>

      {/* Right card */}
      <Pressable
        disabled={!isInteractive}
        onPress={() => {
          if (!onPress) return;
          hapticLight();
          onPress();
        }}
        accessibilityLabel={`${item.applicationName} ${label}${isInteractive ? '' : ', details unavailable'}`}
        accessibilityRole={isInteractive ? 'button' : undefined}
        style={({ pressed }) => [
          {
            flex: 1,
            marginLeft: 8,
            marginBottom: 10,
            borderRadius: 18,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            overflow: 'hidden',
            opacity: !isInteractive ? 0.72 : pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={{ padding: 14 }}>
          {/* Header: app name + status badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: theme.colors.onSurface,
                flex: 1,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {item.applicationName}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: color + '12',
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: color,
                }}
              />
              <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
                {label}
              </Text>
            </View>
          </View>

          {/* Meta tags */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {/* Version badge */}
            <View style={tagStyle(theme)}>
              <Icon name="tag-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>v{item.version}</Text>
            </View>

            {/* Target type */}
            <View style={tagStyle(theme)}>
              <Icon name="cloud-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{item.targetType}</Text>
            </View>

            {/* Initiator */}
            <View style={tagStyle(theme)}>
              <Icon name="account-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{item.initiatedBy}</Text>
            </View>

            {/* Time */}
            <View style={tagStyle(theme)}>
              <Icon name="clock-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{formatRelativeTime(item.startedAt)}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
});
TimelineCard.displayName = 'TimelineCard';

// Tag helpers
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

// --- Main Screen ---
const DeploymentHistoryScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const isFocused = useIsFocused();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const { data: deployments, isLoading, error, refetch, isRefetching } = useDeploymentHistory(undefined, { enabled: isFocused });

  const deploymentList = useMemo(() => {
    const items = ((deployments as any)?.data ?? []) as DeploymentHistory[];
    if (statusFilter === 'ALL') return items;
    return items.filter((d) => d.status === statusFilter);
  }, [deployments, statusFilter]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<DeploymentHistory>) => {
      const domain = item.applicationName?.trim();
      const onPress = domain
        ? () =>
            router.push({
              pathname: '/(main)/runtime/[domain]' as any,
              params: { domain },
            })
        : undefined;

      return (
      <TimelineCard
        item={item}
        isLast={index === deploymentList.length - 1}
        onPress={onPress}
        theme={theme}
      />
      );
    },
    [theme, router, deploymentList.length],
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
          <Icon name="rocket-launch-outline" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No deployment history
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          {statusFilter !== 'ALL'
            ? 'Try adjusting your filter selection.'
            : 'No deployments have been recorded in this environment.'}
        </Text>
      </View>
    ),
    [statusFilter, styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading deployment history..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.topBar, { paddingTop: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
          <View style={styles.sectionAccent} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.onSurface, flex: 1, letterSpacing: -0.3 }}>
            Deployment History
          </Text>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: anypointColors.primary + '12' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>
              {((deployments as any)?.data ?? []).length}
            </Text>
          </View>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((opt) => {
          const isSelected = statusFilter === opt.value;
          return (
            <Chip
              key={opt.value}
              onPress={() => {
                hapticLight();
                setStatusFilter(opt.value);
              }}
              style={[
                styles.filterChip,
                isSelected && {
                  backgroundColor: anypointColors.primary + '15',
                  borderColor: anypointColors.primary + '30',
                },
              ]}
              selected={isSelected}
              selectedColor={isSelected ? anypointColors.primary : undefined}
              compact
            >
              {opt.label}
            </Chip>
          );
        })}
      </View>

      {/* Timeline list */}
      <FlatList
        data={deploymentList}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
    topBar: {
      paddingHorizontal: 16,
      paddingBottom: 4,
    },
    sectionAccent: {
      width: 3,
      height: 18,
      borderRadius: 1.5,
      backgroundColor: theme.colors.primary,
      marginRight: 10,
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
      borderColor: theme.colors.outline,
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

export default DeploymentHistoryScreen;
