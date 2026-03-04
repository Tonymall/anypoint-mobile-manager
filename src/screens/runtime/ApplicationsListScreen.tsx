// ============================================================
// Runtime Manager - Applications List Screen
// Lists all deployed applications with filtering and search
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
} from 'react-native';
import {
  Searchbar,
  Card,
  Text,
  Chip,
  FAB,
  Badge,
  Icon,
  useTheme,
  Divider,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

import type { Application, AppStatus, DeploymentTarget } from '../../types';
import { statusColors } from '../../theme';

// --- Mock Data ---
const MOCK_APPLICATIONS: Application[] = [
  {
    id: 'app-001',
    name: 'order-processing-api',
    domain: 'order-processing-api.us-e2.cloudhub.io',
    status: 'STARTED',
    deploymentTarget: 'cloudhub',
    lastUpdateTime: '2026-03-03T08:15:00Z',
    fileName: 'order-processing-api-2.4.1.jar',
    muleVersion: '4.6.2',
    region: 'us-east-2',
    workers: {
      type: { name: 'Micro', weight: 0.1, cpu: '0.1 vCores', memory: '500 MB' },
      amount: 2,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 42, memoryUsage: 310, memoryTotal: 500, threadCount: 28 },
    properties: { 'env': 'production', 'db.host': 'rds-prod.amazonaws.com' },
    persistentQueues: true,
    loggingEnabled: true,
  },
  {
    id: 'app-002',
    name: 'customer-sapi',
    domain: 'customer-sapi.us-e2.cloudhub.io',
    status: 'STARTED',
    deploymentTarget: 'cloudhub',
    lastUpdateTime: '2026-03-02T14:30:00Z',
    fileName: 'customer-sapi-1.8.0.jar',
    muleVersion: '4.6.2',
    region: 'us-east-2',
    workers: {
      type: { name: 'Small', weight: 0.2, cpu: '0.2 vCores', memory: '1 GB' },
      amount: 1,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 18, memoryUsage: 512, memoryTotal: 1024, threadCount: 15 },
    properties: { 'env': 'production' },
    persistentQueues: false,
    loggingEnabled: true,
  },
  {
    id: 'app-003',
    name: 'payment-gateway',
    domain: 'payment-gateway.us-e1.cloudhub.io',
    status: 'FAILED',
    deploymentTarget: 'cloudhub',
    lastUpdateTime: '2026-03-03T06:45:00Z',
    fileName: 'payment-gateway-3.1.2.jar',
    muleVersion: '4.5.4',
    region: 'us-east-1',
    workers: {
      type: { name: 'Medium', weight: 1, cpu: '1 vCore', memory: '1.5 GB' },
      amount: 2,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 0, memoryUsage: 0, memoryTotal: 1536, threadCount: 0 },
    properties: { 'env': 'production', 'stripe.api.key': '****' },
    persistentQueues: true,
    loggingEnabled: true,
  },
  {
    id: 'app-004',
    name: 'inventory-sync-worker',
    domain: 'inventory-sync-worker.runtime-fabric.local',
    status: 'STARTED',
    deploymentTarget: 'rtf',
    lastUpdateTime: '2026-03-01T20:00:00Z',
    fileName: 'inventory-sync-worker-1.2.0.jar',
    muleVersion: '4.6.2',
    region: 'us-west-2',
    workers: {
      type: { name: 'Large', weight: 2, cpu: '2 vCores', memory: '3.5 GB' },
      amount: 3,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 65, memoryUsage: 2800, memoryTotal: 3584, threadCount: 54 },
    properties: { 'env': 'production', 'warehouse.endpoint': 'https://wms.internal.com' },
    persistentQueues: true,
    loggingEnabled: true,
  },
  {
    id: 'app-005',
    name: 'notification-service',
    domain: 'notification-service.hybrid.local',
    status: 'STOPPED',
    deploymentTarget: 'hybrid',
    lastUpdateTime: '2026-02-28T12:00:00Z',
    fileName: 'notification-service-2.0.5.jar',
    muleVersion: '4.4.0',
    region: 'eu-west-1',
    workers: {
      type: { name: 'Small', weight: 0.2, cpu: '0.2 vCores', memory: '1 GB' },
      amount: 1,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 0, memoryUsage: 0, memoryTotal: 1024, threadCount: 0 },
    properties: { 'env': 'staging' },
    persistentQueues: false,
    loggingEnabled: true,
  },
  {
    id: 'app-006',
    name: 'shipping-eapi',
    domain: 'shipping-eapi.us-e2.cloudhub.io',
    status: 'DEPLOYING',
    deploymentTarget: 'cloudhub',
    lastUpdateTime: '2026-03-03T09:02:00Z',
    fileName: 'shipping-eapi-1.0.0-SNAPSHOT.jar',
    muleVersion: '4.6.2',
    region: 'us-east-2',
    workers: {
      type: { name: 'Micro', weight: 0.1, cpu: '0.1 vCores', memory: '500 MB' },
      amount: 1,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 0, memoryUsage: 0, memoryTotal: 500, threadCount: 0 },
    properties: {},
    persistentQueues: false,
    loggingEnabled: true,
  },
  {
    id: 'app-007',
    name: 'analytics-collector',
    domain: 'analytics-collector.runtime-fabric.local',
    status: 'STARTED',
    deploymentTarget: 'rtf',
    lastUpdateTime: '2026-02-27T16:45:00Z',
    fileName: 'analytics-collector-4.2.1.jar',
    muleVersion: '4.6.1',
    region: 'us-east-1',
    workers: {
      type: { name: 'XLarge', weight: 4, cpu: '4 vCores', memory: '7.5 GB' },
      amount: 2,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 78, memoryUsage: 5800, memoryTotal: 7680, threadCount: 120 },
    properties: { 'env': 'production', 'kafka.brokers': 'kafka-01:9092,kafka-02:9092' },
    persistentQueues: true,
    loggingEnabled: true,
  },
  {
    id: 'app-008',
    name: 'crm-sync-batch',
    domain: 'crm-sync-batch.hybrid.local',
    status: 'STARTED',
    deploymentTarget: 'hybrid',
    lastUpdateTime: '2026-03-02T22:30:00Z',
    fileName: 'crm-sync-batch-1.5.3.jar',
    muleVersion: '4.5.4',
    region: 'eu-central-1',
    workers: {
      type: { name: 'Medium', weight: 1, cpu: '1 vCore', memory: '1.5 GB' },
      amount: 1,
      remainingOrgWorkers: 8,
    },
    monitoring: { cpuUsage: 35, memoryUsage: 890, memoryTotal: 1536, threadCount: 22 },
    properties: { 'env': 'production', 'sfdc.username': 'integration@acme.com' },
    persistentQueues: true,
    loggingEnabled: true,
  },
];

// --- Filter Definitions ---
type StatusFilter = AppStatus | 'ALL';
type TargetFilter = DeploymentTarget | 'ALL';

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Started', value: 'STARTED' },
  { label: 'Stopped', value: 'STOPPED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Deploying', value: 'DEPLOYING' },
];

const TARGET_FILTERS: { label: string; value: TargetFilter }[] = [
  { label: 'All Targets', value: 'ALL' },
  { label: 'CloudHub', value: 'cloudhub' },
  { label: 'RTF', value: 'rtf' },
  { label: 'Hybrid', value: 'hybrid' },
];

// --- Helpers ---
const getStatusColor = (status: AppStatus): string => {
  switch (status) {
    case 'STARTED':
      return statusColors.started;
    case 'STOPPED':
      return statusColors.stopped;
    case 'FAILED':
      return statusColors.failed;
    case 'DEPLOYING':
      return statusColors.deploying;
    case 'UNDEPLOYING':
      return statusColors.deploying;
    case 'PARTIALLY_STARTED':
      return statusColors.pending;
    default:
      return statusColors.stopped;
  }
};

const getTargetIcon = (target: DeploymentTarget): string => {
  switch (target) {
    case 'cloudhub':
    case 'cloudhub2':
      return 'cloud';
    case 'rtf':
      return 'server';
    case 'hybrid':
      return 'desktop-tower';
    default:
      return 'help-circle';
  }
};

const getTargetLabel = (target: DeploymentTarget): string => {
  switch (target) {
    case 'cloudhub':
      return 'CloudHub';
    case 'cloudhub2':
      return 'CloudHub 2.0';
    case 'rtf':
      return 'Runtime Fabric';
    case 'hybrid':
      return 'Hybrid';
    default:
      return target;
  }
};

const formatRelativeTime = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
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

// --- Component ---
const ApplicationsListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [applications] = useState<Application[]>(MOCK_APPLICATIONS);

  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        searchQuery === '' ||
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.domain.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || app.status === statusFilter;
      const matchesTarget = targetFilter === 'ALL' || app.deploymentTarget === targetFilter;
      return matchesSearch && matchesStatus && matchesTarget;
    });
  }, [applications, searchQuery, statusFilter, targetFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const renderApplicationCard = useCallback(
    ({ item }: ListRenderItemInfo<Application>) => {
      const color = getStatusColor(item.status);

      return (
        <Card
          style={styles.appCard}
          mode="elevated"
          onPress={() => navigation.navigate('ApplicationDetail', { app: item })}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Icon
                  source={getTargetIcon(item.deploymentTarget)}
                  size={20}
                  color={theme.colors.primary}
                />
                <Text variant="titleMedium" style={styles.appName} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              <Badge
                style={[styles.statusBadge, { backgroundColor: color }]}
                size={24}
              >
                {item.status}
              </Badge>
            </View>

            <Divider style={styles.cardDivider} />

            <View style={styles.cardDetails}>
              <View style={styles.detailRow}>
                <Icon source="target" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={styles.detailText}>
                  {getTargetLabel(item.deploymentTarget)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Icon source="map-marker" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={styles.detailText}>
                  {item.region}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Icon source="account-group" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={styles.detailText}>
                  {item.workers.amount} x {item.workers.type.name}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Icon source="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={styles.detailText}>
                  {formatRelativeTime(item.lastUpdateTime)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      );
    },
    [navigation, styles, theme],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Icon source="application-outline" size={64} color={theme.colors.outlineVariant} />
        <Text variant="titleMedium" style={styles.emptyTitle}>
          No applications found
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          {searchQuery || statusFilter !== 'ALL' || targetFilter !== 'ALL'
            ? 'Try adjusting your filters or search query.'
            : 'Deploy your first application to get started.'}
        </Text>
      </View>
    ),
    [searchQuery, statusFilter, targetFilter, styles, theme],
  );

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search applications..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
        inputStyle={styles.searchInput}
      />

      {/* Status filter chips */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Chip
              selected={statusFilter === item.value}
              onPress={() => setStatusFilter(item.value)}
              style={styles.filterChip}
              showSelectedOverlay
              compact
            >
              {item.label}
            </Chip>
          )}
        />
      </View>

      {/* Target filter chips */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TARGET_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Chip
              selected={targetFilter === item.value}
              onPress={() => setTargetFilter(item.value)}
              style={styles.filterChip}
              showSelectedOverlay
              compact
              icon={item.value !== 'ALL' ? getTargetIcon(item.value as DeploymentTarget) : undefined}
            >
              {item.label}
            </Chip>
          )}
        />
      </View>

      {/* Results count */}
      <Text variant="labelMedium" style={styles.resultsCount}>
        {filteredApps.length} application{filteredApps.length !== 1 ? 's' : ''}
      </Text>

      {/* Applications list */}
      <FlatList
        data={filteredApps}
        keyExtractor={(item) => item.id}
        renderItem={renderApplicationCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Deploy FAB */}
      <FAB
        icon="rocket-launch"
        label="Deploy"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={() => navigation.navigate('Deploy')}
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
    searchBar: {
      margin: 16,
      marginBottom: 8,
      elevation: 2,
    },
    searchInput: {
      fontSize: 14,
    },
    filterSection: {
      marginBottom: 4,
    },
    chipRow: {
      paddingHorizontal: 16,
      gap: 8,
    },
    filterChip: {
      marginRight: 0,
    },
    resultsCount: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      color: theme.colors.onSurfaceVariant,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 96,
    },
    appCard: {
      marginBottom: 12,
      backgroundColor: theme.colors.surface,
    },
    cardContent: {
      paddingVertical: 12,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 12,
      gap: 8,
    },
    appName: {
      flex: 1,
      fontWeight: '600',
    },
    statusBadge: {
      paddingHorizontal: 8,
      borderRadius: 12,
      fontSize: 10,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    cardDivider: {
      marginVertical: 8,
    },
    cardDetails: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    detailText: {
      color: theme.colors.onSurfaceVariant,
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
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 24,
    },
  });

export default ApplicationsListScreen;
