import Constants from 'expo-constants';

import { getRegionById } from '../config/regions';
import { useAuthStore } from '../stores/authStore';

const EMAILJS_PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
const EMAILJS_SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
const EMAILJS_PRIVATE_KEY = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY;

function assertBugReportConfig(): void {
  if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PRIVATE_KEY) {
    throw new Error('Bug reporting is not configured yet.');
  }
}

export interface BugReportPayload {
  title: string;
  message: string;
  details?: string;
}

export async function submitBugReport(payload: BugReportPayload): Promise<void> {
  assertBugReportConfig();
  const publicKey = EMAILJS_PUBLIC_KEY as string;
  const serviceId = EMAILJS_SERVICE_ID as string;
  const templateId = EMAILJS_TEMPLATE_ID as string;
  const privateKey = EMAILJS_PRIVATE_KEY as string;

  const authState = useAuthStore.getState();
  const region = getRegionById(authState.selectedRegion);
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const templateParams = {
    subject: `[MuleOps Bug Report] ${payload.title}`,
    title: payload.title,
    message: payload.message,
    details: payload.details ?? '',
    control_plane: region.label,
    app_version: appVersion,
    user_email: authState.user?.email ?? 'unknown',
    user_name: authState.user?.username ?? authState.user?.firstName ?? 'unknown',
    submitted_at: new Date().toISOString(),
  };

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: templateParams,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 403) {
        throw new Error(
          'Bug reporting is blocked in EmailJS. Verify that non-browser API access is enabled in EmailJS Account > Security.',
        );
      }
      throw new Error(`Bug report failed with status ${response.status}: ${text}`);
    }
  } catch (error) {
    throw error;
  }
}
