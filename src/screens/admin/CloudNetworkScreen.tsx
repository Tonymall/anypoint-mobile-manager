import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useRouter, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import * as cloudHubInfraService from '../../services/cloudHubInfraService';

const CloudNetworkScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isFocused = useIsFocused();
  const currentOrg = useAuthStore((state) => state.currentOrganization);

  const vpcsQuery = useQuery({
    queryKey: ['admin-cloud-network', 'vpcs', currentOrg?.id],
    queryFn: () => cloudHubInfraService.getVpcs(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const loadBalancersQuery = useQuery({
    queryKey: ['admin-cloud-network', 'load-balancers', currentOrg?.id],
    queryFn: () => cloudHubInfraService.getLoadBalancers(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const gatewaysQuery = useQuery({
    queryKey: ['admin-cloud-network', 'tgws', currentOrg?.id],
    queryFn: () => cloudHubInfraService.getTransitGateways(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const legacyQuery = useQuery({
    queryKey: ['admin-cloud-network', 'legacy-ipsec', currentOrg?.id],
    queryFn: () => cloudHubInfraService.getLegacyIpSecTunnels(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });

  const vpcs = vpcsQuery.data ?? [];
  const ipsecQueries = useQueries({
    queries: vpcs.map((vpc) => ({
      queryKey: ['admin-cloud-network', 'vpc-ipsec', currentOrg?.id, vpc.id],
      queryFn: () => cloudHubInfraService.getVpcIpSecTunnels(currentOrg!.id, vpc.id),
      enabled: !!currentOrg?.id && isFocused,
    })),
  });

  const vpcTunnelMap = new Map(
    vpcs.map((vpc, index) => [vpc.id, ipsecQueries[index]?.data ?? []] as const),
  );
  const tunnelCount = Array.from(vpcTunnelMap.values()).reduce((sum, tunnels) => sum + tunnels.length, 0)
    + (legacyQuery.data?.length ?? 0);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Cloud Networking" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>CloudHub network estate</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              VPCs, transit gateways, IPsec connectivity, and load balancers brought into the mobile admin surface.
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{vpcs.length}</Text>
            <Text style={styles.statLabel}>VPCs</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.secondary }]}>{loadBalancersQuery.data?.length ?? 0}</Text>
            <Text style={styles.statLabel}>Load balancers</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.warning + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.warning }]}>{gatewaysQuery.data?.length ?? 0}</Text>
            <Text style={styles.statLabel}>Transit gateways</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.success + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.success }]}>{tunnelCount}</Text>
            <Text style={styles.statLabel}>IPsec tunnels</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>VPC inventory</Text>
            {vpcs.length > 0 ? vpcs.map((vpc) => {
              const tunnels = vpcTunnelMap.get(vpc.id) ?? [];
              return (
                <View key={vpc.id} style={[styles.resourceCard, { borderColor: theme.colors.outlineVariant }]}>
                  <View style={styles.resourceHeader}>
                    <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '12' }]}>
                      <Icon name="cloud-outline" size={18} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{vpc.name}</Text>
                      <Text style={styles.rowMeta}>
                        {vpc.region ?? 'Unknown region'}{vpc.cidr ? ` • ${vpc.cidr}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.statusText}>{vpc.status ?? 'Unknown'}</Text>
                  </View>
                  <Text style={styles.inlineMeta}>{tunnels.length} IPsec tunnel{tunnels.length === 1 ? '' : 's'}</Text>
                </View>
              );
            }) : <Text style={styles.emptyCopy}>No VPCs were returned for this organization.</Text>}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Edge and connectivity services</Text>

            {(loadBalancersQuery.data ?? []).length > 0 ? (loadBalancersQuery.data ?? []).map((lb) => (
              <View key={lb.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: anypointColors.secondary + '12' }]}>
                  <Icon name="swap-horizontal-bold" size={18} color={anypointColors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{lb.name}</Text>
                  <Text style={styles.rowMeta}>{lb.region ?? 'Unknown region'}{lb.instanceCount != null ? ` • ${lb.instanceCount} instances` : ''}</Text>
                </View>
                <Text style={styles.statusText}>{lb.status ?? 'Unknown'}</Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No load balancers were returned.</Text>}

            <Text variant="titleSmall" style={styles.subSectionTitle}>Transit gateways</Text>
            {(gatewaysQuery.data ?? []).length > 0 ? (gatewaysQuery.data ?? []).map((gateway) => (
              <View key={gateway.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <Text style={styles.rowTitle}>{gateway.name}</Text>
                <Text style={styles.rowMeta}>{gateway.region ?? 'Unknown region'} • {gateway.status ?? 'Unknown'}</Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No transit gateways were returned.</Text>}

            <Text variant="titleSmall" style={styles.subSectionTitle}>Legacy tunnels</Text>
            {(legacyQuery.data ?? []).length > 0 ? (legacyQuery.data ?? []).map((tunnel) => (
              <View key={tunnel.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <Text style={styles.rowTitle}>{tunnel.name}</Text>
                <Text style={styles.rowMeta}>{tunnel.remoteAddress ?? 'Unknown remote'} • {tunnel.status ?? 'Unknown'}</Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No legacy IPsec tunnels were returned.</Text>}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { color: theme.colors.onSurfaceVariant, marginBottom: 10, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 10 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  statLabel: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  resourceCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  resourceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  statusText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  inlineMeta: { marginTop: 10, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subSectionTitle: { marginTop: 12, marginBottom: 8, fontWeight: '700' },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default CloudNetworkScreen;
