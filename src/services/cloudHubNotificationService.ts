import api from './api';
import logger from '../utils/logger';
import { getStatusCode, toNumber, toStringValue, unwrapCollection, withOptionalFallback } from './controlPlaneCommon';

const CLOUDHUB_NOTIFICATIONS_BASE = '/cloudhub/api/notifications';

export interface CloudHubNotification {
  id: string;
  title: string;
  status: string | null;
  createdAt: string | null;
  severity: string | null;
  body: string | null;
  targetName: string | null;
}

function asRecord(value: unknown): Record<string, any> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}

function normalizeNotification(raw: unknown): CloudHubNotification {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.notificationId) ?? toStringValue(item.title) ?? `notification-${Math.random()}`,
    title: toStringValue(item.title) ?? toStringValue(item.message) ?? toStringValue(item.subject) ?? 'Platform notification',
    status: toStringValue(item.status) ?? toStringValue(item.readStatus),
    createdAt: toStringValue(item.createdAt) ?? toStringValue(item.timestamp) ?? toStringValue(item.date),
    severity: toStringValue(item.severity) ?? toStringValue(item.level),
    body: toStringValue(item.body) ?? toStringValue(item.description),
    targetName: toStringValue(item.targetName) ?? toStringValue(item.domain) ?? toStringValue(item.applicationName),
  };
}

export async function getNotifications(
  params?: { status?: string; limit?: number },
): Promise<CloudHubNotification[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(CLOUDHUB_NOTIFICATIONS_BASE, { params });
    return unwrapCollection(data, ['notifications', 'data']).map(normalizeNotification);
  }, []);
}

/**
 * Unread notification count.
 *
 * The `/count` endpoint answers with a BARE NUMBER as `text/plain`. The shared
 * axios instance sends `Accept: application/json`, which makes the server
 * reply 406 Not Acceptable, so this one request opts into a permissive Accept
 * header (the global default is left untouched). The response therefore has to
 * be parsed from a bare number, a numeric string, or a `{ count: n }` body.
 *
 * The badge is decorative: any failure degrades to 0 rather than throwing.
 */
export async function getNotificationCount(status = 'unread'): Promise<number> {
  try {
    return await withOptionalFallback(async () => {
      const { data } = await api.get(`${CLOUDHUB_NOTIFICATIONS_BASE}/count`, {
        params: { status, _: Date.now() },
        headers: { Accept: '*/*' },
      });
      return toNumber(data) ?? toNumber((data as any)?.count) ?? 0;
    }, 0);
  } catch (error) {
    logger.warn(`[CloudHubNotifications] count unavailable: ${getStatusCode(error) ?? (error as Error)?.message ?? 'unknown error'}`);
    return 0;
  }
}
