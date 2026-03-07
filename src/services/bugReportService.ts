import Constants from 'expo-constants';
import emailjs, { EmailJSResponseStatus } from '@emailjs/react-native';

import { getRegionById } from '../config/regions';
import { useAuthStore } from '../stores/authStore';

const EMAILJS_PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
const EMAILJS_SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID || 'default_service';
const EMAILJS_TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;

function assertBugReportConfig(): void {
  if (!EMAILJS_PUBLIC_KEY || !EMAILJS_TEMPLATE_ID) {
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
  const templateId = EMAILJS_TEMPLATE_ID as string;

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
    await emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams, {
      publicKey,
    });
  } catch (error) {
    if (error instanceof EmailJSResponseStatus) {
      if (error.status === 403) {
        throw new Error(
          'Bug reporting is blocked in EmailJS. Verify that non-browser API access is enabled in EmailJS Account > Security.',
        );
      }

      throw new Error(`Bug report failed with status ${error.status}: ${error.text}`);
    }

    throw error;
  }
}
