/**
 * Logger Smoke Tests
 *
 * Verifies the production-safe logger:
 * - console.error always logs (even in prod)
 * - In __DEV__, console.log/warn pass through
 */

import logger from '../utils/logger';

describe('Logger utility', () => {
  const originalError = console.error;
  const originalLog = console.log;
  const originalWarn = console.warn;

  afterEach(() => {
    console.error = originalError;
    console.log = originalLog;
    console.warn = originalWarn;
  });

  it('should always call console.error', () => {
    const spy = jest.fn();
    console.error = spy;
    logger.error('test error');
    expect(spy).toHaveBeenCalledWith('test error');
  });

  it('should call console.log in __DEV__ mode', () => {
    // In test environment, __DEV__ is true
    const spy = jest.fn();
    console.log = spy;
    logger.log('test log');
    expect(spy).toHaveBeenCalledWith('test log');
  });

  it('should call console.warn in __DEV__ mode', () => {
    const spy = jest.fn();
    console.warn = spy;
    logger.warn('test warn');
    expect(spy).toHaveBeenCalledWith('test warn');
  });
});
