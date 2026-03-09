import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';

import { isAdminRequestAuthorized } from './auth';
import { env } from './config';
import { sendBugReportEmail } from './emailjs';
import { renderPrivacyPolicyHtml } from './privacyPolicy';
import {
  clearAlertEventsForUser,
  deleteAlertEventForUser,
  listAlertEvents,
  listAlertEventsForUser,
  recordAlertEvent,
} from './storage/alertEvents';
import {
  createBugReport,
  getBugReportStorageMode,
  listBugReports,
  updateBugReportDelivery,
} from './storage/bugReports';
import { getRemoteConfig, updateRemoteConfig } from './storage/remoteConfig';

const app = express();

const corsOrigin = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : true;

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    ok: true,
    service: 'muleops-backend',
    storage: getBugReportStorageMode(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/privacy-policy', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderPrivacyPolicyHtml());
});

const bugReportSchema = z.object({
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  details: z.string().trim().max(12000).optional().default(''),
  controlPlane: z.string().trim().max(120).optional().default('Unknown'),
  appVersion: z.string().trim().max(64).optional().default('unknown'),
  userEmail: z.string().trim().email().optional().or(z.literal('unknown')).default('unknown'),
  userName: z.string().trim().max(200).optional().default('unknown'),
});

const alertEventSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(64),
  action: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4000),
  applicationName: z.string().trim().max(200).optional().nullable(),
  domain: z.string().trim().max(200).optional().nullable(),
  environmentId: z.string().trim().max(200).optional().nullable(),
  organizationId: z.string().trim().max(200).optional().nullable(),
  controlPlane: z.string().trim().max(64).optional().nullable(),
});

const remoteConfigSchema = z.object({
  bugReportingEnabled: z.boolean().optional(),
  alertSyncEnabled: z.boolean().optional(),
  notificationsEnabledByDefault: z.boolean().optional(),
  supportEmail: z.string().trim().email().optional(),
  minimumSupportedVersion: z.string().trim().max(64).optional(),
  releaseStage: z.string().trim().max(64).optional(),
});

app.post('/api/bug-reports', async (req: Request, res: Response) => {
  const parsed = bugReportSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid bug report payload',
      details: parsed.error.flatten(),
    });
    return;
  }

  const payload = parsed.data;
  const storedReport = await createBugReport({
    title: payload.title,
    message: payload.message,
    details: payload.details,
    controlPlane: payload.controlPlane,
    appVersion: payload.appVersion,
    userEmail: payload.userEmail,
    userName: payload.userName,
    emailDelivered: false,
    emailError: null,
  });

  try {
    await sendBugReportEmail({
      subject: `[MuleOps Bug Report] ${payload.title}`,
      title: payload.title,
      message: payload.message,
      details: payload.details,
      control_plane: payload.controlPlane,
      app_version: payload.appVersion,
      user_email: payload.userEmail,
      user_name: payload.userName,
      submitted_at: storedReport.createdAt,
    });

    await updateBugReportDelivery(storedReport.id, {
      emailDelivered: true,
      emailError: null,
    });

    res.status(202).json({ ok: true, emailDelivered: true, reportId: storedReport.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backend failure';
    await updateBugReportDelivery(storedReport.id, {
      emailDelivered: false,
      emailError: message,
    });

    res.status(202).json({
      ok: true,
      emailDelivered: false,
      reportId: storedReport.id,
    });
  }
});

app.post('/api/alerts', async (req: Request, res: Response) => {
  const parsed = alertEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid alert payload',
      details: parsed.error.flatten(),
    });
    return;
  }

  const result = await recordAlertEvent({
    userId: parsed.data.userId,
    type: parsed.data.type,
    action: parsed.data.action,
    title: parsed.data.title,
    body: parsed.data.body,
    applicationName: parsed.data.applicationName ?? null,
    domain: parsed.data.domain ?? null,
    environmentId: parsed.data.environmentId ?? null,
    organizationId: parsed.data.organizationId ?? null,
    controlPlane: parsed.data.controlPlane ?? null,
  });

  res.status(202).json({
    ok: true,
    deduped: result.deduped,
    event: result.event,
  });
});

app.get('/api/alerts', async (req: Request, res: Response) => {
  const userId = String(req.query.userId ?? '').trim();
  if (!userId) {
    res.status(400).json({
      error: 'userId is required',
    });
    return;
  }

  const limit = Number(req.query.limit ?? 100);
  const events = await listAlertEventsForUser(userId, limit);
  res.status(200).json({
    ok: true,
    count: events.length,
    events,
  });
});

app.delete('/api/alerts', async (req: Request, res: Response) => {
  const userId = String(req.query.userId ?? '').trim();
  if (!userId) {
    res.status(400).json({
      error: 'userId is required',
    });
    return;
  }

  const deletedCount = await clearAlertEventsForUser(userId);
  res.status(200).json({
    ok: true,
    deletedCount,
  });
});

app.delete('/api/alerts/:id', async (req: Request, res: Response) => {
  const userId = String(req.query.userId ?? '').trim();
  const eventId = String(req.params.id ?? '').trim();

  if (!userId || !eventId) {
    res.status(400).json({
      error: 'userId and alert id are required',
    });
    return;
  }

  const deleted = await deleteAlertEventForUser(userId, eventId);
  res.status(deleted ? 200 : 404).json({
    ok: deleted,
    deleted,
  });
});

app.get('/api/config/mobile', async (_req: Request, res: Response) => {
  const config = await getRemoteConfig();
  res.status(200).json({
    ok: true,
    config,
  });
});

app.get('/api/admin/bug-reports', async (req: Request, res: Response) => {
  if (!env.ADMIN_API_KEY) {
    res.status(503).json({
      error: 'Admin API is not configured',
    });
    return;
  }

  const adminKey = req.header('x-admin-key');
  if (!isAdminRequestAuthorized(adminKey)) {
    res.status(401).json({
      error: 'Unauthorized',
    });
    return;
  }

  const limit = Number(req.query.limit ?? 50);
  const reports = await listBugReports(limit);
  res.status(200).json({
    ok: true,
    count: reports.length,
    reports,
  });
});

app.get('/api/admin/alerts', async (req: Request, res: Response) => {
  if (!env.ADMIN_API_KEY) {
    res.status(503).json({ error: 'Admin API is not configured' });
    return;
  }

  const adminKey = req.header('x-admin-key');
  if (!isAdminRequestAuthorized(adminKey)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const limit = Number(req.query.limit ?? 100);
  const events = await listAlertEvents(limit);
  res.status(200).json({
    ok: true,
    count: events.length,
    events,
  });
});

app.get('/api/admin/config/mobile', async (req: Request, res: Response) => {
  if (!env.ADMIN_API_KEY) {
    res.status(503).json({ error: 'Admin API is not configured' });
    return;
  }

  const adminKey = req.header('x-admin-key');
  if (!isAdminRequestAuthorized(adminKey)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const config = await getRemoteConfig();
  res.status(200).json({ ok: true, config });
});

app.put('/api/admin/config/mobile', async (req: Request, res: Response) => {
  if (!env.ADMIN_API_KEY) {
    res.status(503).json({ error: 'Admin API is not configured' });
    return;
  }

  const adminKey = req.header('x-admin-key');
  if (!isAdminRequestAuthorized(adminKey)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = remoteConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid remote config payload',
      details: parsed.error.flatten(),
    });
    return;
  }

  const config = await updateRemoteConfig(parsed.data);
  res.status(200).json({ ok: true, config });
});

app.listen(env.PORT, () => {
  process.stdout.write(`[backend] MuleOps backend listening on port ${env.PORT}\n`);
});
