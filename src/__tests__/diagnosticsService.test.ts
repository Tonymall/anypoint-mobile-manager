/**
 * CloudHub instance-diagnostics service tests.
 *
 * The live endpoints return a mix of 200 / 404 / 503 during normal
 * operation, so the service must normalize all of them and never throw.
 */

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
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
  getAnalysisReadiness,
  getInstanceDiagnosis,
  getRecentDiagnoses,
  resetDiagnosticsSessionFlags,
} from '../services/diagnosticsService';

const mockGet = api.get as unknown as jest.Mock;
const mockLogger = logger as unknown as { log: jest.Mock; warn: jest.Mock };

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: null },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDiagnosticsSessionFlags();
  (api as any).defaults.headers.common = {
    'X-ANYPNT-ORG-ID': 'org-123',
    'X-ANYPNT-ENV-ID': 'env-456',
  };
});

describe('getInstanceDiagnosis', () => {
  it('maps a 200 response to "available" and parses known fields', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        summary: 'Application ran out of memory',
        reason: 'Heap exhausted',
        recommendation: 'Increase the worker size',
        severity: 'CRITICAL',
        category: 'RESOURCE',
      },
    });

    const result = await getInstanceDiagnosis('my-app', 'abc123-0');

    expect(result.status).toBe('available');
    expect(result.instanceId).toBe('abc123-0');
    expect(result.analysis?.summary).toBe('Application ran out of memory');
    expect(result.analysis?.reason).toBe('Heap exhausted');
    expect(result.analysis?.recommendation).toBe('Increase the worker size');
    expect(result.analysis?.severity).toBe('CRITICAL');
    expect(result.analysis?.category).toBe('RESOURCE');
  });

  it('requests the org/env scoped diagnostics path', async () => {
    mockGet.mockResolvedValueOnce({ data: { summary: 'ok' } });

    await getInstanceDiagnosis('my-app', 'abc123-0');

    expect(mockGet).toHaveBeenCalledWith(
      '/cloudhub/api/v2/organizations/org-123/environments/env-456/applications/my-app/instances/abc123-0/diagnostics/analysis',
    );
  });

  it('maps 404 to "none" without throwing', async () => {
    mockGet.mockRejectedValueOnce(httpError(404));

    const result = await getInstanceDiagnosis('my-app', 'abc123-0');

    expect(result).toEqual({ instanceId: 'abc123-0', status: 'none' });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('maps 503 to "unavailable" without warning (it is expected)', async () => {
    mockGet.mockRejectedValueOnce(httpError(503));

    const result = await getInstanceDiagnosis('my-app', 'abc123-0');

    expect(result).toEqual({ instanceId: 'abc123-0', status: 'unavailable' });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('maps a network error to "unavailable" and logs a warning', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network Error'));

    await expect(getInstanceDiagnosis('my-app', 'abc123-0')).resolves.toEqual({
      instanceId: 'abc123-0',
      status: 'unavailable',
    });
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('returns "unavailable" without a request when org/env context is missing', async () => {
    (api as any).defaults.headers.common = {};

    const result = await getInstanceDiagnosis('my-app', 'abc123-0');

    expect(result.status).toBe('unavailable');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('parses an unexpected body shape defensively and keeps the raw payload', async () => {
    const weird = {
      unexpected: { nesting: [1, 2, 3] },
      details: { deeply: { message: 'Restart loop detected' } },
      severity: 42,
      recommendations: ['Scale up', 'Check the logs'],
    };
    mockGet.mockResolvedValueOnce({ data: weird });

    const result = await getInstanceDiagnosis('my-app', 'abc123-0');

    expect(result.status).toBe('available');
    // Unknown fields must not throw, and unmatched fields stay null.
    expect(result.analysis?.summary).toBeNull();
    expect(result.analysis?.message).toBe('Restart loop detected');
    expect(result.analysis?.severity).toBe('42');
    expect(result.analysis?.recommendation).toBe('Scale up; Check the logs');
    expect(result.analysis?.raw).toBe(weird);
  });

  it('treats an empty 200 body as "none"', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    await expect(getInstanceDiagnosis('my-app', 'abc123-0')).resolves.toEqual({
      instanceId: 'abc123-0',
      status: 'none',
    });
  });

  it('does not throw on a non-object payload', async () => {
    mockGet.mockResolvedValueOnce({ data: 'analysis pending' });
    const result = await getInstanceDiagnosis('my-app', 'abc123-0');
    expect(result.status).toBe('available');
    expect(result.analysis?.raw).toBe('analysis pending');
  });
});

describe('getAnalysisReadiness', () => {
  it('normalizes a readiness payload', async () => {
    mockGet.mockResolvedValueOnce({
      data: { ready: true, instances: [{ instanceId: 'abc123-0', ready: true }] },
    });

    const result = await getAnalysisReadiness('my-app');

    expect(result.status).toBe('available');
    expect(result.ready).toBe(true);
    expect(result.readyInstanceIds).toEqual(['abc123-0']);
    expect(mockGet).toHaveBeenCalledWith(
      '/cloudhub/api/v2/organizations/org-123/environments/env-456/applications/my-app/instances/diagnostics/analysis-readiness',
    );
  });

  it('maps 404 to "none" and skips the endpoint for the rest of the session', async () => {
    mockGet.mockRejectedValueOnce(httpError(404));

    const first = await getAnalysisReadiness('my-app');
    const second = await getAnalysisReadiness('my-app');

    expect(first.status).toBe('none');
    expect(second.status).toBe('none');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('re-probes when the domain changes', async () => {
    mockGet.mockRejectedValueOnce(httpError(404));
    await getAnalysisReadiness('app-a');

    mockGet.mockResolvedValueOnce({ data: { ready: false } });
    const result = await getAnalysisReadiness('app-b');

    expect(result.status).toBe('available');
    expect(result.ready).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('maps 503 to "unavailable" without throwing', async () => {
    mockGet.mockRejectedValueOnce(httpError(503));
    const result = await getAnalysisReadiness('my-app');
    expect(result.status).toBe('unavailable');
    expect(result.ready).toBeNull();
  });
});

describe('getRecentDiagnoses', () => {
  it('caps the probe list, logs the truncation, and returns only available diagnoses', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `inst-${i}`);
    mockGet.mockImplementation((url: string) => {
      if (url.includes('inst-0')) return Promise.resolve({ data: { summary: 'OOM' } });
      if (url.includes('inst-1')) return Promise.reject(httpError(404));
      if (url.includes('inst-2')) return Promise.reject(httpError(503));
      return Promise.resolve({ data: {} });
    });

    const result = await getRecentDiagnoses('my-app', ids);

    expect(result.requested).toBe(12);
    expect(result.probed).toBe(5); // default max
    expect(result.truncated).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(5);
    expect(result.diagnoses).toHaveLength(1);
    expect(result.diagnoses[0].instanceId).toBe('inst-0');
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('probing only 5 of 12'));
  });

  it('honours a custom max and does not report truncation when the list fits', async () => {
    mockGet.mockResolvedValue({ data: { summary: 'fine' } });

    const result = await getRecentDiagnoses('my-app', ['a', 'b'], { max: 5 });

    expect(result.probed).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.diagnoses).toHaveLength(2);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('keeps concurrency bounded', async () => {
    const ids = Array.from({ length: 9 }, (_, i) => `inst-${i}`);
    let inFlight = 0;
    let peakInFlight = 0;

    mockGet.mockImplementation(() => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve({ data: { summary: 'ok' } });
        }, 5);
      });
    });

    const result = await getRecentDiagnoses('my-app', ids, { max: 9, concurrency: 3 });

    expect(result.probed).toBe(9);
    expect(mockGet).toHaveBeenCalledTimes(9);
    expect(peakInFlight).toBeLessThanOrEqual(3);
    expect(peakInFlight).toBeGreaterThan(1);
  });

  it('never fans out beyond the cap even for a huge instance list', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `inst-${i}`);
    mockGet.mockResolvedValue({ data: {} });

    await getRecentDiagnoses('my-app', ids, { max: 3, concurrency: 3 });

    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('returns an empty result for an empty instance list without any request', async () => {
    const result = await getRecentDiagnoses('my-app', []);
    expect(result).toEqual({
      domain: 'my-app',
      diagnoses: [],
      probed: 0,
      requested: 0,
      truncated: false,
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
});
