/**
 * Insights Service Tests
 *
 * Covers the AMQL contract captured from the Anypoint console
 * (POST /observability/api/v1/metrics:search), identifier validation,
 * error-rate computation, and graceful degradation when the
 * observability API is unavailable.
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
import {
  DEFAULT_DETAIL_LIMIT,
  DEFAULT_OVERVIEW_LIMIT,
  InsightsQueryError,
  OBSERVABILITY_SEARCH_PATH,
  buildEntityErrorCountsQuery,
  buildEntityOverviewQuery,
  buildEntityRequestTotalsQuery,
  buildEntityTimeSeriesQuery,
  buildSlowestEntitiesQuery,
  extractRows,
  getEntityErrorCounts,
  getEntityOverview,
  getEntityTimeSeries,
  getEstateHealth,
  getSlowestEntities,
  isInsightsUnavailable,
  isSafeAmqlId,
  resetInsightsSession,
  resolveInsightsScope,
  sanitizeEntityIds,
} from '../services/insightsService';
import { insightsKeys } from '../hooks/queries/useInsightsQueries';
import { useAuthStore } from '../stores/authStore';

const ORG_ID = '11111111-2222-3333-4444-555555555555';
const ENV_ID = '66666666-7777-8888-9999-000000000000';
const SCOPE = { orgId: ORG_ID, envId: ENV_ID };
const RANGE = { startMs: 1700000000000, endMs: 1700003600000 };

const mockedApi = api as unknown as { get: jest.Mock; post: jest.Mock };

function lastQuery(): string {
  const call = mockedApi.post.mock.calls[mockedApi.post.mock.calls.length - 1];
  return call[1].query;
}

function axiosError(status: number): any {
  const error: any = new Error(`Request failed with status code ${status}`);
  error.response = { status };
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetInsightsSession();
  useAuthStore.setState({
    isAuthenticated: true,
    currentOrganization: { id: ORG_ID, name: 'Business Group' } as any,
    currentEnvironment: { id: ENV_ID, name: 'Production' } as any,
  });
});

afterEach(() => {
  useAuthStore.setState({
    currentOrganization: null,
    currentEnvironment: null,
  });
});

// ---------------------------------------------------------------
// AMQL construction
// ---------------------------------------------------------------

describe('AMQL query construction', () => {
  it('builds the entity overview query exactly as the console does', () => {
    expect(buildEntityOverviewQuery(SCOPE, RANGE, 20)).toBe(
      'SELECT "entity.id" AS id, LATEST("entity.type") AS type, LATEST("entity.name") AS name, ' +
      'LATEST("sub_org.id") AS orgId, LATEST("sub_org.name") AS orgName, LATEST("env.id") AS envId, ' +
      'LATEST("env.name") AS envName, PERCENTILE("response_time", 0.99) AS p99RequestLatency, ' +
      'COUNT(requests) AS requestVolume, LATEST("deployment.type") AS deploymentType, ' +
      'LATEST("deployment.id") AS deploymentId FROM "mulesoft.entity" ' +
      `WHERE "sub_org.id" = '${ORG_ID}' AND "env.id" = '${ENV_ID}' ` +
      `AND timestamp BETWEEN ${RANGE.startMs} AND ${RANGE.endMs} ` +
      'GROUP BY id ORDER BY requestVolume DESC LIMIT 20',
    );
  });

  it('builds the slowest entities query', () => {
    expect(buildSlowestEntitiesQuery(SCOPE, RANGE, 60)).toBe(
      'SELECT "entity.id", LATEST("env.id") AS envIds, PERCENTILE("response_time", 0.99) AS p99RequestLatency ' +
      'FROM "mulesoft.entity" ' +
      `WHERE "sub_org.id" = '${ORG_ID}' AND "env.id" = '${ENV_ID}' ` +
      `AND timestamp BETWEEN ${RANGE.startMs} AND ${RANGE.endMs} ` +
      'GROUP BY "entity.id" ORDER BY p99RequestLatency DESC LIMIT 60',
    );
  });

  it('builds the error-count query with the FAILED status filter', () => {
    expect(buildEntityErrorCountsQuery(['id1', 'id2'], SCOPE, RANGE, 60)).toBe(
      'SELECT "entity.id" AS id, COUNT(requests) AS errorRequestCount FROM "mulesoft.entity" ' +
      `WHERE "entity.id" IN ('id1','id2') AND "entity.response.status" = 'FAILED' ` +
      `AND "sub_org.id" = '${ORG_ID}' AND "env.id" = '${ENV_ID}' ` +
      `AND timestamp BETWEEN ${RANGE.startMs} AND ${RANGE.endMs} ` +
      'GROUP BY "entity.id" LIMIT 60',
    );
  });

  it('builds the request time-series query (timestamp in SELECT buckets the result)', () => {
    expect(buildEntityTimeSeriesQuery(['id1'], SCOPE, RANGE)).toBe(
      'SELECT timestamp, COUNT(requests) AS requestVolume FROM "mulesoft.entity" ' +
      `WHERE "entity.id" IN ('id1') AND "sub_org.id" = '${ORG_ID}' AND "env.id" = '${ENV_ID}' ` +
      `AND timestamp BETWEEN ${RANGE.startMs} AND ${RANGE.endMs}`,
    );
  });

  it('adds the FAILED filter to the error time-series query', () => {
    expect(buildEntityTimeSeriesQuery(['id1'], SCOPE, RANGE, { failedOnly: true })).toBe(
      'SELECT timestamp, COUNT(requests) AS requestVolume FROM "mulesoft.entity" ' +
      `WHERE "entity.id" IN ('id1') AND "entity.response.status" = 'FAILED' ` +
      `AND "sub_org.id" = '${ORG_ID}' AND "env.id" = '${ENV_ID}' ` +
      `AND timestamp BETWEEN ${RANGE.startMs} AND ${RANGE.endMs}`,
    );
  });

  it('builds the total request volume query', () => {
    expect(buildEntityRequestTotalsQuery(['id1', 'id2'], SCOPE, RANGE, 60)).toBe(
      'SELECT "entity.id" AS id, COUNT(requests) AS totalRequestCount FROM "mulesoft.entity" ' +
      `WHERE "entity.id" IN ('id1','id2') AND "sub_org.id" = '${ORG_ID}' AND "env.id" = '${ENV_ID}' ` +
      `AND timestamp BETWEEN ${RANGE.startMs} AND ${RANGE.endMs} ` +
      'GROUP BY "entity.id" LIMIT 60',
    );
  });

  it('uses the documented default limits', () => {
    expect(DEFAULT_OVERVIEW_LIMIT).toBe(20);
    expect(DEFAULT_DETAIL_LIMIT).toBe(60);
    expect(buildEntityOverviewQuery(SCOPE, RANGE)).toContain('LIMIT 20');
    expect(buildSlowestEntitiesQuery(SCOPE, RANGE)).toContain('LIMIT 60');
  });

  it('posts to the metrics:search endpoint with offset/limit params', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: [] } });
    await getSlowestEntities(RANGE, 10);
    expect(mockedApi.post).toHaveBeenCalledWith(
      OBSERVABILITY_SEARCH_PATH,
      { query: expect.stringContaining('PERCENTILE("response_time", 0.99)') },
      { params: { offset: 0, limit: 10 } },
    );
  });
});

// ---------------------------------------------------------------
// Identifier validation / escaping rejection
// ---------------------------------------------------------------

describe('AMQL identifier validation', () => {
  it('accepts UUID-shaped ids and rejects anything with quotes or control chars', () => {
    expect(isSafeAmqlId(ORG_ID)).toBe(true);
    expect(isSafeAmqlId("id' OR 1=1 --")).toBe(false);
    expect(isSafeAmqlId('id"')).toBe(false);
    expect(isSafeAmqlId('id\\')).toBe(false);
    expect(isSafeAmqlId('id;DROP')).toBe(false);
    expect(isSafeAmqlId('id\nnewline')).toBe(false);
    expect(isSafeAmqlId('')).toBe(false);
    expect(isSafeAmqlId(undefined)).toBe(false);
    expect(isSafeAmqlId(42)).toBe(false);
  });

  it('throws instead of interpolating a malformed entity id', () => {
    expect(() => buildEntityErrorCountsQuery(["bad' OR '1'='1"], SCOPE, RANGE))
      .toThrow(InsightsQueryError);
    expect(() => buildEntityTimeSeriesQuery(['ok', 'ba"d'], SCOPE, RANGE))
      .toThrow(InsightsQueryError);
  });

  it('throws when the scope org/env id is malformed', () => {
    expect(() => buildEntityOverviewQuery({ orgId: "o'", envId: ENV_ID }, RANGE))
      .toThrow(InsightsQueryError);
    expect(() => buildSlowestEntitiesQuery({ orgId: ORG_ID, envId: 'e;1' }, RANGE))
      .toThrow(InsightsQueryError);
  });

  it('throws on non-numeric timestamps and invalid ranges', () => {
    expect(() => buildEntityOverviewQuery(SCOPE, { startMs: NaN, endMs: 1 } as any))
      .toThrow(InsightsQueryError);
    expect(() => buildEntityOverviewQuery(SCOPE, { startMs: 1, endMs: '0; DROP' } as any))
      .toThrow(InsightsQueryError);
    expect(() => buildEntityOverviewQuery(SCOPE, { startMs: 200, endMs: 100 }))
      .toThrow(InsightsQueryError);
  });

  it('sanitizeEntityIds drops unsafe ids and de-duplicates the rest', () => {
    expect(sanitizeEntityIds(['a', 'a', "b'", 'c', '', null as any])).toEqual(['a', 'c']);
  });

  it('never calls the API when every entity id is unsafe', async () => {
    const counts = await getEntityErrorCounts(["a'", 'b"'], RANGE);
    expect(counts).toEqual({});
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('queries only the safe subset when some ids are malformed', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: [] } });
    await getEntityErrorCounts(['good-id', "ba'd"], RANGE);
    expect(lastQuery()).toContain(`"entity.id" IN ('good-id')`);
    expect(lastQuery()).not.toContain('ba');
  });

  it('skips the query entirely when no org/env is selected', async () => {
    useAuthStore.setState({ currentOrganization: null, currentEnvironment: null });
    expect(resolveInsightsScope()).toBeNull();
    expect(await getEntityOverview(RANGE)).toEqual([]);
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('falls back to the axios org/env headers when the store is empty', () => {
    useAuthStore.setState({ currentOrganization: null, currentEnvironment: null });
    (api as any).defaults.headers.common['X-ANYPNT-ORG-ID'] = 'header-org';
    (api as any).defaults.headers.common['X-ANYPNT-ENV-ID'] = 'header-env';
    expect(resolveInsightsScope()).toEqual({ orgId: 'header-org', envId: 'header-env' });
    delete (api as any).defaults.headers.common['X-ANYPNT-ORG-ID'];
    delete (api as any).defaults.headers.common['X-ANYPNT-ENV-ID'];
  });
});

// ---------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------

describe('response parsing', () => {
  it('handles the { data: [] } shape, bare arrays and the columnar shape', () => {
    expect(extractRows({ data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(extractRows([{ id: 'b' }])).toEqual([{ id: 'b' }]);
    expect(extractRows({ columns: ['id', 'requestVolume'], rows: [['c', 5]] }))
      .toEqual([{ id: 'c', requestVolume: 5 }]);
    expect(extractRows(null)).toEqual([]);
    expect(extractRows({ unexpected: true })).toEqual([]);
  });

  it('maps overview rows into typed entities', async () => {
    mockedApi.post.mockResolvedValue({
      data: {
        data: [{
          id: 'entity-1',
          type: 'MULE_APPLICATION',
          name: 'orders-api',
          orgId: ORG_ID,
          orgName: 'Business Group',
          envId: ENV_ID,
          envName: 'Production',
          p99RequestLatency: 412.5,
          requestVolume: 1000,
          deploymentType: 'CH2',
          deploymentId: 'dep-1',
        }],
      },
    });

    const entities = await getEntityOverview({ ...RANGE, limit: 5 });
    expect(entities).toEqual([{
      id: 'entity-1',
      type: 'MULE_APPLICATION',
      name: 'orders-api',
      orgId: ORG_ID,
      orgName: 'Business Group',
      envId: ENV_ID,
      envName: 'Production',
      p99RequestLatency: 412.5,
      requestVolume: 1000,
      deploymentType: 'CH2',
      deploymentId: 'dep-1',
    }]);
  });

  it('returns time-series points sorted by timestamp', async () => {
    mockedApi.post.mockResolvedValue({
      data: {
        data: [
          { timestamp: 2000, requestVolume: 7 },
          { timestamp: 1000, requestVolume: 3 },
        ],
      },
    });

    const series = await getEntityTimeSeries(['entity-1'], RANGE, { failedOnly: true });
    expect(series).toEqual([
      { timestamp: 1000, value: 3 },
      { timestamp: 2000, value: 7 },
    ]);
    expect(lastQuery()).toContain(`"entity.response.status" = 'FAILED'`);
  });
});

// ---------------------------------------------------------------
// Error-rate computation (incident feed)
// ---------------------------------------------------------------

describe('getEstateHealth', () => {
  function mockEstate() {
    mockedApi.post
      .mockResolvedValueOnce({
        data: {
          data: [
            { id: 'healthy', name: 'healthy-api', requestVolume: 1000, p99RequestLatency: 100 },
            { id: 'degraded', name: 'degraded-api', requestVolume: 200, p99RequestLatency: 900 },
            { id: 'idle', name: 'idle-api', requestVolume: 0, p99RequestLatency: null },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            { id: 'healthy', errorRequestCount: 10 },
            { id: 'degraded', errorRequestCount: 50 },
          ],
        },
      });
  }

  it('computes error rate and sorts worst-first', async () => {
    mockEstate();
    const health = await getEstateHealth(RANGE);

    expect(health.map((entity) => entity.id)).toEqual(['degraded', 'healthy', 'idle']);
    expect(health[0].errorCount).toBe(50);
    expect(health[0].errorRate).toBeCloseTo(0.25);
    expect(health[1].errorCount).toBe(10);
    expect(health[1].errorRate).toBeCloseTo(0.01);
  });

  it('treats entities without traffic or errors as a 0 rate (no divide-by-zero)', async () => {
    mockEstate();
    const health = await getEstateHealth(RANGE);
    const idle = health.find((entity) => entity.id === 'idle');
    expect(idle?.requestVolume).toBe(0);
    expect(idle?.errorCount).toBe(0);
    expect(idle?.errorRate).toBe(0);
  });

  it('clamps the rate to 1 when error counts exceed the sampled volume', async () => {
    mockedApi.post
      .mockResolvedValueOnce({ data: { data: [{ id: 'skewed', requestVolume: 10 }] } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'skewed', errorRequestCount: 40 }] } });

    const health = await getEstateHealth(RANGE);
    expect(health[0].errorRate).toBe(1);
    expect(health[0].errorCount).toBe(40);
  });

  it('scopes the error-count query to the entities returned by the overview', async () => {
    mockEstate();
    await getEstateHealth(RANGE);
    expect(mockedApi.post).toHaveBeenCalledTimes(2);
    expect(lastQuery()).toContain(`"entity.id" IN ('healthy','degraded','idle')`);
  });

  it('skips the follow-up query when the overview is empty', async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { data: [] } });
    expect(await getEstateHealth(RANGE)).toEqual([]);
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------
// Graceful degradation
// ---------------------------------------------------------------

describe('graceful degradation', () => {
  it.each([403, 404, 503])('returns empty results on HTTP %s without throwing', async (status) => {
    mockedApi.post.mockRejectedValue(axiosError(status));
    await expect(getEntityOverview(RANGE)).resolves.toEqual([]);
    expect(isInsightsUnavailable()).toBe(true);
  });

  it('short-circuits subsequent calls once the API is known to be unavailable', async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(404));
    await getEntityOverview(RANGE);
    expect(mockedApi.post).toHaveBeenCalledTimes(1);

    await expect(getSlowestEntities(RANGE)).resolves.toEqual([]);
    await expect(getEntityErrorCounts(['a'], RANGE)).resolves.toEqual({});
    await expect(getEstateHealth(RANGE)).resolves.toEqual([]);
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
  });

  it('keeps insights enabled for transient failures (500 / network)', async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(500));
    await expect(getEntityOverview(RANGE)).resolves.toEqual([]);
    expect(isInsightsUnavailable()).toBe(false);

    mockedApi.post.mockRejectedValueOnce(new Error('Network Error'));
    await expect(getSlowestEntities(RANGE)).resolves.toEqual([]);
    expect(isInsightsUnavailable()).toBe(false);
  });

  it('degrades to an empty estate when the error-count query fails', async () => {
    mockedApi.post
      .mockResolvedValueOnce({ data: { data: [{ id: 'a', requestVolume: 100 }] } })
      .mockRejectedValueOnce(axiosError(503));

    const health = await getEstateHealth(RANGE);
    expect(health).toEqual([expect.objectContaining({ id: 'a', errorCount: 0, errorRate: 0 })]);
  });

  it('never surfaces a raw axios error to the caller', async () => {
    mockedApi.post.mockRejectedValue(axiosError(500));
    await expect(getEntityTimeSeries(['a'], RANGE)).resolves.toEqual([]);
    await expect(getEntityErrorCounts(['a'], RANGE)).resolves.toEqual({});
  });

  it('resetInsightsSession re-enables querying', async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(403));
    await getEntityOverview(RANGE);
    expect(isInsightsUnavailable()).toBe(true);

    resetInsightsSession();
    mockedApi.post.mockResolvedValueOnce({ data: { data: [{ id: 'a', requestVolume: 1 }] } });
    const entities = await getEntityOverview(RANGE);
    expect(entities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------
// Query key scoping (org + env), matching runtimeKeys
// ---------------------------------------------------------------

describe('insightsKeys — org/env scoping', () => {
  it('includes org and env ids in every key', () => {
    expect(insightsKeys.all()).toEqual(['insights', ORG_ID, ENV_ID]);
    for (const key of [
      insightsKeys.entityOverview(RANGE),
      insightsKeys.estateHealth(RANGE),
      insightsKeys.slowestEntities(RANGE),
      insightsKeys.entityErrorCounts(['a'], RANGE),
      insightsKeys.entityRequestTotals(['a'], RANGE),
      insightsKeys.entityTimeSeries(['a'], RANGE, true),
      insightsKeys.metricDescriptor(),
    ]) {
      expect(key).toContain(ORG_ID);
      expect(key).toContain(ENV_ID);
    }
  });

  it('produces different keys for different org/env and uses a placeholder when unset', () => {
    const prodKey = insightsKeys.estateHealth(RANGE);

    useAuthStore.setState({
      currentOrganization: { id: 'org-other', name: 'Other' } as any,
      currentEnvironment: { id: 'env-other', name: 'Sandbox' } as any,
    });
    expect(insightsKeys.estateHealth(RANGE)).not.toEqual(prodKey);

    useAuthStore.setState({ currentOrganization: null, currentEnvironment: null });
    expect(insightsKeys.all()).toEqual(['insights', '_', '_']);
  });

  it('is stable regardless of entity id ordering', () => {
    expect(insightsKeys.entityErrorCounts(['b', 'a'], RANGE))
      .toEqual(insightsKeys.entityErrorCounts(['a', 'b'], RANGE));
  });
});
