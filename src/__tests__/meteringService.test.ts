/**
 * Metering / Usage Reports service tests.
 *
 * Two production failures are pinned here:
 *  - the live API rejects `TIMESERIES P1M` beyond 61 days
 *    (HTTP 400 "Query duration more than 61 days for P1M"), which broke the
 *    90d and 365d ranges outright;
 *  - the unbounded per-meter fan-out earned HTTP 429s.
 */

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
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
import logger from '../utils/logger';
import {
  DEFAULT_METERING_CONCURRENCY,
  MAX_P1M_WINDOW_MS,
  computeRetryDelayMs,
  getUsageReportBundle,
  getUsageReportCategories,
  mergeUsageResults,
  planUsageQueryWindows,
  searchUsage,
  selectTimeSeriesGranularity,
  type UsageSearchResult,
} from '../services/meteringService';

const mockPost = api.post as unknown as jest.Mock;
const mockLogger = logger as unknown as { warn: jest.Mock };

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;
const CATEGORY_COUNT = getUsageReportCategories().length;
/** Keep retry backoff effectively instant in tests. */
const FAST = { retryBaseDelayMs: 1, maxRetryDelayMs: 2 };

function httpError(status: number, headers: Record<string, string> = {}) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, headers, data: { message: `status ${status}` } },
  });
}

function rangeOf(days: number): { from: number; to: number } {
  return { from: NOW - days * DAY_MS, to: NOW };
}

function okResponse(rows: Array<Record<string, unknown>> = []) {
  return { data: { metadata: { lastUpdatedAt: '2026-07-01T00:00:00Z' }, data: rows } };
}

function postedQueries(): string[] {
  return mockPost.mock.calls.map((call) => call[1].query as string);
}

/** Pull the `between '<from>' and '<to>'` bounds back out of an emitted query. */
function boundsOf(query: string): { from: number; to: number } {
  const match = query.match(/between '(\d+)' and '(\d+)'/);
  if (!match) throw new Error(`no bounds in query: ${query}`);
  return { from: Number(match[1]), to: Number(match[2]) };
}

function result(
  rows: Array<Record<string, unknown>>,
  lastUpdatedAt: string | null = null,
): UsageSearchResult {
  return { metadata: { responseAsOf: null, lastUpdatedAt }, data: rows };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('granularity and window planning', () => {
  it('uses P1M for any window inside the 61-day cap', () => {
    expect(selectTimeSeriesGranularity(30 * DAY_MS)).toBe('P1M');
    expect(selectTimeSeriesGranularity(MAX_P1M_WINDOW_MS)).toBe('P1M');
  });

  it('reports that no single-request granularity covers a longer window', () => {
    expect(selectTimeSeriesGranularity(MAX_P1M_WINDOW_MS + 1)).toBeNull();
    expect(selectTimeSeriesGranularity(365 * DAY_MS)).toBeNull();
  });

  it('plans a single window for 30d', () => {
    const { from, to } = rangeOf(30);
    expect(planUsageQueryWindows(from, to)).toEqual([{ from, to, granularity: 'P1M' }]);
  });

  it('chunks 90d into two sub-cap windows', () => {
    const { from, to } = rangeOf(90);
    const windows = planUsageQueryWindows(from, to);

    expect(windows).toHaveLength(2);
    expect(windows[0].from).toBe(from);
    expect(windows[windows.length - 1].to).toBe(to);
    windows.forEach((window) => {
      expect(window.granularity).toBe('P1M');
      expect(window.to - window.from).toBeLessThan(MAX_P1M_WINDOW_MS);
    });
  });

  it('chunks 365d into contiguous, non-overlapping sub-cap windows', () => {
    const { from, to } = rangeOf(365);
    const windows = planUsageQueryWindows(from, to);

    expect(windows).toHaveLength(6);
    expect(windows[0].from).toBe(from);
    expect(windows[windows.length - 1].to).toBe(to);
    windows.forEach((window, index) => {
      expect(window.to - window.from).toBeLessThan(MAX_P1M_WINDOW_MS);
      if (index > 0) {
        // exactly 1ms after the previous end: no gap, no double-counted bucket
        expect(window.from).toBe(windows[index - 1].to + 1);
      }
    });
  });
});

describe('getUsageReportBundle request shape', () => {
  it('never issues a P1M query wider than 61 days, for any range', async () => {
    for (const days of [30, 90, 365]) {
      mockPost.mockReset();
      mockPost.mockResolvedValue(okResponse());
      const { from, to } = rangeOf(days);

      await getUsageReportBundle(from, to, FAST);

      const queries = postedQueries();
      expect(queries.length).toBeGreaterThan(0);
      queries.forEach((query) => {
        expect(query).toContain('TIMESERIES P1M');
        expect(query).not.toContain('$GRANULARITY');
        expect(query).not.toContain('$FROM');
        const bounds = boundsOf(query);
        expect(bounds.to - bounds.from).toBeLessThanOrEqual(MAX_P1M_WINDOW_MS);
      });
    }
  });

  it('issues one aggregate + one detail query per category per chunk', async () => {
    mockPost.mockResolvedValue(okResponse());
    const { from, to } = rangeOf(90);

    await getUsageReportBundle(from, to, FAST);

    expect(mockPost).toHaveBeenCalledTimes(CATEGORY_COUNT * 2 * 2);
  });

  it('returns a section per category for a 365d range instead of failing', async () => {
    mockPost.mockResolvedValue(okResponse([{ timestamp: NOW, mule_message_count: 5 }]));
    const { from, to } = rangeOf(365);

    const sections = await getUsageReportBundle(from, to, FAST);

    expect(sections).toHaveLength(CATEGORY_COUNT);
    expect(sections.every((section) => section.status === 'available')).toBe(true);
  });
});

describe('merge correctness', () => {
  it('sums count measurements across chunks for the same dimension tuple', () => {
    const merged = mergeUsageResults(
      [
        result([{ timestamp: 1, app_name: 'orders', mule_message_count: 10 }], '2026-01-01T00:00:00Z'),
        result([{ timestamp: 1, app_name: 'orders', mule_message_count: 7 }], '2026-03-01T00:00:00Z'),
      ],
      { strategy: 'sum', summaryMetric: 'mule_message_count' },
    );

    expect(merged.data).toEqual([{ timestamp: 1, app_name: 'orders', mule_message_count: 17 }]);
    expect(merged.metadata.lastUpdatedAt).toBe('2026-03-01T00:00:00Z');
  });

  it('keeps distinct dimension tuples and buckets apart', () => {
    const merged = mergeUsageResults(
      [
        result([{ timestamp: 1, app_name: 'orders', api_requests: 3 }]),
        result([
          { timestamp: 2, app_name: 'orders', api_requests: 4 },
          { timestamp: 1, app_name: 'billing', api_requests: 5 },
        ]),
      ],
      { strategy: 'sum', summaryMetric: 'api_requests' },
    );

    expect(merged.data).toHaveLength(3);
  });

  it('takes the peak row whole for concurrency meters, never the sum', () => {
    const merged = mergeUsageResults(
      [
        result([{ mule_flow_count: 12, max_concurrent_time: 111 }]),
        result([{ mule_flow_count: 30, max_concurrent_time: 222 }]),
        result([{ mule_flow_count: 4, max_concurrent_time: 333 }]),
      ],
      { strategy: 'max', summaryMetric: 'mule_flow_count', collapseTimestamps: true },
    );

    expect(merged.data).toEqual([{ mule_flow_count: 30, max_concurrent_time: 222 }]);
  });

  it('rolls every bucket of an aggregate series into one row', () => {
    const merged = mergeUsageResults(
      [
        result([
          { timestamp: 1, mule_message_count: 2 },
          { timestamp: 2, mule_message_count: 3 },
        ]),
        result([{ timestamp: 3, mule_message_count: 4 }]),
      ],
      { strategy: 'sum', summaryMetric: 'mule_message_count', collapseTimestamps: true },
    );

    expect(merged.data).toEqual([{ mule_message_count: 9 }]);
  });

  it('produces a whole-range aggregate for a chunked 365d bundle', async () => {
    mockPost.mockImplementation((_url: string, body: { query: string }) => {
      if (!body.query.includes('runtime_mule_message_count')) return Promise.resolve(okResponse());
      const { from } = boundsOf(body.query);
      return Promise.resolve(okResponse([{ timestamp: from, mule_message_count: 100 }]));
    });

    const { from, to } = rangeOf(365);
    const sections = await getUsageReportBundle(from, to, FAST);
    const messages = sections.find((section) => section.category.id === 'runtime-messages');

    // six chunks x 100 messages, folded into the single row the screen reads
    expect(messages?.aggregate.data).toEqual([{ mule_message_count: 600 }]);
    expect(messages?.detail.data).toHaveLength(6);
  });
});

describe('bounded concurrency', () => {
  it('never exceeds the default cap across the whole fan-out', async () => {
    let inFlight = 0;
    let peak = 0;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve(okResponse());
          }, 2);
        }),
    );

    const { from, to } = rangeOf(365);
    await getUsageReportBundle(from, to, FAST);

    expect(peak).toBeLessThanOrEqual(DEFAULT_METERING_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it('honours an explicit concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve(okResponse());
          }, 2);
        }),
    );

    const { from, to } = rangeOf(30);
    await getUsageReportBundle(from, to, { ...FAST, concurrency: 2 });

    expect(peak).toBeLessThanOrEqual(2);
    expect(mockPost).toHaveBeenCalledTimes(CATEGORY_COUNT * 2);
  });
});

describe('429 retry and backoff', () => {
  it('retries a throttled request and succeeds', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce(okResponse([{ api_requests: 1 }]));

    const search = await searchUsage('SELECT 1', FAST);

    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(search.data).toEqual([{ api_requests: 1 }]);
  });

  it('gives up after a bounded number of retries', async () => {
    mockPost.mockRejectedValue(httpError(429));

    await expect(searchUsage('SELECT 1', { ...FAST, maxRetries: 2 })).rejects.toThrow();
    expect(mockPost).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it('backs off exponentially, capped', () => {
    expect(computeRetryDelayMs(httpError(429), 0, 500, 8000)).toBe(500);
    expect(computeRetryDelayMs(httpError(429), 1, 500, 8000)).toBe(1000);
    expect(computeRetryDelayMs(httpError(429), 2, 500, 8000)).toBe(2000);
    expect(computeRetryDelayMs(httpError(429), 9, 500, 8000)).toBe(8000);
  });

  it('respects a Retry-After header and still clamps it', () => {
    expect(computeRetryDelayMs(httpError(429, { 'retry-after': '3' }), 0, 500, 8000)).toBe(3000);
    expect(computeRetryDelayMs(httpError(429, { 'Retry-After': '2' }), 0, 500, 8000)).toBe(2000);
    // a hostile header must not stall the screen
    expect(computeRetryDelayMs(httpError(429, { 'retry-after': '99999' }), 0, 500, 8000)).toBe(8000);
  });

  it('never retries a 400 - the query is permanently wrong', async () => {
    mockPost.mockRejectedValue(httpError(400));

    await expect(searchUsage('SELECT 1', FAST)).rejects.toThrow();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 400 anywhere in the bundle fan-out', async () => {
    mockPost.mockRejectedValue(httpError(400));
    const { from, to } = rangeOf(30);

    const sections = await getUsageReportBundle(from, to, FAST);

    expect(mockPost).toHaveBeenCalledTimes(CATEGORY_COUNT * 2);
    expect(sections.every((section) => section.status === 'unavailable')).toBe(true);
  });
});

describe('graceful degradation', () => {
  it('marks only the failing meter unavailable and keeps the rest of the screen', async () => {
    mockPost.mockImplementation((_url: string, body: { query: string }) => {
      if (body.query.includes('governed_api_count')) {
        return Promise.reject(httpError(403));
      }
      return Promise.resolve(okResponse([{ api_requests: 2 }]));
    });

    const { from, to } = rangeOf(90);
    const sections = await getUsageReportBundle(from, to, FAST);

    const governance = sections.find((section) => section.category.id === 'governance');
    expect(governance?.status).toBe('unavailable');
    expect(governance?.error).toContain('403');
    expect(governance?.aggregate.data).toEqual([]);
    expect(governance?.detail.data).toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('governance'));

    const others = sections.filter((section) => section.category.id !== 'governance');
    expect(others).toHaveLength(CATEGORY_COUNT - 1);
    expect(others.every((section) => section.status === 'available')).toBe(true);
  });

  it('resolves rather than rejecting when every meter fails', async () => {
    mockPost.mockRejectedValue(httpError(500));
    const { from, to } = rangeOf(30);

    const sections = await getUsageReportBundle(from, to, FAST);

    expect(sections).toHaveLength(CATEGORY_COUNT);
    expect(sections.every((section) => section.status === 'unavailable')).toBe(true);
  });
});
