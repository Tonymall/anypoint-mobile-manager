import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config';
import { getDatabaseClient } from './db';

const DATA_DIR = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const REMOTE_CONFIG_FILE = path.join(DATA_DIR, 'remote-config.json');
const REMOTE_CONFIG_KEY = 'mobile_remote_config';

export interface MobileRemoteConfig {
  bugReportingEnabled: boolean;
  alertSyncEnabled: boolean;
  notificationsEnabledByDefault: boolean;
  supportEmail: string;
  minimumSupportedVersion: string;
  releaseStage: string;
}

const defaultRemoteConfig: MobileRemoteConfig = {
  bugReportingEnabled: true,
  alertSyncEnabled: true,
  notificationsEnabledByDefault: true,
  supportEmail: 'malliotisantonis@gmail.com',
  minimumSupportedVersion: '1.0.0',
  releaseStage: 'beta',
};

let databaseReadyPromise: Promise<void> | null = null;

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readFileConfig(): Promise<MobileRemoteConfig> {
  await ensureDataDir();

  try {
    const raw = await readFile(REMOTE_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MobileRemoteConfig>;
    return { ...defaultRemoteConfig, ...parsed };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return defaultRemoteConfig;
    }
    throw error;
  }
}

async function writeFileConfig(config: MobileRemoteConfig): Promise<void> {
  await ensureDataDir();
  await writeFile(REMOTE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function ensureDatabaseReady(): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    return;
  }

  if (!databaseReadyPromise) {
    databaseReadyPromise = (async () => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS app_config (
          config_key TEXT PRIMARY KEY,
          config_value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      const existing = await client.execute({
        sql: 'SELECT config_value FROM app_config WHERE config_key = ? LIMIT 1',
        args: [REMOTE_CONFIG_KEY],
      });

      if (existing.rows[0]) {
        return;
      }

      const fileConfig = await readFileConfig();
      await client.execute({
        sql: 'INSERT OR REPLACE INTO app_config (config_key, config_value, updated_at) VALUES (?, ?, ?)',
        args: [REMOTE_CONFIG_KEY, JSON.stringify(fileConfig), new Date().toISOString()],
      });
    })();
  }

  await databaseReadyPromise;
}

export async function getRemoteConfig(): Promise<MobileRemoteConfig> {
  const client = getDatabaseClient();
  if (!client) {
    return readFileConfig();
  }

  await ensureDatabaseReady();
  const result = await client.execute({
    sql: 'SELECT config_value FROM app_config WHERE config_key = ? LIMIT 1',
    args: [REMOTE_CONFIG_KEY],
  });

  const value = result.rows[0]?.config_value;
  if (!value) {
    return defaultRemoteConfig;
  }

  return {
    ...defaultRemoteConfig,
    ...(JSON.parse(String(value)) as Partial<MobileRemoteConfig>),
  };
}

export async function updateRemoteConfig(partial: Partial<MobileRemoteConfig>): Promise<MobileRemoteConfig> {
  const nextConfig = {
    ...(await getRemoteConfig()),
    ...partial,
  };

  const client = getDatabaseClient();
  if (!client) {
    await writeFileConfig(nextConfig);
    return nextConfig;
  }

  await ensureDatabaseReady();
  await client.execute({
    sql: 'INSERT OR REPLACE INTO app_config (config_key, config_value, updated_at) VALUES (?, ?, ?)',
    args: [REMOTE_CONFIG_KEY, JSON.stringify(nextConfig), new Date().toISOString()],
  });

  return nextConfig;
}
