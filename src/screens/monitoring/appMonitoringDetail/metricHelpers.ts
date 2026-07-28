// ============================================================
// App Monitoring Detail - metric helpers
// Pure functions to extract values from CloudHub time-series maps.
// ============================================================

export function extractNumericValue(val: any, fallback: number = 0): number {
  if (val == null) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.length === 0) return fallback;
    const sorted = keys.sort((a, b) => Number(b) - Number(a));
    const latest = val[sorted[0]];
    return typeof latest === 'number' ? latest : fallback;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

export function extractOptionalNumericValue(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.length === 0) return null;
    const sorted = keys.sort((a, b) => Number(b) - Number(a));
    const latest = val[sorted[0]];
    return typeof latest === 'number' && Number.isFinite(latest) ? latest : null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

export function flattenWorkerStats(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const metricKeys = ['cpu', 'cpuPercentageUsed', 'memoryTotalUsed', 'memoryPercentageUsed', 'memoryTotalMax', 'threadCount'];
  const hasDirectMetric = metricKeys.some((k) => k in raw);
  if (hasDirectMetric) return raw;
  const values = Object.values(raw);
  if (values.length > 0 && values[0] && typeof values[0] === 'object') {
    return values[0] as Record<string, any>;
  }
  return raw;
}

export function parseConfiguredMemoryToMB(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([\d.]+)\s*([A-Za-z]+)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] ?? 'MB').toUpperCase();
  if (unit === 'GB' || unit === 'GIB') return Math.round(amount * 1024);
  if (unit === 'MB' || unit === 'MIB') return Math.round(amount);
  if (unit === 'KB' || unit === 'KIB') return Math.round(amount / 1024);
  return Math.round(amount);
}
