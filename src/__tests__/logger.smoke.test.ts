/**
 * Logger Smoke Tests
 *
 * Verifies the production-safe logger:
 * - handled errors avoid console.error in dev
 * - In __DEV__, console.log/warn pass through
 */

import logger from '../utils/logger';

describe('Logger utility', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });

  it('should route handled errors through console.warn in __DEV__ mode', () => {
    const spy = jest.fn();
    console.warn = spy;
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
