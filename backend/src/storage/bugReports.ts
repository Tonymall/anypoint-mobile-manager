import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
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

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAllReports(): Promise<StoredBugReport[]> {
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

async function writeAllReports(reports: StoredBugReport[]): Promise<void> {
  await ensureDataDir();
  await writeFile(BUG_REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

export async function createBugReport(
  report: Omit<StoredBugReport, 'id' | 'createdAt'>,
): Promise<StoredBugReport> {
  const reports = await readAllReports();
  const stored: StoredBugReport = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...report,
  };

  reports.unshift(stored);
  await writeAllReports(reports);
  return stored;
}

export async function updateBugReportDelivery(
  id: string,
  delivery: Pick<StoredBugReport, 'emailDelivered' | 'emailError'>,
): Promise<void> {
  const reports = await readAllReports();
  const index = reports.findIndex((report) => report.id === id);

  if (index === -1) {
    return;
  }

  reports[index] = {
    ...reports[index],
    emailDelivered: delivery.emailDelivered,
    emailError: delivery.emailError,
  };

  await writeAllReports(reports);
}

export async function listBugReports(limit = 50): Promise<StoredBugReport[]> {
  const reports = await readAllReports();
  return reports.slice(0, Math.max(1, Math.min(limit, 200)));
}
