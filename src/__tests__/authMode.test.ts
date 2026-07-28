import {
  authState,
  resolveRequestAuth,
  type StoredCredentialReader,
} from '../services/authMode';

function reader(overrides: Partial<StoredCredentialReader> = {}): StoredCredentialReader {
  return {
    getAccessToken: jest.fn().mockResolvedValue(null),
    getSessionMode: jest.fn().mockResolvedValue(null),
    getXsrfToken: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

beforeEach(() => {
  authState.token = null;
  authState.sessionMode = false;
  authState.xsrfToken = null;
});

describe('resolveRequestAuth', () => {
  it('skips auth entirely for login requests', async () => {
    const store = reader();
    const auth = await resolveRequestAuth('/accounts/login', store);
    expect(auth).toEqual({ kind: 'login' });
    expect(store.getAccessToken).not.toHaveBeenCalled();
  });

  it('uses the in-memory bearer token without hitting the store', async () => {
    authState.token = 'mem-token';
    authState.sessionMode = true;
    const store = reader();
    const auth = await resolveRequestAuth('/cloudhub/api/v2/applications', store);
    expect(auth).toEqual({ kind: 'bearer', token: 'mem-token' });
    expect(authState.sessionMode).toBe(false);
    expect(store.getAccessToken).not.toHaveBeenCalled();
  });

  it('falls back to the stored access token and caches it in memory', async () => {
    const store = reader({
      getAccessToken: jest.fn().mockResolvedValue('stored-token'),
    });
    const auth = await resolveRequestAuth('/armui/api/v1/servers', store);
    expect(auth).toEqual({ kind: 'bearer', token: 'stored-token' });
    expect(authState.token).toBe('stored-token');
    expect(authState.sessionMode).toBe(false);
  });

  it('enters session mode from persisted state and caches the xsrf token', async () => {
    const store = reader({
      getSessionMode: jest.fn().mockResolvedValue('true'),
      getXsrfToken: jest.fn().mockResolvedValue('xsrf-1'),
    });
    const auth = await resolveRequestAuth('/cloudhub/api/v2/applications', store);
    expect(auth).toEqual({ kind: 'session', xsrfToken: 'xsrf-1' });
    expect(authState.sessionMode).toBe(true);
    expect(authState.xsrfToken).toBe('xsrf-1');
  });

  it('trusts in-memory session mode without re-reading the persisted flag', async () => {
    authState.sessionMode = true;
    authState.xsrfToken = 'xsrf-mem';
    const store = reader();
    const auth = await resolveRequestAuth('/cloudhub/api/v2/applications', store);
    expect(auth).toEqual({ kind: 'session', xsrfToken: 'xsrf-mem' });
    expect(store.getSessionMode).not.toHaveBeenCalled();
    expect(store.getXsrfToken).not.toHaveBeenCalled();
  });

  it('returns none when no credentials exist anywhere', async () => {
    const auth = await resolveRequestAuth('/cloudhub/api/v2/applications', reader());
    expect(auth).toEqual({ kind: 'none' });
    expect(authState.token).toBeNull();
    expect(authState.sessionMode).toBe(false);
  });

  it('returns none when the secure store read fails', async () => {
    const store = reader({
      getAccessToken: jest.fn().mockRejectedValue(new Error('keychain unavailable')),
    });
    const auth = await resolveRequestAuth('/cloudhub/api/v2/applications', store);
    expect(auth).toEqual({ kind: 'none' });
  });

  it('bearer token wins over an active session mode', async () => {
    authState.sessionMode = true;
    authState.xsrfToken = 'xsrf-mem';
    const store = reader({
      getAccessToken: jest.fn().mockResolvedValue('stored-token'),
    });
    const auth = await resolveRequestAuth('/cloudhub/api/v2/applications', store);
    expect(auth).toEqual({ kind: 'bearer', token: 'stored-token' });
    expect(authState.sessionMode).toBe(false);
  });
});
