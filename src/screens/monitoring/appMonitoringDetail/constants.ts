// ============================================================
// App Monitoring Detail - shared constants
// Tab definitions and date range presets.
// ============================================================

export const CONTENT_MAX_WIDTH = 768;

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export type TabId = 'overview' | 'inbound' | 'outbound' | 'jvm' | 'infrastructure';

export interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

export const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: 'view-dashboard-outline' },
  { id: 'inbound', label: 'Inbound', icon: 'arrow-down-bold' },
  { id: 'outbound', label: 'Outbound', icon: 'arrow-up-bold' },
  { id: 'jvm', label: 'JVM', icon: 'coffee' },
  { id: 'infrastructure', label: 'Infra', icon: 'server' },
];

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------

export interface DateRange {
  label: string;
  hours: number;
}

export const DATE_RANGES: DateRange[] = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
];
