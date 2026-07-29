import api from '../services/api';
import { armGetCollection } from '../services/armApiVersion';
import { getArmBase, getArmVersion, resetArmVersion } from '../services/armApiVersionState';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const mockGet = api.get as jest.Mock;

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

beforeEach(() => {
  resetArmVersion();
  mockGet.mockReset();
});

describe('ARM API version negotiation', () => {
  it('prefers v2 and pins it after a successful collection call', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [] } });

    const result = await armGetCollection('/servers');

    expect(mockGet).toHaveBeenCalledWith('/armui/api/v2/servers', undefined);
    expect(result).toEqual({ data: [] });
    expect(getArmVersion()).toBe('v2');
    expect(getArmBase()).toBe('/armui/api/v2');
  });

  it('falls back to v1 when v2 returns 404, and pins v1', async () => {
    mockGet
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: { data: ['alert'] } });

    const result = await armGetCollection('/alerts');

    expect(mockGet).toHaveBeenNthCalledWith(1, '/armui/api/v2/alerts', undefined);
    expect(mockGet).toHaveBeenNthCalledWith(2, '/armui/api/v1/alerts', undefined);
    expect(result).toEqual({ data: ['alert'] });
    expect(getArmVersion()).toBe('v1');
    expect(getArmBase()).toBe('/armui/api/v1');
  });

  it('falls back on 405 as well', async () => {
    mockGet
      .mockRejectedValueOnce(httpError(405))
      .mockResolvedValueOnce({ data: {} });

    await armGetCollection('/servers');

    expect(getArmVersion()).toBe('v1');
  });

  it('does not negotiate again once a version is pinned', async () => {
    mockGet
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: {} });

    await armGetCollection('/alerts');
    mockGet.mockClear();
    await armGetCollection('/servers');

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/armui/api/v1/servers', undefined);
  });

  it('propagates non-version errors without falling back', async () => {
    mockGet.mockRejectedValueOnce(httpError(500));

    await expect(armGetCollection('/servers')).rejects.toThrow('HTTP 500');
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(getArmVersion()).toBeNull();
  });

  it('does not pin a version on a 401 so negotiation can retry after re-auth', async () => {
    mockGet.mockRejectedValueOnce(httpError(401));

    await expect(armGetCollection('/alerts')).rejects.toThrow('HTTP 401');
    expect(getArmVersion()).toBeNull();
    expect(getArmBase()).toBe('/armui/api/v2');
  });

  it('forwards request config to axios', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    const config = { params: { limit: 25 } };

    await armGetCollection('/alerts', config);

    expect(mockGet).toHaveBeenCalledWith('/armui/api/v2/alerts', config);
  });

  it('resets to the preferred version after a session reset', async () => {
    mockGet
      .mockRejectedValueOnce(httpError(404))
      .mockResolvedValueOnce({ data: {} });
    await armGetCollection('/alerts');
    expect(getArmVersion()).toBe('v1');

    resetArmVersion();

    expect(getArmVersion()).toBeNull();
    expect(getArmBase()).toBe('/armui/api/v2');
  });
});
