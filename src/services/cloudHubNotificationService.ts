import api from './api';
import { toNumber, toStringValue, unwrapCollection, withOptionalFallback } from './controlPlaneCommon';

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

export async function getNotificationCount(status = 'unread'): Promise<number> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${CLOUDHUB_NOTIFICATIONS_BASE}/count`, { params: { status, _: Date.now() } });
    return toNumber(data) ?? toNumber((data as any)?.count) ?? 0;
  }, 0);
}
