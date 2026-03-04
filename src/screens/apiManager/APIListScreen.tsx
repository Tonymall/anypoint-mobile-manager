// ============================================================
// API Manager - API List Screen
// Lists all managed API instances with search, filter, and
// pull-to-refresh.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import {
  Appbar,
  Searchbar,
  Chip,
  Card,
  Text,
  Badge,
  Divider,
  useTheme,
  IconButton,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import type { APIStatus, ManagedAPI } from '../../types';
import { statusColors } from '../../theme';

// ── Mock Data ────────────────────────────────────────────────

const MOCK_APIS: ManagedAPI[] = [
  {
    id: 19201,
    instanceLabel: 'Orders API v2.0 - Production',
    assetId: 'orders-api',
    assetVersion: '2.0.3',
    productVersion: 'v2',
    environmentId: 'env-prod-001',
    technology: 'mule4',
    endpointUri: 'https://api.acme.com/orders/v2',
    status: 'active',
    autodiscoveryInstanceName: 'orders-api-v2-prod',
    policies: [
      { id: 1, policyTemplateId: 'client-id-enforcement', groupId: 'com.mulesoft', assetId: 'client-id-enforcement', assetVersion: '1.3.0', configuration: {}, order: 1, disabled: false },
      { id: 2, policyTemplateId: 'rate-limiting', groupId: 'com.mulesoft', assetId: 'rate-limiting', assetVersion: '1.4.0', configuration: { maximumRequests: 1000, timePeriodInMilliseconds: 60000 }, order: 2, disabled: false },
      { id: 3, policyTemplateId: 'jwt-validation', groupId: 'com.mulesoft', assetId: 'jwt-validation', assetVersion: '1.2.0', configuration: {}, order: 3, disabled: false },
    ],
    slaTiers: [
      { id: 1, name: 'Gold', description: 'High throughput tier', status: 'ACTIVE', autoApprove: false, limits: [{ maximumRequests: 5000, timePeriodInMilliseconds: 60000, visible: true }] },
      { id: 2, name: 'Silver', description: 'Standard tier', status: 'ACTIVE', autoApprove: true, limits: [{ maximumRequests: 1000, timePeriodInMilliseconds: 60000, visible: true }] },
    ],
    alerts: [],
    contracts: [
      { id: 1, applicationName: 'Mobile Commerce App', applicationId: 5001, status: 'APPROVED', tierId: 1, tierName: 'Gold', requestedDate: '2025-11-10T08:30:00Z', approvedDate: '2025-11-10T09:00:00Z' },
      { id: 2, applicationName: 'Partner Portal', applicationId: 5002, status: 'APPROVED', tierId: 2, tierName: 'Silver', requestedDate: '2025-12-01T14:20:00Z', approvedDate: '2025-12-01T15:00:00Z' },
      { id: 3, applicationName: 'Analytics Dashboard', applicationId: 5003, status: 'PENDING', tierId: 1, tierName: 'Gold', requestedDate: '2026-02-28T10:00:00Z' },
    ],
  },
  {
    id: 19202,
    instanceLabel: 'Customer Experience API v1.5',
    assetId: 'customer-experience-api',
    assetVersion: '1.5.1',
    productVersion: 'v1',
    environmentId: 'env-prod-001',
    technology: 'mule4',
    endpointUri: 'https://api.acme.com/customers/v1',
    status: 'active',
    autodiscoveryInstanceName: 'cxp-api-v1-prod',
    policies: [
      { id: 4, policyTemplateId: 'client-id-enforcement', groupId: 'com.mulesoft', assetId: 'client-id-enforcement', assetVersion: '1.3.0', configuration: {}, order: 1, disabled: false },
      { id: 5, policyTemplateId: 'oauth2-access-token', groupId: 'com.mulesoft', assetId: 'oauth2-access-token', assetVersion: '1.3.1', configuration: {}, order: 2, disabled: false },
    ],
    slaTiers: [
      { id: 3, name: 'Enterprise', description: 'Enterprise-grade access', status: 'ACTIVE', autoApprove: false, limits: [{ maximumRequests: 10000, timePeriodInMilliseconds: 60000, visible: true }] },
    ],
    alerts: [],
    contracts: [
      { id: 4, applicationName: 'CRM Integration', applicationId: 5004, status: 'APPROVED', tierId: 3, tierName: 'Enterprise', requestedDate: '2025-10-15T12:00:00Z', approvedDate: '2025-10-15T14:00:00Z' },
    ],
  },
  {
    id: 19203,
    instanceLabel: 'Payment Gateway API v3.1',
    assetId: 'payment-gateway-api',
    assetVersion: '3.1.0',
    productVersion: 'v3',
    environmentId: 'env-prod-001',
    technology: 'mule4',
    endpointUri: 'https://api.acme.com/payments/v3',
    status: 'active',
    autodiscoveryInstanceName: 'payments-v3-prod',
    policies: [
      { id: 6, policyTemplateId: 'client-id-enforcement', groupId: 'com.mulesoft', assetId: 'client-id-enforcement', assetVersion: '1.3.0', configuration: {}, order: 1, disabled: false },
      { id: 7, policyTemplateId: 'jwt-validation', groupId: 'com.mulesoft', assetId: 'jwt-validation', assetVersion: '1.2.0', configuration: {}, order: 2, disabled: false },
      { id: 8, policyTemplateId: 'ip-whitelist', groupId: 'com.mulesoft', assetId: 'ip-whitelist', assetVersion: '1.1.0', configuration: {}, order: 3, disabled: false },
      { id: 9, policyTemplateId: 'spike-control', groupId: 'com.mulesoft', assetId: 'spike-control', assetVersion: '1.1.0', configuration: {}, order: 4, disabled: false },
    ],
    slaTiers: [],
    alerts: [],
    contracts: [
      { id: 5, applicationName: 'Checkout Service', applicationId: 5005, status: 'APPROVED', tierId: 0, tierName: 'Default', requestedDate: '2025-09-20T16:00:00Z', approvedDate: '2025-09-20T16:30:00Z' },
      { id: 6, applicationName: 'Mobile Commerce App', applicationId: 5001, status: 'APPROVED', tierId: 0, tierName: 'Default', requestedDate: '2025-10-01T08:00:00Z', approvedDate: '2025-10-01T09:00:00Z' },
    ],
  },
  {
    id: 19204,
    instanceLabel: 'Inventory System API v1.2',
    assetId: 'inventory-system-api',
    assetVersion: '1.2.4',
    productVersion: 'v1',
    environmentId: 'env-prod-001',
    technology: 'mule3',
    endpointUri: 'https://api.acme.com/inventory/v1',
    status: 'inactive',
    autodiscoveryInstanceName: 'inventory-v1-prod',
    policies: [
      { id: 10, policyTemplateId: 'client-id-enforcement', groupId: 'com.mulesoft', assetId: 'client-id-enforcement', assetVersion: '1.3.0', configuration: {}, order: 1, disabled: false },
    ],
    slaTiers: [],
    alerts: [],
    contracts: [],
  },
  {
    id: 19205,
    instanceLabel: 'Shipping Logistics API v2.3',
    assetId: 'shipping-logistics-api',
    assetVersion: '2.3.0',
    productVersion: 'v2',
    environmentId: 'env-prod-001',
    technology: 'mule4',
    endpointUri: 'https://api.acme.com/shipping/v2',
    status: 'active',
    autodiscoveryInstanceName: 'shipping-v2-prod',
    policies: [
      { id: 11, policyTemplateId: 'rate-limiting', groupId: 'com.mulesoft', assetId: 'rate-limiting', assetVersion: '1.4.0', configuration: { maximumRequests: 500, timePeriodInMilliseconds: 60000 }, order: 1, disabled: false },
      { id: 12, policyTemplateId: 'cors', groupId: 'com.mulesoft', assetId: 'cors', assetVersion: '1.2.0', configuration: {}, order: 2, disabled: false },
    ],
    slaTiers: [
      { id: 4, name: 'Standard', description: 'Standard shipping API access', status: 'ACTIVE', autoApprove: true, limits: [{ maximumRequests: 2000, timePeriodInMilliseconds: 60000, visible: true }] },
    ],
    alerts: [],
    contracts: [
      { id: 7, applicationName: 'Warehouse Management', applicationId: 5006, status: 'APPROVED', tierId: 4, tierName: 'Standard', requestedDate: '2026-01-05T10:30:00Z', approvedDate: '2026-01-05T10:31:00Z' },
      { id: 8, applicationName: 'Order Fulfillment', applicationId: 5007, status: 'PENDING', tierId: 4, tierName: 'Standard', requestedDate: '2026-02-20T09:15:00Z' },
    ],
  },
  {
    id: 19206,
    instanceLabel: 'Product Catalog API v1.0',
    assetId: 'product-catalog-api',
    assetVersion: '1.0.7',
    productVersion: 'v1',
    environmentId: 'env-prod-001',
    technology: 'http',
    endpointUri: 'https://api.acme.com/products/v1',
    status: 'deprecated',
    autodiscoveryInstanceName: 'products-v1-prod',
    policies: [
      { id: 13, policyTemplateId: 'client-id-enforcement', groupId: 'com.mulesoft', assetId: 'client-id-enforcement', assetVersion: '1.3.0', configuration: {}, order: 1, disabled: false },
    ],
    slaTiers: [],
    alerts: [],
    contracts: [
      { id: 9, applicationName: 'Legacy Storefront', applicationId: 5008, status: 'APPROVED', tierId: 0, tierName: 'Default', requestedDate: '2024-06-15T08:00:00Z', approvedDate: '2024-06-15T08:30:00Z' },
    ],
  },
];

// ── Status filter options ────────────────────────────────────

type StatusFilter = 'all' | APIStatus;

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Deprecated', value: 'deprecated' },
];

// ── Helpers ──────────────────────────────────────────────────

const statusBadgeColor = (status: APIStatus): string =>
  statusColors[status] ?? '#9E9E9E';

const technologyLabel = (tech: string): string => {
  const map: Record<string, string> = {
    mule4: 'Mule 4',
    mule3: 'Mule 3',
    http: 'HTTP API',
    raml: 'RAML',
  };
  return map[tech] ?? tech;
};

// ── Component ────────────────────────────────────────────────

const APIListScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const theme = useTheme<MD3Theme>();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Filtered data
  const filteredAPIs = useMemo(() => {
    let list = MOCK_APIS;

    if (statusFilter !== 'all') {
      list = list.filter((api) => api.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (api) =>
          api.instanceLabel.toLowerCase().includes(q) ||
          api.assetId.toLowerCase().includes(q) ||
          (api.endpointUri && api.endpointUri.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [searchQuery, statusFilter]);

  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Simulate network refresh
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  // ── Render a single API card ───────────────────────────────

  const renderAPICard = ({ item }: { item: ManagedAPI }) => (
    <Card
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      onPress={() => navigation.navigate('APIDetail', { api: item })}
      mode="elevated"
    >
      <Card.Content>
        {/* Header row: name + status badge */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>
              {item.instanceLabel}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.assetId} : {item.assetVersion}
            </Text>
          </View>
          <Badge
            style={[
              styles.statusBadge,
              { backgroundColor: statusBadgeColor(item.status) },
            ]}
          >
            {item.status.toUpperCase()}
          </Badge>
        </View>

        <Divider style={styles.divider} />

        {/* Endpoint URI */}
        {item.endpointUri && (
          <View style={styles.infoRow}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Endpoint
            </Text>
            <Text variant="bodySmall" numberOfLines={1} selectable>
              {item.endpointUri}
            </Text>
          </View>
        )}

        {/* Technology */}
        <View style={styles.infoRow}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Technology
          </Text>
          <Chip compact textStyle={styles.chipText} style={styles.techChip}>
            {technologyLabel(item.technology)}
          </Chip>
        </View>

        {/* Metrics row */}
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Policies
            </Text>
            <Text variant="titleMedium">{item.policies.length}</Text>
          </View>
          <View style={styles.metric}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Contracts
            </Text>
            <Text variant="titleMedium">{item.contracts.length}</Text>
          </View>
          <View style={styles.metric}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              SLA Tiers
            </Text>
            <Text variant="titleMedium">{item.slaTiers.length}</Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  // ── Main render ────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="API Manager" />
        <Appbar.Action icon="plus" onPress={() => {}} />
      </Appbar.Header>

      {/* Search */}
      <Searchbar
        placeholder="Search APIs..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
        elevation={0}
      />

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.value}
            selected={statusFilter === f.value}
            onPress={() => setStatusFilter(f.value)}
            style={styles.filterChip}
            showSelectedOverlay
          >
            {f.label}
          </Chip>
        ))}
      </View>

      {/* API list */}
      <FlatList
        data={filteredAPIs}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAPICard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton icon="api-off" size={48} />
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              No APIs match your search
            </Text>
          </View>
        }
      />
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    marginRight: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    marginBottom: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  divider: {
    marginVertical: 10,
  },
  infoRow: {
    marginBottom: 6,
  },
  techChip: {
    alignSelf: 'flex-start',
    marginTop: 2,
    height: 28,
  },
  chipText: {
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  metric: {
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
});

export default APIListScreen;
