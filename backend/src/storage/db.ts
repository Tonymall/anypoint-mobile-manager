import { createClient, type Client } from '@libsql/client';

import { env } from '../config';

let dbClient: Client | null = null;

export function getDatabaseClient(): Client | null {
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

export function mapBoolean(value: unknown): boolean {
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    return value === '1' || value.toLowerCase() === 'true';
  }
  return Boolean(value);
}
