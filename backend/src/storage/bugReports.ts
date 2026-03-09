import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createClient, type Client } from '@libsql/client';

import { env } from '../config';

const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const BUG_REPORTS_FILE = path.join(DATA_DIR, 'bug-reports.json');

export interface StoredBugReport {
  id: string;
  title: string;
  message: string;
  details: string;
  controlPlane: string;
  appVersion: string;
  userEmail: string;
  userName: string;
  createdAt: string;
  emailDelivered: boolean;
  emailError: string | null;
}

let dbClient: Client | null = null;
let databaseReadyPromise: Promise<void> | null = null;

function getDatabaseClient(): Client | null {
  if (!env.TURSO_DATABASE_URL) {
    return null;
  }

  if (!dbClient) {
    dbClient = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
  }

  return dbClient;
}

function mapBoolean(value: unknown): boolean {
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true';
  }
  return Boolean(value);
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAllReportsFromFile(): Promise<StoredBugReport[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(BUG_REPORTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredBugReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeAllReportsToFile(reports: StoredBugReport[]): Promise<void> {
  await ensureDataDir();
  await writeFile(BUG_REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

async function ensureDatabaseReady(): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS bug_reports (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          details TEXT NOT NULL,
          control_plane TEXT NOT NULL,
          app_version TEXT NOT NULL,
          user_email TEXT NOT NULL,
          user_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          email_delivered INTEGER NOT NULL,
          email_error TEXT
        )
      `);

      const countResult = await client.execute('SELECT COUNT(*) AS count FROM bug_reports');
      const existingCount = Number(countResult.rows[0]?.count ?? 0);
      if (existingCount > 0) {
        return;
      }

      const fileReports = await readAllReportsFromFile();
      for (const report of fileReports) {
        await client.execute({
          sql: `
            INSERT OR IGNORE INTO bug_reports (
              id, title, message, details, control_plane, app_version,
              user_email, user_name, created_at, email_delivered, email_error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            report.id,
            report.title,
            report.message,
            report.details,
            report.controlPlane,
            report.appVersion,
            report.userEmail,
            report.userName,
            report.createdAt,
            report.emailDelivered ? 1 : 0,
            report.emailError,
          ],
        });
      }
    })();
  }

  await databaseReadyPromise;
}

export function getBugReportStorageMode(): 'turso' | 'file' {
  return getDatabaseClient() ? 'turso' : 'file';
}

export async function createBugReport(
  report: Omit<StoredBugReport, 'id' | 'createdAt'>,
): Promise<StoredBugReport> {
  const stored: StoredBugReport = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...report,
  };

  const client = getDatabaseClient();
  if (!client) {
    const reports = await readAllReportsFromFile();
    reports.unshift(stored);
    await writeAllReportsToFile(reports);
    return stored;
  }

  await ensureDatabaseReady();
  await client.execute({
    sql: `
      INSERT INTO bug_reports (
        id, title, message, details, control_plane, app_version,
        user_email, user_name, created_at, email_delivered, email_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      stored.id,
      stored.title,
      stored.message,
      stored.details,
      stored.controlPlane,
      stored.appVersion,
      stored.userEmail,
      stored.userName,
      stored.createdAt,
      stored.emailDelivered ? 1 : 0,
      stored.emailError,
    ],
  });

  return stored;
}

export async function updateBugReportDelivery(
  id: string,
  delivery: Pick<StoredBugReport, 'emailDelivered' | 'emailError'>,
): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    const reports = await readAllReportsFromFile();
    const index = reports.findIndex((report) => report.id === id);
    if (index === -1) {
      return;
    }

    reports[index] = {
      ...reports[index],
      emailDelivered: delivery.emailDelivered,
      emailError: delivery.emailError,
    };
    await writeAllReportsToFile(reports);
    return;
  }

  await ensureDatabaseReady();
  await client.execute({
    sql: 'UPDATE bug_reports SET email_delivered = ?, email_error = ? WHERE id = ?',
    args: [delivery.emailDelivered ? 1 : 0, delivery.emailError, id],
  });
}

export async function listBugReports(limit = 50): Promise<StoredBugReport[]> {
  const normalizedLimit = Math.max(1, Math.min(limit, 200));
  const client = getDatabaseClient();
  if (!client) {
    const reports = await readAllReportsFromFile();
    return reports.slice(0, normalizedLimit);
  }

  await ensureDatabaseReady();
  const result = await client.execute({
    sql: `
      SELECT
        id,
        title,
        message,
        details,
        control_plane,
        app_version,
        user_email,
        user_name,
        created_at,
        email_delivered,
        email_error
      FROM bug_reports
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [normalizedLimit],
  });

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title),
    message: String(row.message),
    details: String(row.details ?? ''),
    controlPlane: String(row.control_plane ?? ''),
    appVersion: String(row.app_version ?? ''),
    userEmail: String(row.user_email ?? ''),
    userName: String(row.user_name ?? ''),
    createdAt: String(row.created_at),
    emailDelivered: mapBoolean(row.email_delivered),
    emailError: row.email_error == null ? null : String(row.email_error),
  }));
}
