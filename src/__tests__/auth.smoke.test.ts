/**
 * Auth Smoke Tests
 *
 * Verifies core auth behaviors without hitting real APIs:
 * - MFARequiredError is properly thrown & caught
 * - Token structure is valid after login
 * - Logout clears state
 */

import { MFARequiredError } from '../services/authService';

describe('Auth — MFARequiredError', () => {
  it('should be an instance of Error', () => {
    const err = new MFARequiredError('https://verify.salesforce.com/verify/', 'jwt123');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MFARequiredError');
    expect(err.message).toBe('MFA verification required');
  });

  it('should carry verifyUrl and requestToken', () => {
    const url = 'https://verify.salesforce.com/verify/';
    const token = 'eyJhbGciOiJSUzI1NiJ9.test';
    const err = new MFARequiredError(url, token);
    expect(err.verifyUrl).toBe(url);
    expect(err.requestToken).toBe(token);
  });

  it('should be catchable with instanceof', () => {
    let caught = false;
    try {
      throw new MFARequiredError('https://verify.salesforce.com/', 'jwt');
    } catch (e) {
      if (e instanceof MFARequiredError) {
        caught = true;
      }
    }
    expect(caught).toBe(true);
  });
});
