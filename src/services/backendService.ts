import Constants from 'expo-constants';

import { getRegionById } from '../config/regions';
import { useAuthStore } from '../stores/authStore';
import type { AppNotification } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function getBackendUrl(): string | null {
  return BACKEND_URL ? BACKEND_URL.replace(/\/$/, '') : null;
}

export interface BackendAlertEvent {
  id: string;
  userId: string;
  type: string;
  action: string;
  title: string;
  body: string;
  applicationName: string | null;
  domain: string | null;
  environmentId: string | null;
  organizationId: string | null;
  controlPlane: string | null;
  dedupeKey: string;
  createdAt: string;
}

export interface MobileRemoteConfig {
  bugReportingEnabled: boolean;
  alertSyncEnabled: boolean;
  notificationsEnabledByDefault: boolean;
  supportEmail: string;
  minimumSupportedVersion: string;
  releaseStage: string;
}

export async function publishAlertEvent(notification: AppNotification): Promise<void> {
  const backendUrl = getBackendUrl();
  const auth = useAuthStore.getState();
  if (!backendUrl || !auth.user?.id) {
    return;
  }

  const region = getRegionById(auth.selectedRegion);
  await fetch(`${backendUrl}/api/alerts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: auth.user.id,
      type: notification.type,
      action: notification.action,
      title: notification.title,
      body: notification.body,
      applicationName: notification.applicationName ?? null,
      domain: notification.domain ?? null,
      environmentId: notification.environmentId ?? auth.currentEnvironment?.id ?? null,
      organizationId: auth.currentOrganization?.id ?? null,
      controlPlane: region.label,
    }),
  });
}

export async function fetchAlertHistory(limit = 100): Promise<BackendAlertEvent[]> {
  const backendUrl = getBackendUrl();
  const auth = useAuthStore.getState();
  if (!backendUrl || !auth.user?.id) {
    return [];
  }

  const response = await fetch(
    `${backendUrl}/api/alerts?userId=${encodeURIComponent(auth.user.id)}&limit=${limit}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch alert history: ${response.status}`);
  }

  const data = (await response.json()) as { events?: BackendAlertEvent[] };
  return data.events ?? [];
}

export async function fetchMobileRemoteConfig(): Promise<MobileRemoteConfig | null> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return null;
  }

  const response = await fetch(`${backendUrl}/api/config/mobile`);
  if (!response.ok) {
    throw new Error(`Failed to fetch mobile config: ${response.status}`);
  }

  const data = (await response.json()) as { config?: MobileRemoteConfig };
  return data.config ?? null;
}

export function mapBackendAlertToNotification(event: BackendAlertEvent): AppNotification {
  return {
    id: event.id,
    type: event.type as AppNotification['type'],
    action: event.action as AppNotification['action'],
    title: event.title,
    body: event.body,
    applicationName: event.applicationName ?? undefined,
    timestamp: event.createdAt,
    read: false,
    domain: event.domain ?? undefined,
    environmentId: event.environmentId ?? undefined,
  };
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}
