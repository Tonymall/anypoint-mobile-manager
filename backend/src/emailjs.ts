import { env } from './config';

export interface BugReportTemplateParams {
  subject: string;
  title: string;
  message: string;
  details: string;
  control_plane: string;
  app_version: string;
  user_email: string;
  user_name: string;
  submitted_at: string;
}

export async function sendBugReportEmail(templateParams: BugReportTemplateParams): Promise<void> {
  const response = await fetch(env.EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id: env.EMAILJS_PUBLIC_KEY,
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: templateParams,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EmailJS request failed with status ${response.status}: ${text}`);
  }
}
