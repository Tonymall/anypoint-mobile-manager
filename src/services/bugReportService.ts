import Constants from 'expo-constants';

import { getRegionById } from '../config/regions';
import { useAuthStore } from '../stores/authStore';
import { useRemoteConfigStore } from '../stores/remoteConfigStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function assertBugReportConfig(): void {
  if (!BACKEND_URL) {
    throw new Error('Bug reporting is not configured yet.');
  }

  if (useRemoteConfigStore.getState().config?.bugReportingEnabled === false) {
    throw new Error('Bug reporting is currently disabled.');
  }
}

export interface BugReportPayload {
  title: string;
  message: string;
  details?: string;
}

export async function submitBugReport(payload: BugReportPayload): Promise<void> {
  assertBugReportConfig();

  const authState = useAuthStore.getState();
  const region = getRegionById(authState.selectedRegion);
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const backendUrl = BACKEND_URL as string;

  const response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/bug-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: payload.title,
      message: payload.message,
      details: payload.details ?? '',
      controlPlane: region.label,
      appVersion,
      userEmail: authState.user?.email ?? 'unknown',
      userName: authState.user?.username ?? authState.user?.firstName ?? 'unknown',
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    const backendMessage = data?.message || data?.error;
    throw new Error(backendMessage || `Bug report failed with status ${response.status}`);
  }
}
