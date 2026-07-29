/**
 * Audit Log Service Tests
 *
 * The audit API is loosely typed: fields declared as strings on
 * `AuditLogEntry` sometimes arrive as objects, arrays or numbers. Rendering an
 * object as a React text child crashes the Platform Activity screen, so the
 * service boundary must coerce every string-typed field to a renderable
 * string — without changing the existing fallback chains.
 */

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    defaults: { headers: { common: {} } },
  },
}));

jest.mock('../utils/logger', () => {
  const mockLogger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };
  return { __esModule: true, default: mockLogger, logger: mockLogger };
});

import api from '../services/api';
import { queryAuditLogs, toDisplayString } from '../services/auditLogService';
import type { AuditLogEntry } from '../types';

const ORG_ID = '11111111-2222-3333-4444-555555555555';

const mockedApi = api as unknown as { get: jest.Mock; post: jest.Mock };

/** Run a single raw audit record through the real service pipeline. */
async function normalizeOne(raw: unknown): Promise<AuditLogEntry> {
  mockedApi.post.mockResolvedValueOnce({ data: { data: [raw], total: 1 } });
  const result = await queryAuditLogs(ORG_ID);
  return result.data[0];
}

/** Fields typed as `string` on AuditLogEntry — none may render as an object. */
const STRING_FIELDS: Array<keyof AuditLogEntry> = [
  'id',
  'action',
  'platform',
  'objectType',
  'objectId',
  'userName',
  'userId',
  'timestamp',
  'environmentId',
  'environmentName',
];

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// toDisplayString — coercion rules
// ---------------------------------------------------------------

describe('toDisplayString', () => {
  it('passes strings through untouched', () => {
    expect(toDisplayString('Deploy', 'Unknown')).toBe('Deploy');
    expect(toDisplayString('  spaced  ', 'Unknown')).toBe('  spaced  ');
    expect(toDisplayString('', 'Unknown')).toBe('');
  });

  it('stringifies numbers, booleans and bigints', () => {
    expect(toDisplayString(42, 'Unknown')).toBe('42');
    expect(toDisplayString(0, 'Unknown')).toBe('0');
    expect(toDisplayString(-1.5, 'Unknown')).toBe('-1.5');
    expect(toDisplayString(true, 'Unknown')).toBe('true');
    expect(toDisplayString(false, 'Unknown')).toBe('false');
    expect(toDisplayString(BigInt(9), 'Unknown')).toBe('9');
  });

  it('falls back for null, undefined and non-finite numbers', () => {
    expect(toDisplayString(null, 'Unknown')).toBe('Unknown');
    expect(toDisplayString(undefined, 'Unknown')).toBe('Unknown');
    expect(toDisplayString(NaN, 'Unknown')).toBe('Unknown');
    expect(toDisplayString(Infinity, 'Unknown')).toBe('Unknown');
    expect(toDisplayString(undefined)).toBe('');
  });

  it('extracts a meaningful field from objects instead of "[object Object]"', () => {
    expect(toDisplayString({ name: 'Runtime Manager' }, 'Unknown')).toBe('Runtime Manager');
    expect(toDisplayString({ displayName: 'Prod' }, 'Unknown')).toBe('Prod');
    expect(toDisplayString({ label: 'Create' }, 'Unknown')).toBe('Create');
    expect(toDisplayString({ title: 'Deploy' }, 'Unknown')).toBe('Deploy');
    expect(toDisplayString({ value: 'Update' }, 'Unknown')).toBe('Update');
    expect(toDisplayString({ email: 'a@b.com' }, 'Unknown')).toBe('a@b.com');
    expect(toDisplayString({ id: 'abc-123' }, 'Unknown')).toBe('abc-123');
  });

  it('prefers name over the other object keys', () => {
    expect(toDisplayString({ id: 'abc-123', email: 'a@b.com', name: 'Ada' }, 'Unknown')).toBe('Ada');
    expect(toDisplayString({ id: 'abc-123', email: 'a@b.com' }, 'Unknown')).toBe('a@b.com');
  });

  it('falls back for objects with no meaningful field, and never yields "[object Object]"', () => {
    expect(toDisplayString({}, 'Unknown')).toBe('Unknown');
    expect(toDisplayString({ foo: 'bar', baz: 1 }, 'Unknown')).toBe('Unknown');
    expect(toDisplayString({ name: null, id: undefined }, 'Unknown')).toBe('Unknown');
    expect(toDisplayString({ foo: 'bar' }, 'Unknown')).not.toContain('[object');
  });

  it('resolves nested objects one level deeper', () => {
    expect(toDisplayString({ name: { value: 'Nested' } }, 'Unknown')).toBe('Nested');
  });

  it('does not recurse without bound on deeply nested or cyclic objects', () => {
    const cyclic: any = { name: {} };
    cyclic.name.name = cyclic;
    expect(toDisplayString(cyclic, 'Unknown')).toBe('Unknown');
  });

  it('joins arrays sensibly and drops empty members', () => {
    expect(toDisplayString(['CloudHub', 'Exchange'], 'Unknown')).toBe('CloudHub, Exchange');
    expect(toDisplayString([{ name: 'Ada' }, { name: 'Grace' }], 'Unknown')).toBe('Ada, Grace');
    expect(toDisplayString(['CloudHub', null, undefined, {}], 'Unknown')).toBe('CloudHub');
    expect(toDisplayString([1, 2], 'Unknown')).toBe('1, 2');
    expect(toDisplayString([], 'Unknown')).toBe('Unknown');
    expect(toDisplayString([null, {}], 'Unknown')).toBe('Unknown');
  });

  it('renders Dates as ISO strings', () => {
    expect(toDisplayString(new Date('2026-07-29T10:00:00.000Z'), '')).toBe('2026-07-29T10:00:00.000Z');
    expect(toDisplayString(new Date('nope'), 'Unknown')).toBe('Unknown');
  });

  it('falls back for values that can never be rendered', () => {
    expect(toDisplayString(() => 'x', 'Unknown')).toBe('Unknown');
    expect(toDisplayString(Symbol('s'), 'Unknown')).toBe('Unknown');
  });
});

// ---------------------------------------------------------------
// Entry normalization — the actual crash
// ---------------------------------------------------------------

describe('audit entry normalization', () => {
  it('yields a renderable string when `action` is an object (the render crash)', async () => {
    const entry = await normalizeOne({ action: { name: 'Deployed' }, timestamp: '2026-07-29T10:00:00Z' });
    expect(entry.action).toBe('Deployed');
    expect(typeof entry.action).toBe('string');
    expect(entry.action).not.toBe('[object Object]');
  });

  it('falls back to the chain default when an object field has nothing renderable', async () => {
    const entry = await normalizeOne({ action: { weird: true } });
    expect(entry.action).toBe('Unknown');
  });

  it('never leaves a non-string in any string-typed field', async () => {
    const entry = await normalizeOne({
      id: { id: 'audit-1' },
      action: { name: 'Update' },
      platform: ['CloudHub', 'Exchange'],
      objectType: { type: 'Application' },
      objectId: 12345,
      userName: { user: { name: 'x' } },
      userId: null,
      timestamp: new Date('2026-07-29T10:00:00.000Z'),
      environmentId: true,
      environmentName: [{ name: 'Production' }],
    });

    for (const field of STRING_FIELDS) {
      expect(typeof entry[field]).toBe('string');
      expect(entry[field]).not.toBe('[object Object]');
    }

    expect(entry.id).toBe('audit-1');
    expect(entry.platform).toBe('CloudHub, Exchange');
    expect(entry.objectType).toBe(''); // { type: ... } has no display key
    expect(entry.objectId).toBe('12345');
    expect(entry.userName).toBe('');
    expect(entry.userId).toBe('');
    expect(entry.timestamp).toBe('2026-07-29T10:00:00.000Z');
    expect(entry.environmentId).toBe('true');
    expect(entry.environmentName).toBe('Production');
  });

  it('keeps the existing fallback chains and their precedence', async () => {
    const entry = await normalizeOne({
      auditId: 'from-auditId',
      actionName: 'from-actionName',
      platformName: 'from-platformName',
      type: 'from-type',
      objectName: 'from-objectName',
      userEmail: 'from-userEmail',
      user: { id: 'from-user-id', name: 'from-user-name' },
      createdAt: 'from-createdAt',
    });

    expect(entry.id).toBe('from-auditId');
    expect(entry.action).toBe('from-actionName');
    expect(entry.platform).toBe('from-platformName');
    expect(entry.objectType).toBe('from-type');
    expect(entry.objectId).toBe('from-objectName');
    expect(entry.userName).toBe('from-userEmail');
    expect(entry.userId).toBe('from-user-id');
    expect(entry.timestamp).toBe('from-createdAt');
  });

  it('prefers the primary field over the later links in the chain', async () => {
    const entry = await normalizeOne({
      id: 'primary-id',
      auditId: 'secondary',
      action: 'Create',
      actionName: 'secondary',
      platform: 'CloudHub',
      platformName: 'secondary',
      objectType: 'Application',
      type: 'secondary',
      objectId: 'obj-1',
      objectName: 'secondary',
      userName: 'Ada',
      userEmail: 'secondary@example.com',
      userId: 'user-1',
      timestamp: '2026-07-29T10:00:00Z',
      createdAt: 'secondary',
    });

    expect(entry).toMatchObject({
      id: 'primary-id',
      action: 'Create',
      platform: 'CloudHub',
      objectType: 'Application',
      objectId: 'obj-1',
      userName: 'Ada',
      userId: 'user-1',
      timestamp: '2026-07-29T10:00:00Z',
    });
  });

  it('falls back to the composed id seed when no id is present', async () => {
    const entry = await normalizeOne({
      action: { name: 'Deploy' },
      objectId: { id: 'obj-9' },
      timestamp: '2026-07-29T10:00:00Z',
    });
    expect(entry.id).toBe('2026-07-29T10:00:00Z-Deploy-obj-9');
    expect(entry.id).not.toContain('[object');
  });

  it('uses the defaults for a completely empty record', async () => {
    const entry = await normalizeOne({});
    expect(entry).toMatchObject({
      id: 'ts-action-object',
      action: 'Unknown',
      platform: '',
      objectType: '',
      objectId: '',
      userName: '',
      userId: '',
      timestamp: '',
      environmentId: '',
      environmentName: '',
    });
    expect(entry.payload).toBeUndefined();
  });

  it('survives null entries in the response array', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { data: [null, 'oops'], total: 2 } });
    const result = await queryAuditLogs(ORG_ID);
    expect(result.data).toHaveLength(2);
    for (const entry of result.data) {
      for (const field of STRING_FIELDS) {
        expect(typeof entry[field]).toBe('string');
      }
    }
  });

  it('preserves payload as an object (only its keys are rendered)', async () => {
    const payload = { targetName: { name: 'nested' }, count: 3, nested: { a: 1 } };
    const entry = await normalizeOne({ action: 'Update', payload });
    expect(entry.payload).toEqual(payload);
    expect(typeof entry.payload).toBe('object');
    expect(Object.keys(entry.payload!)).toEqual(['targetName', 'count', 'nested']);
  });

  it('keeps the payload fallback chain (payload -> properties -> details)', async () => {
    expect((await normalizeOne({ properties: { a: 1 } })).payload).toEqual({ a: 1 });
    expect((await normalizeOne({ details: { b: 2 } })).payload).toEqual({ b: 2 });
    expect((await normalizeOne({ payload: { c: 3 }, properties: { d: 4 } })).payload).toEqual({ c: 3 });
  });
});
