// ============================================================
// Schedulers Screen - View and toggle app schedulers
// ============================================================

import React, { useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Platform } from 'react-native';
import { Appbar, Text, Switch, Card, useTheme, Snackbar, IconButton, type MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSchedulers, useUpdateScheduler, useRunScheduler } from '../../hooks/queries';
import type { Schedule } from '../../services/runtimeService';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ---------------------------------------------------------------------------
// Schedule Item Component
// ---------------------------------------------------------------------------

interface ScheduleItemProps {
  schedule: Schedule;
  domain: string;
  theme: MD3Theme;
  onToggle: (scheduleId: string, enabled: boolean) => void;
  onRun: (scheduleId: string) => void;
  isUpdating: boolean;
}

const ScheduleItem = React.memo<ScheduleItemProps>(
  ({ schedule, domain: _domain, theme, onToggle, onRun, isUpdating }) => {
    const cronOrFrequency = schedule.cronExpression
      ? `Cron: ${schedule.cronExpression}`
      : schedule.frequency
        ? `Every ${schedule.frequency} ${schedule.timeUnit ?? ''}`
        : 'Fixed schedule';

    return (
      <Card
        style={{
          marginHorizontal: 16,
          marginBottom: 10,
          backgroundColor: theme.colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.surfaceVariant,
          elevation: 0,
        }}
        mode="contained"
      >
        <Card.Content style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                variant="titleSmall"
                style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                numberOfLines={1}
              >
                {schedule.name || schedule.flowName}
              </Text>
              {schedule.flowName && schedule.name !== schedule.flowName && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                  numberOfLines={1}
                >
                  Flow: {schedule.flowName}
                </Text>
              )}
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 4,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {cronOrFrequency}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Run now button */}
              <IconButton
                icon="play-circle-outline"
                size={22}
                iconColor={theme.colors.primary}
                onPress={() => onRun(schedule.id)}
                disabled={!schedule.enabled || isUpdating}
              />

              {/* Enable/Disable toggle */}
              <Switch
                value={schedule.enabled}
                onValueChange={(val) => onToggle(schedule.id, val)}
                disabled={isUpdating}
                color={theme.colors.primary}
              />
            </View>
          </View>

          {/* Last run / Next run info */}
          {(schedule.lastRun || schedule.nextRun) && (
            <View
              style={{
                flexDirection: 'row',
                gap: 16,
                marginTop: 8,
                paddingTop: 8,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.colors.outlineVariant,
              }}
            >
              {schedule.lastRun && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="history" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                    Last: {new Date(schedule.lastRun).toLocaleString()}
                  </Text>
                </View>
              )}
              {schedule.nextRun && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="clock-fast" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                    Next: {new Date(schedule.nextRun).toLocaleString()}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Card.Content>
      </Card>
    );
  },
);

ScheduleItem.displayName = 'ScheduleItem';

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const SchedulersScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    data: schedulers,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useSchedulers(domain as string);

  const updateMutation = useUpdateScheduler();
  const runMutation = useRunScheduler();

  const [snackMessage, setSnackMessage] = React.useState('');
  const [snackVisible, setSnackVisible] = React.useState(false);

  const handleToggle = useCallback(
    (scheduleId: string, enabled: boolean) => {
      updateMutation.mutate(
        { domain: domain as string, scheduleId, enabled },
        {
          onSuccess: () => {
            setSnackMessage(`Scheduler ${enabled ? 'enabled' : 'disabled'}`);
            setSnackVisible(true);
          },
          onError: (err: any) => {
            setSnackMessage(err?.message ?? 'Failed to update scheduler');
            setSnackVisible(true);
          },
        },
      );
    },
    [domain, updateMutation],
  );

  const handleRun = useCallback(
    (scheduleId: string) => {
      runMutation.mutate(
        { domain: domain as string, scheduleId },
        {
          onSuccess: () => {
            setSnackMessage('Scheduler triggered');
            setSnackVisible(true);
          },
          onError: (err: any) => {
            setSnackMessage(err?.message ?? 'Failed to trigger scheduler');
            setSnackVisible(true);
          },
        },
      );
    },
    [domain, runMutation],
  );

  const isUpdating = updateMutation.isPending || runMutation.isPending;

  const renderItem = useCallback(
    ({ item }: { item: Schedule }) => (
      <ScheduleItem
        schedule={item}
        domain={domain as string}
        theme={theme}
        onToggle={handleToggle}
        onRun={handleRun}
        isUpdating={isUpdating}
      />
    ),
    [domain, theme, handleToggle, handleRun, isUpdating],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Icon name="calendar-clock" size={48} color={theme.colors.outlineVariant} />
        <Text variant="titleMedium" style={styles.emptyTitle}>
          No schedulers found
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          This application does not have any configured schedulers.
        </Text>
      </View>
    );
  }, [isLoading, styles, theme]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Schedulers" />
        </Appbar.Header>
        <LoadingState message="Loading schedulers..." />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Schedulers" />
        </Appbar.Header>
        <ErrorState
          message={(error as Error)?.message ?? 'Failed to load schedulers'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const scheduleList = schedulers ?? [];

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Schedulers" />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      {/* Stats bar */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Total
          </Text>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {scheduleList.length}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Enabled
          </Text>
          <Text variant="titleMedium" style={{ color: '#4CAF50', fontWeight: '700' }}>
            {scheduleList.filter((s) => s.enabled).length}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Disabled
          </Text>
          <Text variant="titleMedium" style={{ color: '#9E9E9E', fontWeight: '700' }}>
            {scheduleList.filter((s) => !s.enabled).length}
          </Text>
        </View>
      </View>

      <FlatList
        data={scheduleList}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={scheduleList.length === 0 ? styles.emptyListContent : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={2500}
        action={{ label: 'OK', onPress: () => setSnackVisible(false) }}
      >
        {snackMessage}
      </Snackbar>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    statsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 16,
      justifyContent: 'center',
    },
    statItem: {
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      minWidth: 80,
    },
    listContent: {
      paddingBottom: 24,
    },
    emptyListContent: {
      flexGrow: 1,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 80,
    },
    emptyTitle: {
      color: theme.colors.onSurface,
      marginTop: 12,
      marginBottom: 8,
    },
    emptySubtitle: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
  });

export default SchedulersScreen;
