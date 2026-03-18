import type { AxiosError } from 'axios';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getStatusCode(error: unknown): number | null {
  return ((error as AxiosError | undefined)?.response?.status ?? null);
}

export function isOptionalControlPlaneError(error: unknown): boolean {
  const status = getStatusCode(error);
  return status === 404 || status === 405 || status === 403;
}

export async function withOptionalFallback<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (isOptionalControlPlaneError(error)) {
      return fallback;
    }
    throw error;
  }
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toStringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function unwrapCollection<T = any>(
  input: unknown,
  preferredKeys: string[] = [],
): T[] {
  if (Array.isArray(input)) return input as T[];
  if (!isPlainObject(input)) return [];

  for (const key of preferredKeys) {
    const value = input[key];
    if (Array.isArray(value)) return value as T[];
  }

  for (const key of [
    'data',
    'items',
    'content',
    'results',
    'entries',
    'assets',
    'applications',
    'nodes',
    'edges',
    'views',
    'layers',
    'fabrics',
    'targets',
    'notifications',
    'permissions',
    'apis',
  ]) {
    const value = input[key];
    if (Array.isArray(value)) return value as T[];
  }

  const nestedValues = Object.values(input);
  for (const value of nestedValues) {
    if (Array.isArray(value)) return value as T[];
  }

  return [];
}

export function findNestedArray<T = any>(
  input: unknown,
  keyCandidates: string[],
  maxDepth = 5,
): T[] {
  if (maxDepth < 0 || input == null) return [];
  if (Array.isArray(input)) return input as T[];
  if (!isPlainObject(input)) return [];

  for (const key of keyCandidates) {
    const value = input[key];
    if (Array.isArray(value)) return value as T[];
  }

  for (const value of Object.values(input)) {
    const nested = findNestedArray<T>(value, keyCandidates, maxDepth - 1);
    if (nested.length > 0) return nested;
  }

  return [];
}

export function findNestedValue(
  input: unknown,
  keyCandidates: string[],
  maxDepth = 5,
): unknown {
  if (maxDepth < 0 || input == null) return null;
  if (!isPlainObject(input)) return null;

  for (const key of keyCandidates) {
    if (key in input) return input[key];
  }

  for (const value of Object.values(input)) {
    const nested = findNestedValue(value, keyCandidates, maxDepth - 1);
    if (nested != null) return nested;
  }

  return null;
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.length > 0)));
}
