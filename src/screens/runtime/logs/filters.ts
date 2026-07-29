// ═══════════════════════════════════════════════════════════════════
// Logs — filter vocabulary
// ═══════════════════════════════════════════════════════════════════
// The level and time-range options, plus the mapping from a log
// priority to a design-token status role. Shared by the control bar,
// the filter sheet and the list rows so a level is coloured the same
// way wherever it appears.
// ═══════════════════════════════════════════════════════════════════

import type { StatusRole, Tokens } from '../../../theme';

// ── Time range ──────────────────────────────────────────────────────

export interface DateRange {
  label: string;
  ms: number;
}

/** Ordered smallest to largest. Index 0 is the default — latest logs. */
export const DATE_RANGES: DateRange[] = [
  { label: '1h', ms: 3_600_000 },
  { label: '4h', ms: 14_400_000 },
  { label: '12h', ms: 43_200_000 },
  { label: '24h', ms: 86_400_000 },
  { label: '3d', ms: 259_200_000 },
  { label: '7d', ms: 604_800_000 },
];

export const DEFAULT_RANGE_INDEX = 0;

// ── Level ───────────────────────────────────────────────────────────

export const LOG_LEVELS = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LEVEL: LogLevel = 'ALL';

/**
 * A log priority as a status role. Priorities that never appear in the
 * filter chips (FATAL, TRACE, SYSTEM) still resolve, because the list
 * rows colour whatever the runtime actually sent.
 */
export function priorityRole(t: Tokens, priority: string): StatusRole {
  switch (priority.toUpperCase()) {
    case 'FATAL':
    case 'ERROR':
      return t.color.status.danger;
    case 'WARN':
    case 'WARNING':
      return t.color.status.warning;
    case 'INFO':
      return t.color.status.info;
    case 'SYSTEM':
      return t.color.accent.tertiary;
    case 'DEBUG':
    case 'TRACE':
    default:
      return t.color.status.neutral;
  }
}

/** The chip colour for a level filter. 'ALL' is brand, not a status. */
export function levelRole(t: Tokens, level: string): StatusRole {
  return level === 'ALL' ? t.color.accent.brand : priorityRole(t, level);
}

/** An audit action as a status role, keyed off the verb in its name. */
export function auditActionRole(t: Tokens, action: string): StatusRole {
  const name = action.toLowerCase();
  if (name.includes('delete') || name.includes('stop')) {
    return t.color.status.danger;
  }
  if (
    name.includes('create') ||
    name.includes('deploy') ||
    name.includes('start')
  ) {
    return t.color.status.success;
  }
  if (
    name.includes('update') ||
    name.includes('modify') ||
    name.includes('restart')
  ) {
    return t.color.status.warning;
  }
  return t.color.status.neutral;
}
