// ============================================================
// Anypoint Mobile Platform - Control Plane Region Configuration
// ============================================================

import type { ControlPlaneRegion, ControlPlaneRegionId } from '../types';

export const CONTROL_PLANE_REGIONS: ControlPlaneRegion[] = [
  {
    id: 'us',
    label: 'US',
    url: 'https://anypoint.mulesoft.com',
    notes: 'Default / US control plane',
  },
  {
    id: 'eu1',
    label: 'EU',
    url: 'https://eu1.anypoint.mulesoft.com',
    notes: 'European data residency (Frankfurt region)',
  },
  {
    id: 'ca1',
    label: 'CA',
    url: 'https://ca1.anypoint.mulesoft.com',
    notes: 'Canada control plane',
  },
  {
    id: 'jp1',
    label: 'JP',
    url: 'https://jp1.anypoint.mulesoft.com',
    notes: 'Japan control plane',
  },
];

export const DEFAULT_REGION_ID: ControlPlaneRegionId = 'us';

export function getRegionById(id: ControlPlaneRegionId): ControlPlaneRegion {
  return CONTROL_PLANE_REGIONS.find((r) => r.id === id) ?? CONTROL_PLANE_REGIONS[0];
}

export function getRegionUrl(id: ControlPlaneRegionId): string {
  return getRegionById(id).url;
}
