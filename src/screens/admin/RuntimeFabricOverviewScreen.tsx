import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import * as runtimeFabricService from '../../services/runtimeFabricService';

const RuntimeFabricOverviewScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isFocused = useIsFocused();
  const currentOrg = useAuthStore((state) => state.currentOrganization);

  const fabricsQuery = useQuery({
    queryKey: ['admin-runtime-fabric', 'fabrics', currentOrg?.id],
    queryFn: () => runtimeFabricService.getFabrics(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const spacesQuery = useQuery({
    queryKey: ['admin-runtime-fabric', 'spaces', currentOrg?.id],
    queryFn: () => runtimeFabricService.getPrivateSpaces(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const statusesQuery = useQuery({
    queryKey: ['admin-runtime-fabric', 'statuses', currentOrg?.id],
    queryFn: () => runtimeFabricService.getPrivateSpaceStatuses(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const windowsQuery = useQuery({
    queryKey: ['admin-runtime-fabric', 'patch', currentOrg?.id],
    queryFn: () => runtimeFabricService.getPrivateSpacePatchWindows(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const targetsQuery = useQuery({
    queryKey: ['admin-runtime-fabric', 'targets', currentOrg?.id],
    queryFn: () => runtimeFabricService.getTargets(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });
  const usageQuery = useQuery({
    queryKey: ['admin-runtime-fabric', 'usage', currentOrg?.id],
    queryFn: () => runtimeFabricService.getPrivateSpaceUsage(currentOrg!.id),
    enabled: !!currentOrg?.id && isFocused,
  });

  const fabrics = fabricsQuery.data ?? [];
  const spaces = (spacesQuery.data ?? []).map((space) => ({
    ...space,
    status: statusesQuery.data?.[space.id] ?? space.status,
  }));
  const targets = targetsQuery.data ?? [];
  const patchWindows = windowsQuery.data ?? [];
  const usage = usageQuery.data;

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Runtime Fabric" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>Private spaces and fabrics</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Runtime Fabric visibility from the same control plane flows the Anypoint web app uses for private spaces, targets, patch windows, and capacity.
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{fabrics.length}</Text>
            <Text style={styles.statLabel}>Fabrics</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.mulePurple + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.mulePurple }]}>{spaces.length}</Text>
            <Text style={styles.statLabel}>Private spaces</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.secondary }]}>{targets.length}</Text>
            <Text style={styles.statLabel}>Targets</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.success + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.success }]}>{usage?.currentUsage ?? '—'}</Text>
            <Text style={styles.statLabel}>Usage {usage?.unit ? `(${usage.unit})` : ''}</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Private spaces</Text>
            {spaces.length > 0 ? spaces.map((space) => (
              <View key={space.id} style={[styles.resourceCard, { borderColor: theme.colors.outlineVariant }]}>
                <View style={styles.resourceHeader}>
                  <View style={[styles.iconWrap, { backgroundColor: anypointColors.mulePurple + '12' }]}>
                    <Icon name="cloud-lock-outline" size={18} color={anypointColors.mulePurple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{space.name}</Text>
                    <Text style={styles.rowMeta}>
                      {space.region ?? 'Unknown region'}{space.currentVersion ? ` • ${space.currentVersion}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.statusText}>{space.status ?? 'Unknown'}</Text>
                </View>
              </View>
            )) : <Text style={styles.emptyCopy}>No private spaces were returned for this organization.</Text>}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Fabrics and targets</Text>
            {fabrics.length > 0 ? fabrics.map((fabric) => (
              <View key={fabric.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '12' }]}>
                  <Icon name="kubernetes" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{fabric.name}</Text>
                  <Text style={styles.rowMeta}>
                    {fabric.region ?? 'Unknown region'}{fabric.targetCount != null ? ` • ${fabric.targetCount} targets` : ''}
                  </Text>
                </View>
                <Text style={styles.statusText}>{fabric.status ?? 'Unknown'}</Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No Runtime Fabric control plane objects were returned.</Text>}

            <Text variant="titleSmall" style={styles.subSectionTitle}>Deployment targets</Text>
            {targets.length > 0 ? targets.slice(0, 8).map((target) => (
              <View key={target.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <Text style={styles.rowTitle}>{target.name}</Text>
                <Text style={styles.rowMeta}>{target.type ?? 'Target'}{target.provider ? ` • ${target.provider}` : ''}</Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No targets were returned.</Text>}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Patch windows</Text>
            {patchWindows.length > 0 ? patchWindows.map((window) => (
              <View key={window.id} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: anypointColors.warning + '12' }]}>
                  <Icon name="calendar-clock-outline" size={18} color={anypointColors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{window.name}</Text>
                  <Text style={styles.rowMeta}>{window.cron ?? 'No schedule'}{window.timezone ? ` • ${window.timezone}` : ''}</Text>
                </View>
              </View>
            )) : <Text style={styles.emptyCopy}>No monthly patch windows were returned.</Text>}
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
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  statusText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  subSectionTitle: { marginTop: 12, marginBottom: 8, fontWeight: '700' },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default RuntimeFabricOverviewScreen;
