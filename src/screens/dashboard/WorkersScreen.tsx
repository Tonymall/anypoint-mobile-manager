// ============================================================
// Workers Screen - Worker allocation across deployed applications
// Shows total workers, vCores, and per-app worker breakdown
// ============================================================

import React, { useMemo } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Appbar, Text, Card, useTheme, ProgressBar, Icon, type MD3Theme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useApplications } from '../../hooks/queries';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { anypointColors } from '../../theme';
import { getAppName, getAppId, getWorkerInfo } from '../../utils/appHelpers';
import { getStatusColor } from '../../utils/statusHelpers';
import LoadingState from '../../components/common/LoadingState';

/** Map worker type name to vCore value */
const parseVCores = (typeName: string): number => {
  const num = parseFloat(typeName);
  if (!isNaN(num)) return num;
  // Common CloudHub worker type names
  const mapping: Record<string, number> = {
    'Micro': 0.1,
    'Small': 0.2,
    'Medium': 1,
    'Large': 2,
    'xLarge': 4,
    'xlarge': 4,
    'micro': 0.1,
    'small': 0.2,
    'medium': 1,
    'large': 2,
  };
  return mapping[typeName] ?? 0.1;
};

interface WorkerAppItem {
  app: any;
  name: string;
  id: string;
  status: string;
  workerCount: number;
  typeName: string;
  vCores: number;
}

const WorkersScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    data: applications,
    isLoading,
    refetch,
  } = useApplications();

  const pullRefresh = usePullRefresh(refetch);

  const appsList = useMemo(() => applications ?? [], [applications]);

  /** Build sorted worker items and summary stats */
  const { workerItems, totalWorkers, totalVCores, totalAppsWithWorkers } = useMemo(() => {
    const items: WorkerAppItem[] = appsList.map((app: any) => {
      const workerInfo = getWorkerInfo(app);
      const vCoresPerWorker = parseVCores(workerInfo.typeName);
      return {
        app,
        name: getAppName(app),
        id: getAppId(app),
        status: app?.status ?? 'UNKNOWN',
        workerCount: workerInfo.amount,
        typeName: workerInfo.typeName,
        vCores: vCoresPerWorker * workerInfo.amount,
      };
    });

    // Sort by worker count descending, then by name ascending
    items.sort((a, b) => {
      if (b.workerCount !== a.workerCount) return b.workerCount - a.workerCount;
      return a.name.localeCompare(b.name);
    });

    const workers = items.reduce((sum, item) => sum + item.workerCount, 0);
    const cores = items.reduce((sum, item) => sum + item.vCores, 0);
    const appsWithWorkers = items.filter((item) => item.workerCount > 0).length;

    return {
      workerItems: items,
      totalWorkers: workers,
      totalVCores: cores,
      totalAppsWithWorkers: appsWithWorkers,
    };
  }, [appsList]);

  const renderSummaryCard = () => (
    <Card style={styles.summaryCard} mode="contained">
      <Card.Content style={styles.summaryContent}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconCircle, { backgroundColor: anypointColors.accent + '20' }]}>
              <Icon source="server" size={20} color={anypointColors.accent} />
            </View>
            <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
              {totalWorkers}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Workers
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconCircle, { backgroundColor: anypointColors.primary + '20' }]}>
              <Icon source="chip" size={20} color={anypointColors.primary} />
            </View>
            <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
              {totalVCores % 1 === 0 ? totalVCores : totalVCores.toFixed(1)}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              vCores
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconCircle, { backgroundColor: anypointColors.secondary + '20' }]}>
              <Icon source="application-cog" size={20} color={anypointColors.secondary} />
            </View>
            <Text variant="headlineSmall" style={[styles.summaryValue, { color: theme.colors.onSurface }]}>
              {totalAppsWithWorkers}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Apps
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  const renderWorkerItem = ({ item }: { item: WorkerAppItem }) => {
    const proportion = totalWorkers > 0 ? item.workerCount / totalWorkers : 0;
    const statusColor = getStatusColor(item.status);
    const vCoresDisplay = parseVCores(item.typeName);

    return (
      <Card style={styles.workerCard} mode="contained">
        <Card.Content style={styles.workerCardContent}>
          <View style={styles.workerTopRow}>
            <View style={styles.workerNameRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurface, fontWeight: '600', flex: 1 }}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </View>
            <View style={styles.workerBadge}>
              <Text variant="labelSmall" style={{ color: anypointColors.accent, fontWeight: '600' }}>
                {item.workerCount} {item.workerCount === 1 ? 'worker' : 'workers'}
              </Text>
            </View>
          </View>

          <View style={styles.workerDetailsRow}>
            <View style={styles.workerTypeChip}>
              <Icon source="chip" size={12} color={theme.colors.onSurfaceVariant} />
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                {vCoresDisplay % 1 === 0 ? vCoresDisplay : vCoresDisplay.toFixed(1)} vCores
              </Text>
            </View>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {Math.round(proportion * 100)}% of total
            </Text>
          </View>

          <ProgressBar
            progress={proportion}
            color={anypointColors.primary}
            style={styles.progressBar}
          />
        </Card.Content>
      </Card>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon source="server-off" size={56} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 16 }}>
        No Applications
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}>
        No deployed applications found in this environment.
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Worker Allocation" />
        </Appbar.Header>
        <LoadingState message="Loading worker data..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.surface }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Worker Allocation" />
      </Appbar.Header>

      <FlatList
        data={workerItems}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkerItem}
        ListHeaderComponent={renderSummaryCard}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            colors={[anypointColors.primary]}
            tintColor={anypointColors.primary}
          />
        }
      />
    </View>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      flexGrow: 1,
    },
    // Summary card
    summaryCard: {
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      elevation: 0,
    },
    summaryContent: {
      paddingVertical: 20,
      paddingHorizontal: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
    },
    summaryItem: {
      alignItems: 'center',
      flex: 1,
    },
    summaryIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    summaryValue: {
      fontWeight: '800',
      marginBottom: 2,
    },
    summaryDivider: {
      width: 1,
      height: 48,
      backgroundColor: theme.colors.surfaceVariant,
    },
    // Worker cards
    workerCard: {
      marginTop: 10,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.surfaceVariant,
      borderWidth: 1,
      elevation: 0,
    },
    workerCardContent: {
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    workerTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    workerNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 12,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    workerBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: anypointColors.accent + '15',
    },
    workerDetailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    workerTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.surfaceVariant,
    },
    // Empty state
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
      paddingHorizontal: 32,
    },
  });

export default WorkersScreen;
