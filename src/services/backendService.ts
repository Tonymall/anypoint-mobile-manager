import Constants from 'expo-constants';

import { getRegionById } from '../config/regions';
import { useAuthStore } from '../stores/authStore';
import { useRemoteConfigStore } from '../stores/remoteConfigStore';
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

export interface AdminBugReport {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  details: string;
  controlPlane: string;
  appVersion: string;
  userEmail: string;
  userName: string;
  emailDelivered: boolean;
  emailError: string | null;
}

export interface AdminAlertEvent extends BackendAlertEvent {}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function createMfaBridgeUrl(
  verifyUrl: string,
  requestToken: string,
): Promise<string | null> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return null;
  }

  const response = await fetch(`${backendUrl}/api/auth/mfa-bridge-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      verifyUrl,
      requestToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create MFA bridge session: ${response.status}`);
  }

  const data = await readJson<{ sessionId?: string }>(response);
  if (!data.sessionId) {
    throw new Error('Backend did not return an MFA bridge session.');
  }

  return `${backendUrl}/auth/mfa/bridge/${encodeURIComponent(data.sessionId)}`;
}

export async function publishAlertEvent(notification: AppNotification): Promise<void> {
  const backendUrl = getBackendUrl();
  const auth = useAuthStore.getState();
  if (!backendUrl || !auth.user?.id || useRemoteConfigStore.getState().config?.alertSyncEnabled === false) {
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

  const data = await readJson<{ events?: BackendAlertEvent[] }>(response);
  return data.events ?? [];
}

export async function clearAlertHistory(): Promise<void> {
  const backendUrl = getBackendUrl();
  const auth = useAuthStore.getState();
  if (!backendUrl || !auth.user?.id) {
    return;
  }

  const response = await fetch(
    `${backendUrl}/api/alerts?userId=${encodeURIComponent(auth.user.id)}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    throw new Error(`Failed to clear alert history: ${response.status}`);
  }
}

export async function deleteAlertHistoryItem(alertId: string): Promise<void> {
  const backendUrl = getBackendUrl();
  const auth = useAuthStore.getState();
  if (!backendUrl || !auth.user?.id) {
    return;
  }

  const response = await fetch(
    `${backendUrl}/api/alerts/${encodeURIComponent(alertId)}?userId=${encodeURIComponent(auth.user.id)}`,
    { method: 'DELETE' },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete alert history item: ${response.status}`);
  }
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

  const data = await readJson<{ config?: MobileRemoteConfig }>(response);
  return data.config ?? null;
}

export async function fetchAdminBugReports(adminKey: string, limit = 25): Promise<AdminBugReport[]> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new Error('Backend is not configured.');
  }

  const response = await fetch(`${backendUrl}/api/admin/bug-reports?limit=${limit}`, {
    headers: {
      'x-admin-key': adminKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch bug reports: ${response.status}`);
  }

  const data = await readJson<{ reports?: AdminBugReport[] }>(response);
  return data.reports ?? [];
}

export async function fetchAdminAlerts(adminKey: string, limit = 50): Promise<AdminAlertEvent[]> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new Error('Backend is not configured.');
  }

  const response = await fetch(`${backendUrl}/api/admin/alerts?limit=${limit}`, {
    headers: {
      'x-admin-key': adminKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch alert events: ${response.status}`);
  }

  const data = await readJson<{ events?: AdminAlertEvent[] }>(response);
  return data.events ?? [];
}

export async function fetchAdminMobileConfig(adminKey: string): Promise<MobileRemoteConfig | null> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new Error('Backend is not configured.');
  }

  const response = await fetch(`${backendUrl}/api/admin/config/mobile`, {
    headers: {
      'x-admin-key': adminKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote config: ${response.status}`);
  }

  const data = await readJson<{ config?: MobileRemoteConfig }>(response);
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
