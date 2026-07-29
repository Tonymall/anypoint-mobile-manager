import { parseAccessTokenFromUrl } from '../utils/authUrl';

const CALLBACK = 'https://eu1.anypoint.mulesoft.com/shared/silentAuthCallback.html';

describe('parseAccessTokenFromUrl', () => {
  it('reads the token from the implicit-flow fragment', () => {
    const url = `${CALLBACK}#access_token=abc123&token_type=bearer&expires_in=3600`;

    expect(parseAccessTokenFromUrl(url)).toBe('abc123');
  });

  it('reads a token that is not the first fragment parameter', () => {
    const url = `${CALLBACK}#token_type=bearer&expires_in=3600&access_token=xyz789`;

    expect(parseAccessTokenFromUrl(url)).toBe('xyz789');
  });

  it('reads the token from a query string', () => {
    const url = `${CALLBACK}?access_token=fromquery`;

    expect(parseAccessTokenFromUrl(url)).toBe('fromquery');
  });

  it('prefers the fragment when both carry a token', () => {
    // The callback page forwards `hash || search`, so the fragment is the
    // implicit-flow answer and must win.
    const url = `${CALLBACK}?access_token=fromquery#access_token=fromhash`;

    expect(parseAccessTokenFromUrl(url)).toBe('fromhash');
  });

  it('percent-decodes the value', () => {
    const url = `${CALLBACK}#access_token=a%2Bb%2Fc%3D`;

    expect(parseAccessTokenFromUrl(url)).toBe('a+b/c=');
  });

  it('returns null when the callback carries no token', () => {
    expect(parseAccessTokenFromUrl(`${CALLBACK}#error=login_required`)).toBeNull();
    expect(parseAccessTokenFromUrl(CALLBACK)).toBeNull();
  });

  it('does not match a parameter that merely ends in access_token', () => {
    const url = `${CALLBACK}#refresh_access_token=nope`;

    expect(parseAccessTokenFromUrl(url)).toBeNull();
  });

  it('ignores an empty token value', () => {
    expect(parseAccessTokenFromUrl(`${CALLBACK}#access_token=`)).toBeNull();
  });

  it('survives a malformed percent-escape instead of throwing', () => {
    const url = `${CALLBACK}#broken=%E0%A4%A&access_token=good`;

    expect(parseAccessTokenFromUrl(url)).toBe('good');
  });

  it('handles non-string and empty input', () => {
    expect(parseAccessTokenFromUrl('')).toBeNull();
    expect(parseAccessTokenFromUrl(undefined as unknown as string)).toBeNull();
    expect(parseAccessTokenFromUrl(null as unknown as string)).toBeNull();
  });
});
