/**
 * CloudHub Notification Service Tests
 *
 * `/cloudhub/api/notifications/count` answers with a BARE NUMBER as
 * `text/plain`. The shared axios instance sends `Accept: application/json`,
 * so the server replies 406 Not Acceptable and the unread badge silently
 * reads 0. The count request must therefore opt into a permissive Accept
 * header, parse every observed body shape, and degrade to 0 on failure.
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
import { getNotificationCount, getNotifications } from '../services/cloudHubNotificationService';

const COUNT_PATH = '/cloudhub/api/notifications/count';

const mockedApi = api as unknown as { get: jest.Mock; post: jest.Mock };

function axiosError(status: number): any {
  const error: any = new Error(`Request failed with status code ${status}`);
  error.response = { status };
  return error;
}

function lastGetConfig(): any {
  const call = mockedApi.get.mock.calls[mockedApi.get.mock.calls.length - 1];
  return call[1];
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// Accept header (the 406)
// ---------------------------------------------------------------

describe('getNotificationCount — request', () => {
  it('sends a permissive Accept header so the text/plain body is not rejected with 406', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: 4 });
    await getNotificationCount();

    expect(mockedApi.get).toHaveBeenCalledWith(COUNT_PATH, expect.objectContaining({
      headers: expect.objectContaining({ Accept: '*/*' }),
    }));
    expect(lastGetConfig().headers.Accept).not.toMatch(/application\/json/);
  });

  it('keeps the status filter and cache-buster params', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: 0 });
    await getNotificationCount('read');

    const config = lastGetConfig();
    expect(config.params.status).toBe('read');
    expect(typeof config.params._).toBe('number');
  });

  it('defaults to the unread status', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: 0 });
    await getNotificationCount();
    expect(lastGetConfig().params.status).toBe('unread');
  });

  it('does not mutate the global axios defaults', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: 1 });
    await getNotificationCount();
    expect((api as any).defaults.headers.common.Accept).toBeUndefined();
  });

  it('leaves the notification list request untouched', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { data: [] } });
    await getNotifications({ status: 'unread' });
    expect(mockedApi.get).toHaveBeenCalledWith('/cloudhub/api/notifications', {
      params: { status: 'unread' },
    });
  });
});

// ---------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------

describe('getNotificationCount — response parsing', () => {
  it('parses a bare number (the text/plain body)', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: 7 });
    await expect(getNotificationCount()).resolves.toBe(7);
  });

  it('parses a numeric string', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: '12' });
    await expect(getNotificationCount()).resolves.toBe(12);
  });

  it('parses a { count: n } object', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { count: 3 } });
    await expect(getNotificationCount()).resolves.toBe(3);
  });

  it('parses a { count: "n" } object with a stringified count', async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { count: '5' } });
    await expect(getNotificationCount()).resolves.toBe(5);
  });

  it('returns 0 for zero, null and unrecognized bodies', async () => {
    for (const data of [0, '0', null, undefined, '', 'not-a-number', {}, { total: 9 }]) {
      mockedApi.get.mockResolvedValueOnce({ data });
      await expect(getNotificationCount()).resolves.toBe(0);
    }
  });
});

// ---------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------

describe('getNotificationCount — resilience', () => {
  it.each([403, 404, 405, 406, 500, 503])('returns 0 on HTTP %s instead of throwing', async (status) => {
    mockedApi.get.mockRejectedValueOnce(axiosError(status));
    await expect(getNotificationCount()).resolves.toBe(0);
  });

  it('returns 0 on a network error', async () => {
    mockedApi.get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(getNotificationCount()).resolves.toBe(0);
  });
});
