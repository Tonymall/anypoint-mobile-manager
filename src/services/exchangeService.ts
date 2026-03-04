// ============================================================
// Anypoint Mobile Platform - Exchange Service
// ============================================================

import api from './api';
import type {
  ExchangeAsset,
  AssetType,
  PaginatedResponse,
} from '../types';

const EXCHANGE_BASE = '/exchange/api/v2';

// ---------- Search ----------

/**
 * Search for assets in Anypoint Exchange.
 */
export async function searchAssets(params?: {
  search?: string;
  types?: AssetType[];
  organizationId?: string;
  offset?: number;
  limit?: number;
  sort?: string;
  domain?: string;
}): Promise<PaginatedResponse<ExchangeAsset>> {
  const { data } = await api.get<PaginatedResponse<ExchangeAsset>>(
    `${EXCHANGE_BASE}/assets`,
    {
      params: {
        ...params,
        types: params?.types?.join(','),
      },
    },
  );
  return data;
}

// ---------- Asset Details ----------

/**
 * Get full details for a specific asset by groupId, assetId, and version.
 */
export async function getAsset(
  groupId: string,
  assetId: string,
  version: string,
): Promise<ExchangeAsset> {
  const { data } = await api.get<ExchangeAsset>(
    `${EXCHANGE_BASE}/assets/${groupId}/${assetId}/${version}`,
  );
  return data;
}

/**
 * Get all published versions of an asset.
 */
export async function getAssetVersions(
  groupId: string,
  assetId: string,
): Promise<Array<{ version: string; status: string; createdAt: string }>> {
  const { data } = await api.get<
    Array<{ version: string; status: string; createdAt: string }>
  >(`${EXCHANGE_BASE}/assets/${groupId}/${assetId}`);
  return data;
}

// ---------- Download ----------

/**
 * Download an asset file by classifier and packaging type.
 * Returns the download URL or binary data depending on the asset.
 */
export async function downloadAsset(
  groupId: string,
  assetId: string,
  version: string,
  classifier: string,
  packaging: string,
): Promise<string> {
  const { data } = await api.get<string>(
    `${EXCHANGE_BASE}/assets/${groupId}/${assetId}/${version}/files/${classifier}.${packaging}`,
    { responseType: 'text' },
  );
  return data;
}

// ---------- Publish ----------

/**
 * Publish a new asset to Exchange.
 */
export async function publishAsset(
  organizationId: string,
  asset: {
    groupId: string;
    assetId: string;
    version: string;
    name: string;
    description?: string;
    type: AssetType;
    properties?: Record<string, string>;
    tags?: string[];
  },
): Promise<ExchangeAsset> {
  const { data } = await api.post<ExchangeAsset>(
    `${EXCHANGE_BASE}/organizations/${organizationId}/assets`,
    asset,
  );
  return data;
}

// ---------- Access Requests ----------

/**
 * Request access to an Exchange asset (typically for API consumers).
 */
export async function requestAccess(
  organizationId: string,
  params: {
    apiId: number;
    environmentId: string;
    instanceType: string;
    requestedTierId?: number;
  },
): Promise<{ id: number; status: string }> {
  const { data } = await api.post<{ id: number; status: string }>(
    `${EXCHANGE_BASE}/organizations/${organizationId}/applications/accessRequests`,
    params,
  );
  return data;
}
