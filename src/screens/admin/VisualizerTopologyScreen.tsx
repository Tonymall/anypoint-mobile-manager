import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { useEnvironments } from '../../hooks/queries';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import * as visualizerService from '../../services/visualizerService';

type GraphNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  status: string | null;
  layerName: string | null;
  connectionCount: number;
  environmentId: string | null;
  inboundCount: number | null;
  outboundCount: number | null;
};

type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  protocol: string | null;
  requestCount: number | null;
};

function getStatusColor(status: string | null): string {
  if (!status) return anypointColors.info;
  if (/started|running|active/i.test(status)) return anypointColors.success;
  if (/deploy|pending|applying/i.test(status)) return anypointColors.warning;
  if (/fail|error|stop/i.test(status)) return anypointColors.error;
  return anypointColors.info;
}

function buildGraph(
  apps: visualizerService.VisualizerAppNode[],
  edges: visualizerService.VisualizerEdge[],
  width: number,
  height: number,
): { nodes: GraphNode[]; graphEdges: GraphEdge[] } {
  const nodeMap = new Map<string, GraphNode>();
  const connectionCounts = new Map<string, number>();

  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
  }

  for (const app of apps) {
    const key = app.id || app.name;
    nodeMap.set(key, {
      id: key,
      name: app.name,
      x: 0,
      y: 0,
      radius: 24,
      color: getStatusColor(app.status),
      status: app.status,
      layerName: app.layerName,
      connectionCount: connectionCounts.get(key) ?? connectionCounts.get(app.name) ?? 0,
      environmentId: app.environmentId,
      inboundCount: app.inboundCount,
      outboundCount: app.outboundCount,
    });
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      nodeMap.set(edge.source, {
        id: edge.source,
        name: edge.source,
        x: 0,
        y: 0,
        radius: 20,
        color: anypointColors.info,
        status: null,
        layerName: null,
        connectionCount: connectionCounts.get(edge.source) ?? 0,
        environmentId: null,
        inboundCount: null,
        outboundCount: null,
      });
    }
    if (!nodeMap.has(edge.target)) {
      nodeMap.set(edge.target, {
        id: edge.target,
        name: edge.target,
        x: 0,
        y: 0,
        radius: 20,
        color: anypointColors.info,
        status: null,
        layerName: null,
        connectionCount: connectionCounts.get(edge.target) ?? 0,
        environmentId: null,
        inboundCount: null,
        outboundCount: null,
      });
    }
  }

  const nodes = Array.from(nodeMap.values())
    .sort((left, right) => right.connectionCount - left.connectionCount || left.name.localeCompare(right.name))
    .slice(0, 14);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const graphEdges = edges
    .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      protocol: edge.protocol ?? edge.connectionType,
      requestCount: edge.requestCount,
    }));

  const centerX = width / 2;
  const centerY = height / 2;
  const innerRadius = Math.max(82, Math.min(width, height) * 0.2);
  const outerRadius = Math.max(130, Math.min(width, height) * 0.34);
  const primaryCount = Math.min(4, nodes.length);

  nodes.forEach((node, index) => {
    const isInner = index < primaryCount;
    const ringIndex = isInner ? index : index - primaryCount;
    const ringCount = isInner ? Math.max(primaryCount, 1) : Math.max(nodes.length - primaryCount, 1);
    const angle = (-Math.PI / 2) + ((Math.PI * 2) / ringCount) * ringIndex;
    const radius = isInner ? innerRadius : outerRadius;
    node.x = centerX + Math.cos(angle) * radius;
    node.y = centerY + Math.sin(angle) * radius;
    node.radius = isInner ? 28 : 22;
  });

  return { nodes, graphEdges };
}

const VisualizerTopologyScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width: windowWidth } = useWindowDimensions();
  const currentOrg = useAuthStore((state) => state.currentOrganization);
  const currentEnv = useAuthStore((state) => state.currentEnvironment);
  const { data: environments = [] } = useEnvironments(currentOrg?.id);

  const [selectedEnvIds, setSelectedEnvIds] = useState<string[]>(
    currentEnv?.id ? [currentEnv.id] : [],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  const graphWidth = Math.max(windowWidth - 32, 720);
  const graphHeight = 420;
  const graph = useMemo(
    () => buildGraph(apps, edges, graphWidth, graphHeight),
    [apps, edges, graphHeight, graphWidth],
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null;
  const topConnections = graph.graphEdges
    .slice()
    .sort((left, right) => (right.requestCount ?? 0) - (left.requestCount ?? 0))
    .slice(0, 8);

  const toggleEnvironment = (envId: string) => {
    setSelectedEnvIds((current) => (
      current.includes(envId)
        ? current.filter((value) => value !== envId)
        : [...current, envId]
    ));
  };

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
              Real dependency graph for the selected environments, backed by the same Visualizer network endpoints captured in the HAR.
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
            <Text variant="titleMedium" style={styles.sectionTitle}>Topology graph</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Tap a node to inspect it. Inner-ring apps are the busiest nodes in the current graph slice.
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={[styles.graphFrame, { width: graphWidth, backgroundColor: theme.colors.background }]}>
                <Svg width={graphWidth} height={graphHeight}>
                  <Rect
                    x={0}
                    y={0}
                    width={graphWidth}
                    height={graphHeight}
                    rx={18}
                    fill={theme.colors.background}
                  />

                  {graph.graphEdges.map((edge) => {
                    const source = graph.nodes.find((node) => node.id === edge.sourceId);
                    const target = graph.nodes.find((node) => node.id === edge.targetId);
                    if (!source || !target) return null;
                    const emphasized = selectedNode && (selectedNode.id === source.id || selectedNode.id === target.id);
                    return (
                      <Line
                        key={edge.id}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={emphasized ? anypointColors.secondary : theme.colors.outline}
                        strokeOpacity={emphasized ? 0.95 : 0.55}
                        strokeWidth={emphasized ? 2.8 : 1.4}
                      />
                    );
                  })}

                  {graph.nodes.map((node) => {
                    const selected = selectedNode?.id === node.id;
                    return (
                      <G key={node.id} onPress={() => setSelectedNodeId(node.id)}>
                        <Circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius + (selected ? 6 : 0)}
                          fill={selected ? node.color + '22' : 'transparent'}
                        />
                        <Circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius}
                          fill={theme.colors.surface}
                          stroke={selected ? node.color : theme.colors.outline}
                          strokeWidth={selected ? 3 : 1.4}
                        />
                        <Circle
                          cx={node.x}
                          cy={node.y - (node.radius - 8)}
                          r={4}
                          fill={node.color}
                        />
                        <SvgText
                          x={node.x}
                          y={node.y + 4}
                          fontSize="10"
                          fontWeight="700"
                          fill={theme.colors.onSurface}
                          textAnchor="middle"
                        >
                          {node.name.length > 10 ? `${node.name.slice(0, 10)}…` : node.name}
                        </SvgText>
                      </G>
                    );
                  })}
                </Svg>
              </View>
            </ScrollView>

            {selectedNode ? (
              <View style={[styles.focusCard, { borderColor: theme.colors.outlineVariant }]}>
                <Text style={styles.rowTitle}>{selectedNode.name}</Text>
                <Text style={styles.rowMeta}>
                  {selectedNode.status ?? 'Unknown status'}{selectedNode.layerName ? ` • ${selectedNode.layerName}` : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  {selectedNode.connectionCount} linked flow{selectedNode.connectionCount === 1 ? '' : 's'}
                  {selectedNode.inboundCount != null ? ` • in ${selectedNode.inboundCount}` : ''}
                  {selectedNode.outboundCount != null ? ` • out ${selectedNode.outboundCount}` : ''}
                </Text>
              </View>
            ) : null}
          </Card.Content>
        </Card>

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
            <Text variant="titleMedium" style={styles.sectionTitle}>Top connections</Text>

            {topConnections.length > 0 ? topConnections.map((edge) => (
              <View key={edge.id} style={[styles.connectionCard, { borderColor: theme.colors.outlineVariant }]}>
                <Text style={styles.rowTitle}>{edge.sourceId} → {edge.targetId}</Text>
                <Text style={styles.rowMeta}>
                  {edge.protocol ?? 'Unlabeled'}{edge.requestCount != null ? ` • ${edge.requestCount} requests` : ''}
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
  graphFrame: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  focusCard: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 12, fontWeight: '700' },
  subSectionTitle: { marginTop: 12, marginBottom: 8, fontWeight: '700' },
  rowTitle: { color: theme.colors.onSurface, fontSize: 14, fontWeight: '600' },
  rowMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  connectionCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 10 },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default VisualizerTopologyScreen;
