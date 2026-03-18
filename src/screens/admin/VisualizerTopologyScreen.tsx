import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { useEnvironments } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import * as visualizerService from '../../services/visualizerService';

const VisualizerTopologyScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const currentOrg = useAuthStore((state) => state.currentOrganization);
  const currentEnv = useAuthStore((state) => state.currentEnvironment);
  const { data: environments = [] } = useEnvironments(currentOrg?.id);

  const [selectedEnvIds, setSelectedEnvIds] = useState<string[]>(
    currentEnv?.id ? [currentEnv.id] : [],
  );

  const effectiveEnvIds = selectedEnvIds.length > 0
    ? selectedEnvIds
    : environments.slice(0, 2).map((environment) => environment.id);

  const layersQuery = useQuery({
    queryKey: ['admin-visualizer', 'layers', currentOrg?.id],
    queryFn: () => visualizerService.getLayers(currentOrg!.id),
    enabled: !!currentOrg?.id,
  });

  const viewsQuery = useQuery({
    queryKey: ['admin-visualizer', 'views', currentOrg?.id],
    queryFn: () => visualizerService.getViews(currentOrg!.id),
    enabled: !!currentOrg?.id,
  });

  const appsQuery = useQuery({
    queryKey: ['admin-visualizer', 'apps', currentOrg?.id, effectiveEnvIds],
    queryFn: () => visualizerService.getApplicationsInfo(currentOrg!.id, effectiveEnvIds),
    enabled: !!currentOrg?.id && effectiveEnvIds.length > 0,
  });

  const networkQuery = useQuery({
    queryKey: ['admin-visualizer', 'network', currentOrg?.id, effectiveEnvIds],
    queryFn: () => visualizerService.getApplicationsNetwork(currentOrg!.id, effectiveEnvIds),
    enabled: !!currentOrg?.id && effectiveEnvIds.length > 0,
  });

  const layers = layersQuery.data ?? [];
  const views = viewsQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const edges = networkQuery.data ?? [];
  const highlights = useMemo(
    () => visualizerService.deriveVisualizerHighlights(apps, edges),
    [apps, edges],
  );

  const toggleEnvironment = (envId: string) => {
    setSelectedEnvIds((current) => (
      current.includes(envId)
        ? current.filter((value) => value !== envId)
        : [...current, envId]
    ));
  };

  const topConnections = edges
    .slice()
    .sort((left, right) => (right.requestCount ?? 0) - (left.requestCount ?? 0))
    .slice(0, 8);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Visualizer Topology" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>Application topology</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              HAR-backed network visibility for cross-environment dependencies, layer coverage, and busiest integrations.
            </Text>

            <View style={styles.chipWrap}>
              {environments.map((environment) => {
                const selected = effectiveEnvIds.includes(environment.id);
                return (
                  <Pressable
                    key={environment.id}
                    onPress={() => toggleEnvironment(environment.id)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                        backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}>
                      {environment.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.primary + '12' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{apps.length}</Text>
            <Text style={styles.statLabel}>Applications</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.secondary + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.secondary }]}>{edges.length}</Text>
            <Text style={styles.statLabel}>Connections</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.info + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.info }]}>{layers.length}</Text>
            <Text style={styles.statLabel}>Layers</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: anypointColors.mulePurple + '12' }]}>
            <Text style={[styles.statValue, { color: anypointColors.mulePurple }]}>{views.length}</Text>
            <Text style={styles.statLabel}>Views</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Coverage summary</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Quick read on which layers and protocols are showing up in the selected topology slice.
            </Text>

            <View style={styles.pillWrap}>
              {highlights.layerNames.length > 0 ? highlights.layerNames.map((layer) => (
                <View key={layer} style={[styles.pill, { backgroundColor: anypointColors.info + '12' }]}>
                  <Text style={[styles.pillText, { color: anypointColors.info }]}>{layer}</Text>
                </View>
              )) : <Text style={styles.emptyCopy}>No layer data returned for this selection.</Text>}
            </View>

            <Text variant="titleSmall" style={styles.subSectionTitle}>Observed protocols</Text>
            <View style={styles.pillWrap}>
              {highlights.protocols.length > 0 ? highlights.protocols.map((protocol) => (
                <View key={protocol} style={[styles.pill, { backgroundColor: anypointColors.secondary + '12' }]}>
                  <Text style={[styles.pillText, { color: anypointColors.secondary }]}>{protocol}</Text>
                </View>
              )) : <Text style={styles.emptyCopy}>No protocol labels were returned.</Text>}
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Busiest applications</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Applications with the highest observed connection count inside the network graph.
            </Text>

            {highlights.busiestNodes.length > 0 ? highlights.busiestNodes.map((node) => (
              <View key={node.name} style={[styles.listRow, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + '12' }]}>
                  <Icon name="transit-connection-variant" size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{node.name}</Text>
                  <Text style={styles.rowMeta}>{node.connectionCount} connected flow{node.connectionCount === 1 ? '' : 's'}</Text>
                </View>
              </View>
            )) : <Text style={styles.emptyCopy}>No network activity was returned.</Text>}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Top connections</Text>

            {topConnections.length > 0 ? topConnections.map((edge) => (
              <View key={edge.id} style={[styles.connectionCard, { borderColor: theme.colors.outlineVariant }]}>
                <Text style={styles.rowTitle}>{edge.source} → {edge.target}</Text>
                <Text style={styles.rowMeta}>
                  {edge.protocol ?? edge.connectionType ?? 'Unlabeled'}{edge.requestCount != null ? ` • ${edge.requestCount} requests` : ''}
                </Text>
              </View>
            )) : <Text style={styles.emptyCopy}>No network edges were returned for the selected environments.</Text>}
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 10 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  statLabel: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 12, fontWeight: '700' },
  subSectionTitle: { marginTop: 12, marginBottom: 8, fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  connectionCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default VisualizerTopologyScreen;
