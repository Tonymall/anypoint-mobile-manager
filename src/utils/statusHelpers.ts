// ============================================================
// Shared Status Helpers
// Centralized status color, label, and formatting utilities
// used across all screens (runtime, monitoring, dashboard).
// ============================================================

import { statusColors } from '../theme';

/** Transitional statuses — the app is mid-lifecycle change. */
export const TRANSITIONAL_STATUSES = [
  'DEPLOYING', 'UNDEPLOYING', 'UPDATING', 'STARTING', 'STOPPING', 'DEPLOY_FAILED',
];

export const isTransitional = (status: string): boolean =>
  TRANSITIONAL_STATUSES.includes(status);

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'STARTED': return statusColors.started;
    case 'STOPPED': return statusColors.stopped;
    case 'FAILED':
    case 'DEPLOY_FAILED': return statusColors.failed;
    case 'DEPLOYING':
    case 'UNDEPLOYING':
    case 'UPDATING':
    case 'STARTING':
    case 'STOPPING': return statusColors.deploying;
    case 'PARTIALLY_STARTED': return statusColors.pending;
    case 'UNDEPLOYED': return statusColors.stopped;
    default: return statusColors.stopped;
  }
};

export const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'STARTED': return 'Running';
    case 'STOPPED': return 'Stopped';
    case 'FAILED':
    case 'DEPLOY_FAILED': return 'Failed';
    case 'DEPLOYING': return 'Deploying…';
    case 'UNDEPLOYING': return 'Undeploying…';
    case 'UPDATING': return 'Updating…';
    case 'STARTING': return 'Starting…';
    case 'STOPPING': return 'Stopping…';
    case 'PARTIALLY_STARTED': return 'Partially started';
    case 'UNDEPLOYED': return 'Undeployed';
    default: return status;
  }
};

export const formatRelativeTime = (raw: any): string => {
  if (!raw) return '';
  const date = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export const formatMB = (bytes: number): string => {
  if (bytes <= 0) return '0';
  if (bytes > 10_000) return `${Math.round(bytes / (1024 * 1024))}`;
  return `${Math.round(bytes)}`;
};
