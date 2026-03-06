/**
 * MFA Guard Tests
 *
 * Verifies that verifyMFA rejects calls without valid verification context,
 * preventing the dead-end where the MFA dialog opens but can never succeed.
 */

import { verifyMFA, MFARequiredError } from '../services/authService';

// verifyMFA makes HTTP calls — mock axios so we never hit the network
jest.mock('axios', () => {
  const instance: Record<string, any> = {
    post: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  };
  instance.create = jest.fn(() => instance);
  return {
    __esModule: true,
    default: instance,
    ...instance,
  };
});

describe('verifyMFA — context guard', () => {
  it('should throw when verificationContext is undefined', async () => {
    await expect(
      verifyMFA('user', 'pass', '123456', 'https://anypoint.mulesoft.com', undefined),
    ).rejects.toThrow('MFA verification context missing');
  });

  it('should throw when verificationContext has empty url', async () => {
    await expect(
      verifyMFA('user', 'pass', '123456', 'https://anypoint.mulesoft.com', {
        url: '',
        request: 'jwt-token',
      }),
    ).rejects.toThrow('MFA verification context missing');
  });

  it('should throw when verificationContext has empty request', async () => {
    await expect(
      verifyMFA('user', 'pass', '123456', 'https://anypoint.mulesoft.com', {
        url: 'https://verify.salesforce.com/verify/',
        request: '',
      }),
    ).rejects.toThrow('MFA verification context missing');
  });

  it('should NOT throw when verificationContext is fully populated', async () => {
    // It will throw later because the mocked axios won't return real data,
    // but it should NOT throw the "context missing" error
    try {
      await verifyMFA('user', 'pass', '123456', 'https://anypoint.mulesoft.com', {
        url: 'https://verify.salesforce.com/verify/',
        request: 'eyJhbGciOiJSUzI1NiJ9.valid',
      });
    } catch (e: any) {
      // Should fail with a DIFFERENT error (network/token error), not context missing
      expect(e.message).not.toContain('MFA verification context missing');
    }
  });
});

describe('MFARequiredError carries context for dialog', () => {
  it('should provide url and requestToken to populate mfaContext', () => {
    const err = new MFARequiredError(
      'https://verify.salesforce.com/verify/',
      'eyJhbGciOiJSUzI1NiJ9.jwt',
    );
    expect(err.verifyUrl).toBeTruthy();
    expect(err.requestToken).toBeTruthy();
    expect(err.verifyUrl).toContain('salesforce.com');
  });
});
