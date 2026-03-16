import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config';
import { getDatabaseClient } from './db';

const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const PUSH_TOKENS_FILE = path.join(DATA_DIR, 'device-push-tokens.json');

export interface StoredDevicePushToken {
  id: string;
  userId: string;
  installationId: string;
  expoPushToken: string;
  platform: string;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

let databaseReadyPromise: Promise<void> | null = null;

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readAllTokensFromFile(): Promise<StoredDevicePushToken[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(PUSH_TOKENS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredDevicePushToken[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeAllTokensToFile(tokens: StoredDevicePushToken[]): Promise<void> {
  await ensureDataDir();
  await writeFile(PUSH_TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
}

async function ensureDatabaseReady(): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS device_push_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          installation_id TEXT NOT NULL,
          expo_push_token TEXT NOT NULL,
          platform TEXT NOT NULL,
          app_version TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      await client.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_device_push_tokens_user_installation
        ON device_push_tokens (user_id, installation_id)
      `);
    })();
  }

  await databaseReadyPromise;
}

function mapRow(row: Record<string, unknown>): StoredDevicePushToken {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    installationId: String(row.installation_id),
    expoPushToken: String(row.expo_push_token),
    platform: String(row.platform),
    appVersion: String(row.app_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function upsertDevicePushToken(
  token: Omit<StoredDevicePushToken, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<StoredDevicePushToken> {
  const client = getDatabaseClient();
  const now = new Date().toISOString();

  if (!client) {
    const tokens = await readAllTokensFromFile();
    const existing = tokens.find((entry) => entry.userId === token.userId && entry.installationId === token.installationId);

    if (existing) {
      const updated: StoredDevicePushToken = {
        ...existing,
        expoPushToken: token.expoPushToken,
        platform: token.platform,
        appVersion: token.appVersion,
        updatedAt: now,
      };

      await writeAllTokensToFile(tokens.map((entry) => (
        entry.id === existing.id ? updated : entry
      )));
      return updated;
    }

    const created: StoredDevicePushToken = {
      ...token,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    tokens.unshift(created);
    await writeAllTokensToFile(tokens.slice(0, 1000));
    return created;
  }

  await ensureDatabaseReady();
  const existing = await client.execute({
    sql: `
      SELECT *
      FROM device_push_tokens
      WHERE user_id = ? AND installation_id = ?
      LIMIT 1
    `,
    args: [token.userId, token.installationId],
  });

  if (existing.rows[0]) {
    const existingId = String(existing.rows[0].id);
    await client.execute({
      sql: `
        UPDATE device_push_tokens
        SET expo_push_token = ?, platform = ?, app_version = ?, updated_at = ?
        WHERE id = ?
      `,
      args: [token.expoPushToken, token.platform, token.appVersion, now, existingId],
    });

    return mapRow({
      ...existing.rows[0],
      expo_push_token: token.expoPushToken,
      platform: token.platform,
      app_version: token.appVersion,
      updated_at: now,
    });
  }

  const created: StoredDevicePushToken = {
    ...token,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  await client.execute({
    sql: `
      INSERT INTO device_push_tokens (
        id, user_id, installation_id, expo_push_token, platform, app_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      created.id,
      created.userId,
      created.installationId,
      created.expoPushToken,
      created.platform,
      created.appVersion,
      created.createdAt,
      created.updatedAt,
    ],
  });

  return created;
}

export async function removeDevicePushToken(userId: string, installationId: string): Promise<boolean> {
  const client = getDatabaseClient();

  if (!client) {
    const tokens = await readAllTokensFromFile();
    const remaining = tokens.filter((entry) => !(entry.userId === userId && entry.installationId === installationId));
    const removed = remaining.length !== tokens.length;
    if (removed) {
      await writeAllTokensToFile(remaining);
    }
    return removed;
  }

  await ensureDatabaseReady();
  const existing = await client.execute({
    sql: 'SELECT id FROM device_push_tokens WHERE user_id = ? AND installation_id = ? LIMIT 1',
    args: [userId, installationId],
  });

  if (!existing.rows[0]) {
    return false;
  }

  await client.execute({
    sql: 'DELETE FROM device_push_tokens WHERE user_id = ? AND installation_id = ?',
    args: [userId, installationId],
  });

  return true;
}

export async function listDevicePushTokensForUser(userId: string): Promise<StoredDevicePushToken[]> {
  const client = getDatabaseClient();

  if (!client) {
    const tokens = await readAllTokensFromFile();
    return tokens.filter((entry) => entry.userId === userId);
  }

  await ensureDatabaseReady();
  const result = await client.execute({
    sql: `
      SELECT *
      FROM device_push_tokens
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `,
    args: [userId],
  });

  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function removeDevicePushTokensByExpoToken(expoPushTokens: string[]): Promise<number> {
  const uniqueTokens = Array.from(new Set(expoPushTokens.filter(Boolean)));
  if (uniqueTokens.length === 0) {
    return 0;
  }

  const client = getDatabaseClient();
  if (!client) {
    const tokens = await readAllTokensFromFile();
    const remaining = tokens.filter((entry) => !uniqueTokens.includes(entry.expoPushToken));
    const removed = tokens.length - remaining.length;
    if (removed > 0) {
      await writeAllTokensToFile(remaining);
    }
    return removed;
  }

  await ensureDatabaseReady();
  let removed = 0;
  for (const token of uniqueTokens) {
    const existing = await client.execute({
      sql: 'SELECT id FROM device_push_tokens WHERE expo_push_token = ?',
      args: [token],
    });
    if (existing.rows.length > 0) {
      removed += existing.rows.length;
      await client.execute({
        sql: 'DELETE FROM device_push_tokens WHERE expo_push_token = ?',
        args: [token],
      });
    }
  }
  return removed;
}
