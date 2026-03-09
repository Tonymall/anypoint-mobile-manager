import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config';
import { getDatabaseClient } from './db';

const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const ALERT_EVENTS_FILE = path.join(DATA_DIR, 'alert-events.json');
const ALERT_DEDUPE_WINDOW_MS = 90_000;

export interface StoredAlertEvent {
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

let databaseReadyPromise: Promise<void> | null = null;

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAllEventsFromFile(): Promise<StoredAlertEvent[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(ALERT_EVENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredAlertEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeAllEventsToFile(events: StoredAlertEvent[]): Promise<void> {
  await ensureDataDir();
  await writeFile(ALERT_EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
}

async function ensureDatabaseReady(): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS alert_events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          action_name TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          application_name TEXT,
          domain TEXT,
          environment_id TEXT,
          organization_id TEXT,
          control_plane TEXT,
          dedupe_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_alert_events_user_created
        ON alert_events (user_id, created_at DESC)
      `);
    })();
  }

  await databaseReadyPromise;
}

function buildDedupeKey(event: Omit<StoredAlertEvent, 'id' | 'createdAt' | 'dedupeKey'>): string {
  return [
    event.userId,
    event.type,
    event.action,
    event.title,
    event.domain ?? '',
    event.applicationName ?? '',
  ].join('|');
}

export async function recordAlertEvent(
  event: Omit<StoredAlertEvent, 'id' | 'createdAt' | 'dedupeKey'>,
): Promise<{ event: StoredAlertEvent; deduped: boolean }> {
  const dedupeKey = buildDedupeKey(event);
  const client = getDatabaseClient();

  if (!client) {
    const events = await readAllEventsFromFile();
    const now = Date.now();
    const existing = events.find((candidate) =>
      candidate.dedupeKey === dedupeKey &&
      candidate.userId === event.userId &&
      now - new Date(candidate.createdAt).getTime() < ALERT_DEDUPE_WINDOW_MS,
    );

    if (existing) {
      return { event: existing, deduped: true };
    }

    const stored: StoredAlertEvent = {
      ...event,
      id: randomUUID(),
      dedupeKey,
      createdAt: new Date().toISOString(),
    };

    events.unshift(stored);
    await writeAllEventsToFile(events.slice(0, 500));
    return { event: stored, deduped: false };
  }

  await ensureDatabaseReady();
  const threshold = new Date(Date.now() - ALERT_DEDUPE_WINDOW_MS).toISOString();
  const existing = await client.execute({
    sql: `
      SELECT *
      FROM alert_events
      WHERE user_id = ? AND dedupe_key = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    args: [event.userId, dedupeKey, threshold],
  });

  const existingRow = existing.rows[0];
  if (existingRow) {
    return {
      deduped: true,
      event: {
        id: String(existingRow.id),
        userId: String(existingRow.user_id),
        type: String(existingRow.type),
        action: String(existingRow.action_name),
        title: String(existingRow.title),
        body: String(existingRow.body),
        applicationName: existingRow.application_name == null ? null : String(existingRow.application_name),
        domain: existingRow.domain == null ? null : String(existingRow.domain),
        environmentId: existingRow.environment_id == null ? null : String(existingRow.environment_id),
        organizationId: existingRow.organization_id == null ? null : String(existingRow.organization_id),
        controlPlane: existingRow.control_plane == null ? null : String(existingRow.control_plane),
        dedupeKey: String(existingRow.dedupe_key),
        createdAt: String(existingRow.created_at),
      },
    };
  }

  const stored: StoredAlertEvent = {
    ...event,
    id: randomUUID(),
    dedupeKey,
    createdAt: new Date().toISOString(),
  };

  await client.execute({
    sql: `
      INSERT INTO alert_events (
        id, user_id, type, action_name, title, body,
        application_name, domain, environment_id, organization_id,
        control_plane, dedupe_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      stored.id,
      stored.userId,
      stored.type,
      stored.action,
      stored.title,
      stored.body,
      stored.applicationName,
      stored.domain,
      stored.environmentId,
      stored.organizationId,
      stored.controlPlane,
      stored.dedupeKey,
      stored.createdAt,
    ],
  });

  return { event: stored, deduped: false };
}

export async function listAlertEventsForUser(userId: string, limit = 100): Promise<StoredAlertEvent[]> {
  const normalizedLimit = Math.max(1, Math.min(limit, 200));
  const client = getDatabaseClient();

  if (!client) {
    const events = await readAllEventsFromFile();
    return events.filter((event) => event.userId === userId).slice(0, normalizedLimit);
  }

  await ensureDatabaseReady();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM alert_events
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [userId, normalizedLimit],
  });

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    userId: String(row.user_id),
    type: String(row.type),
    action: String(row.action_name),
    title: String(row.title),
    body: String(row.body),
    applicationName: row.application_name == null ? null : String(row.application_name),
    domain: row.domain == null ? null : String(row.domain),
    environmentId: row.environment_id == null ? null : String(row.environment_id),
    organizationId: row.organization_id == null ? null : String(row.organization_id),
    controlPlane: row.control_plane == null ? null : String(row.control_plane),
    dedupeKey: String(row.dedupe_key),
    createdAt: String(row.created_at),
  }));
}

export async function listAlertEvents(limit = 100): Promise<StoredAlertEvent[]> {
  const normalizedLimit = Math.max(1, Math.min(limit, 200));
  const client = getDatabaseClient();

  if (!client) {
    const events = await readAllEventsFromFile();
    return events.slice(0, normalizedLimit);
  }

  await ensureDatabaseReady();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM alert_events
      ORDER BY created_at DESC
      LIMIT ?
    `,
    args: [normalizedLimit],
  });

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    userId: String(row.user_id),
    type: String(row.type),
    action: String(row.action_name),
    title: String(row.title),
    body: String(row.body),
    applicationName: row.application_name == null ? null : String(row.application_name),
    domain: row.domain == null ? null : String(row.domain),
    environmentId: row.environment_id == null ? null : String(row.environment_id),
    organizationId: row.organization_id == null ? null : String(row.organization_id),
    controlPlane: row.control_plane == null ? null : String(row.control_plane),
    dedupeKey: String(row.dedupe_key),
    createdAt: String(row.created_at),
  }));
}
