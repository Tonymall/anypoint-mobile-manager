import cors from 'cors';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';

import { isAdminRequestAuthorized } from './auth';
import { env } from './config';
import { sendBugReportEmail } from './emailjs';
import {
  createBugReport,
  getBugReportStorageMode,
  listBugReports,
  updateBugReportDelivery,
} from './storage/bugReports';

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

const bugReportSchema = z.object({
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(4000),
  details: z.string().trim().max(12000).optional().default(''),
  controlPlane: z.string().trim().max(120).optional().default('Unknown'),
  appVersion: z.string().trim().max(64).optional().default('unknown'),
  userEmail: z.string().trim().email().optional().or(z.literal('unknown')).default('unknown'),
  userName: z.string().trim().max(200).optional().default('unknown'),
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

app.listen(env.PORT, () => {
  process.stdout.write(`[backend] MuleOps backend listening on port ${env.PORT}\n`);
});
