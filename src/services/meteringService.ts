import api from './api';
import { toNumber, toStringValue, unwrapCollection } from './controlPlaneCommon';

const METERING_BASE = '/metering/usage/api/v1';

export interface MeterDimension {
  name: string;
  label: string | null;
  description: string | null;
}

export interface MeterMeasurement {
  name: string;
  label: string | null;
  description: string | null;
}

export interface MeterDescriptor {
  name: string;
  description: string;
  productName: string | null;
  productLabel: string | null;
  meterType: string | null;
  dimensions: MeterDimension[];
  measurements: MeterMeasurement[];
  supportedTimeSeries: string[];
}

export interface UsageSearchMetadata {
  responseAsOf: string | null;
  lastUpdatedAt: string | null;
}

export interface UsageSearchResult {
  metadata: UsageSearchMetadata;
  data: Array<Record<string, unknown>>;
}

export interface UsageReportCategory {
  id: string;
  title: string;
  summaryMetric: string;
  summaryUnit: string;
  detailColumns: string[];
  aggregateQuery: string;
  detailQuery: string;
}

export interface UsageReportSection {
  category: UsageReportCategory;
  aggregate: UsageSearchResult;
  detail: UsageSearchResult;
}

const USAGE_REPORT_CATEGORIES: UsageReportCategory[] = [
  {
    id: 'runtime-messages',
    title: 'Runtime Messages',
    summaryMetric: 'mule_message_count',
    summaryUnit: 'messages',
    detailColumns: ['app_name', 'env_name', 'org_name', 'deployment_model', 'mule_message_count'],
    aggregateQuery: "SELECT mule_message_count FROM runtime_mule_message_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT mule_message_count, org_id, org_name, asset_id, deployment_model, env_id, env_name, env_type, app_name, target_name, target_type, target_id, asset_sideloaded FROM runtime_mule_message_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'runtime-network',
    title: 'Runtime Network',
    summaryMetric: 'network_bytes_count',
    summaryUnit: 'GB',
    detailColumns: ['app_name', 'env_name', 'org_name', 'deployment_model', 'network_bytes_count'],
    aggregateQuery: "SELECT DIV(network_bytes_count, 1000000000) FROM runtime_network_bytes_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT DIV(network_bytes_count, 1000000000), org_id, org_name, asset_id, deployment_model, env_id, env_name, env_type, app_name FROM runtime_network_bytes_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'runtime-flows',
    title: 'Runtime Flows',
    summaryMetric: 'mule_flow_count',
    summaryUnit: 'flows',
    detailColumns: ['app_name', 'env_name', 'org_name', 'num_workers', 'mule_flow_count'],
    aggregateQuery: "SELECT mule_flow_count, max_concurrent_time FROM runtime_flow_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT mule_flow_count, num_workers, org_id, org_name, asset_id, deployment_model, env_id, env_name, env_type, app_name, target_name, target_type, target_id, asset_sideloaded FROM runtime_flow_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'api-manager',
    title: 'API Manager',
    summaryMetric: 'managed_api_count',
    summaryUnit: 'managed APIs',
    detailColumns: ['org_name', 'env_type', 'runtime', 'managed_api_count'],
    aggregateQuery: "SELECT managed_api_count, max_concurrent_time FROM api_manager_api_instance_count_prod WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT managed_api_count, org_id, org_name, env_type, runtime FROM api_manager_api_instance_count_prod WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'governance',
    title: 'Governed APIs',
    summaryMetric: 'governed_api_count',
    summaryUnit: 'governed APIs',
    detailColumns: ['org_name', 'governed_api_count'],
    aggregateQuery: "SELECT max_concurrent_time, governed_api_count FROM governed_api_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT governed_api_count, org_id, org_name FROM governed_api_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'api-contracts',
    title: 'Approved API Contracts',
    summaryMetric: 'approved_contract_count',
    summaryUnit: 'contracts',
    detailColumns: ['portal_name', 'target_org_id', 'approved_contract_count'],
    aggregateQuery: "SELECT approved_contract_count FROM acm_aeh_approved_contracts_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT approved_contract_count, target_org_id, portal_name FROM acm_aeh_approved_contracts_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'mq-requests',
    title: 'Anypoint MQ API Requests',
    summaryMetric: 'api_requests',
    summaryUnit: 'requests',
    detailColumns: ['object_name', 'env_name', 'org_name', 'object_type', 'api_requests'],
    aggregateQuery: "SELECT api_requests FROM anypoint_mq_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT api_requests, region_id, env_id, env_name, object_name, org_id, org_name, object_type FROM anypoint_mq_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'mq-message-units',
    title: 'Anypoint MQ Message Units',
    summaryMetric: 'message_units',
    summaryUnit: 'message units',
    detailColumns: ['object_name', 'env_name', 'org_name', 'object_type', 'message_units'],
    aggregateQuery: "SELECT message_units FROM anypoint_mq_message_units_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT message_units, region_id, env_id, env_name, object_name, org_id, org_name, object_type FROM anypoint_mq_message_units_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
  {
    id: 'object-store',
    title: 'Object Store Effective Requests',
    summaryMetric: 'effective_api_requests',
    summaryUnit: 'requests',
    detailColumns: ['store_id', 'env_name', 'org_name', 'region_id', 'effective_api_requests'],
    aggregateQuery: "SELECT effective_api_requests FROM object_store_effective_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
    detailQuery:
      "SELECT effective_api_requests, env_id, env_name, org_id, org_name, store_id, region_id FROM object_store_effective_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES P1M",
  },
];

function fillQueryTemplate(query: string, from: number, to: number): string {
  return query.replaceAll('$FROM', String(from)).replaceAll('$TO', String(to));
}

export function getUsageReportCategories(): UsageReportCategory[] {
  return USAGE_REPORT_CATEGORIES;
}

export async function getMeterDescriptors(): Promise<MeterDescriptor[]> {
  const { data } = await api.get(`${METERING_BASE}/meters:describe`);
  return unwrapCollection<any>(data).map((entry) => ({
    name: toStringValue(entry.name) ?? 'meter',
    description: toStringValue(entry.description) ?? '',
    productName: toStringValue(entry.productName),
    productLabel: toStringValue(entry.productLabel),
    meterType: toStringValue(entry.meterType),
    dimensions: unwrapCollection<any>(entry.dimensions).map((dimension) => ({
      name: toStringValue(dimension.name) ?? 'dimension',
      label: toStringValue(dimension.label),
      description: toStringValue(dimension.description),
    })),
    measurements: unwrapCollection<any>(entry.measurements).map((measurement) => ({
      name: toStringValue(measurement.name) ?? 'measurement',
      label: toStringValue(measurement.label),
      description: toStringValue(measurement.description),
    })),
    supportedTimeSeries: Array.isArray(entry.supportedTimeSeries)
      ? entry.supportedTimeSeries.map((value: unknown) => String(value))
      : [],
  }));
}

export async function searchUsage(query: string): Promise<UsageSearchResult> {
  const { data } = await api.post(`${METERING_BASE}/meters:search`, { query });
  return {
    metadata: {
      responseAsOf: toStringValue((data as any)?.metadata?.responseAsOf),
      lastUpdatedAt: toStringValue((data as any)?.metadata?.lastUpdatedAt),
    },
    data: unwrapCollection<Record<string, unknown>>(data, ['data']),
  };
}

export async function getUsageReportBundle(
  from: number,
  to: number,
): Promise<UsageReportSection[]> {
  const bundles = await Promise.all(
    USAGE_REPORT_CATEGORIES.map(async (category) => {
      const aggregateQuery = fillQueryTemplate(category.aggregateQuery, from, to);
      const detailQuery = fillQueryTemplate(category.detailQuery, from, to);
      const [aggregate, detail] = await Promise.all([
        searchUsage(aggregateQuery),
        searchUsage(detailQuery),
      ]);
      return {
        category,
        aggregate,
        detail,
      };
    }),
  );

  return bundles;
}

export function findPrimaryMetric(
  row: Record<string, unknown>,
  preferredKey: string,
): number | null {
  if (preferredKey in row) {
    return toNumber(row[preferredKey]);
  }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'timestamp') continue;
    const numeric = toNumber(value);
    if (numeric != null) return numeric;
  }
  return null;
}
