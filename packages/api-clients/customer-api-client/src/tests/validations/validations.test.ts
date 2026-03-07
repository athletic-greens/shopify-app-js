import {
  validateRequiredClientId,
  validateRequiredRedirectUri,
  validateRequiredStoreDomain,
} from '../../validations';

describe('validateRequiredStoreDomain()', () => {
  it('throws an error when storeDomain is undefined', () => {
    expect(() => validateRequiredStoreDomain(undefined)).toThrow(
      new Error('Customer API Client: a valid store domain must be provided'),
    );
  });

  it('throws an error when storeDomain is an empty string', () => {
    expect(() => validateRequiredStoreDomain('')).toThrow(
      new Error('Customer API Client: a valid store domain must be provided'),
    );
  });

  it('does not throw when a valid storeDomain is provided', () => {
    expect(() =>
      validateRequiredStoreDomain('my-shop.myshopify.com'),
    ).not.toThrow();
  });
});

describe('validateRequiredClientId()', () => {
  it('throws an error when clientId is undefined', () => {
    expect(() => validateRequiredClientId(undefined)).toThrow(
      new Error(
        "Customer API Client: a client ID must be provided - this is your app's OAuth client ID",
      ),
    );
  });

  it('throws an error when clientId is an empty string', () => {
    expect(() => validateRequiredClientId('')).toThrow(
      new Error(
        "Customer API Client: a client ID must be provided - this is your app's OAuth client ID",
      ),
    );
  });

  it('does not throw when a valid clientId is provided', () => {
    expect(() => validateRequiredClientId('shp_abc123')).not.toThrow();
  });
});

describe('validateRequiredRedirectUri()', () => {
  it('throws an error when redirectUri is undefined', () => {
    expect(() => validateRequiredRedirectUri(undefined)).toThrow(
      new Error(
        'Customer API Client: a redirect URI must be provided for the OAuth flow',
      ),
    );
  });

  it('throws an error when redirectUri is an empty string', () => {
    expect(() => validateRequiredRedirectUri('')).toThrow(
      new Error(
        'Customer API Client: a redirect URI must be provided for the OAuth flow',
      ),
    );
  });

  it('does not throw when a valid redirectUri is provided', () => {
    expect(() =>
      validateRequiredRedirectUri('https://example.com/auth/callback'),
    ).not.toThrow();
  });
});
