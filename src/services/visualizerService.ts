import api from './api';
import {
  findNestedArray,
  findNestedValue,
  toNumber,
  toStringValue,
  uniqueStrings,
  unwrapCollection,
  withOptionalFallback,
} from './controlPlaneCommon';

const VISUALIZER_V4_BASE = '/visualizer/api/v4';

export interface VisualizerLayer {
  id: string;
  name: string;
  type: string;
  applicationCount: number | null;
  viewCount: number | null;
}

export interface VisualizerView {
  id: string;
  name: string;
  layerId: string | null;
  applicationCount: number | null;
  lastUpdated: string | null;
}

export interface VisualizerAppNode {
  id: string;
  name: string;
  status: string | null;
  layerName: string | null;
  environmentId: string | null;
  inboundCount: number | null;
  outboundCount: number | null;
}

export interface VisualizerEdge {
  id: string;
  source: string;
  target: string;
  sourceLabel?: string | null;
  targetLabel?: string | null;
  connectionType: string | null;
  protocol: string | null;
  requestCount: number | null;
}

function asRecord(value: unknown): Record<string, any> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}

function normalizeLayer(raw: unknown): VisualizerLayer {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.layerId) ?? toStringValue(item.name) ?? `layer-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.label) ?? 'Unnamed layer',
    type: toStringValue(item.type) ?? toStringValue(item.layerType) ?? 'layer',
    applicationCount: toNumber(item.applicationCount) ?? toNumber(item.applicationsCount) ?? toNumber(item.nodesCount),
    viewCount: toNumber(item.viewCount) ?? toNumber(item.viewsCount),
  };
}

function normalizeView(raw: unknown): VisualizerView {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.viewId) ?? toStringValue(item.name) ?? `view-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.label) ?? 'Unnamed view',
    layerId: toStringValue(item.layerId) ?? toStringValue(item.layer?.id),
    applicationCount: toNumber(item.applicationCount) ?? toNumber(item.appCount) ?? toNumber(item.nodesCount),
    lastUpdated: toStringValue(item.updatedAt) ?? toStringValue(item.lastModifiedDate) ?? toStringValue(item.createdAt),
  };
}

function normalizeNode(raw: unknown): VisualizerAppNode {
  const item = asRecord(raw);
  const name = toStringValue(item.name)
    ?? toStringValue(item.applicationName)
    ?? toStringValue(item.displayName)
    ?? toStringValue(item.assetName)
    ?? toStringValue(item.label)
    ?? 'Unknown app';
  return {
    id: toStringValue(item.id) ?? toStringValue(item.applicationId) ?? name,
    name,
    status: toStringValue(item.status),
    layerName: toStringValue(item.layerName) ?? toStringValue(item.layer?.name),
    environmentId: toStringValue(item.environmentId) ?? toStringValue(item.environment?.id),
    inboundCount: toNumber(item.inboundCount) ?? toNumber(item.inbound) ?? toNumber(item.incomingConnections),
    outboundCount: toNumber(item.outboundCount) ?? toNumber(item.outbound) ?? toNumber(item.outgoingConnections),
  };
}

function normalizeEdge(raw: unknown): VisualizerEdge {
  const item = asRecord(raw);
  const source = toStringValue(item.source)
    ?? toStringValue(item.sourceId)
    ?? toStringValue(item.from)
    ?? toStringValue(item.origin)
    ?? 'Unknown source';
  const target = toStringValue(item.target)
    ?? toStringValue(item.targetId)
    ?? toStringValue(item.to)
    ?? toStringValue(item.destination)
    ?? 'Unknown target';
  return {
    id: toStringValue(item.id) ?? `${source}->${target}`,
    source,
    target,
    sourceLabel: toStringValue(item.sourceName)
      ?? toStringValue(item.sourceApplicationName)
      ?? toStringValue(item.sourceDisplayName)
      ?? toStringValue(item.sourceLabel)
      ?? toStringValue(item.originName),
    targetLabel: toStringValue(item.targetName)
      ?? toStringValue(item.targetApplicationName)
      ?? toStringValue(item.targetDisplayName)
      ?? toStringValue(item.targetLabel)
      ?? toStringValue(item.destinationName),
    connectionType: toStringValue(item.connectionType) ?? toStringValue(item.type),
    protocol: toStringValue(item.protocol) ?? toStringValue(item.transport),
    requestCount: toNumber(item.requestCount) ?? toNumber(item.calls) ?? toNumber(item.volume),
  };
}

export async function getLayers(organizationId: string): Promise<VisualizerLayer[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${VISUALIZER_V4_BASE}/organizations/${organizationId}/layers`);
    return unwrapCollection(data, ['layers']).map(normalizeLayer);
  }, []);
}

export async function getViews(organizationId: string): Promise<VisualizerView[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${VISUALIZER_V4_BASE}/organizations/${organizationId}/views`);
    return unwrapCollection(data, ['views']).map(normalizeView);
  }, []);
}

function buildSelectionPayload(organizationId: string, environmentIds: string[]) {
  return {
    selectedEnvIdsByOrgId: {
      [organizationId]: environmentIds,
    },
  };
}

export async function getApplicationsInfo(
  organizationId: string,
  environmentIds: string[],
): Promise<VisualizerAppNode[]> {
  if (environmentIds.length === 0) return [];
  return withOptionalFallback(async () => {
    const { data } = await api.post(
      `${VISUALIZER_V4_BASE}/organizations/${organizationId}/applications-info`,
      buildSelectionPayload(organizationId, environmentIds),
    );
    const items = findNestedArray(data, ['applications', 'nodes', 'items', 'data', 'results']);
    return items.map(normalizeNode);
  }, []);
}

export async function getApplicationsNetwork(
  organizationId: string,
  environmentIds: string[],
): Promise<VisualizerEdge[]> {
  if (environmentIds.length === 0) return [];
  return withOptionalFallback(async () => {
    const { data } = await api.post(
      `${VISUALIZER_V4_BASE}/organizations/${organizationId}/applications-network`,
      buildSelectionPayload(organizationId, environmentIds),
    );
    const items = findNestedArray(data, ['edges', 'links', 'connections', 'data', 'results']);
    return items.map(normalizeEdge);
  }, []);
}

export function deriveVisualizerHighlights(
  nodes: VisualizerAppNode[],
  edges: VisualizerEdge[],
): {
  layerNames: string[];
  environmentIds: string[];
  busiestNodes: Array<{ name: string; connectionCount: number }>;
  protocols: string[];
} {
  const connectionCounts = new Map<string, number>();
  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
  }

  return {
    layerNames: uniqueStrings(nodes.map((node) => node.layerName)),
    environmentIds: uniqueStrings(nodes.map((node) => node.environmentId)),
    busiestNodes: Array.from(connectionCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([id, connectionCount]) => ({
        name: nodes.find((node) => node.id === id)?.name ?? id,
        connectionCount,
      })),
    protocols: uniqueStrings(edges.map((edge) => edge.protocol ?? edge.connectionType)),
  };
}
