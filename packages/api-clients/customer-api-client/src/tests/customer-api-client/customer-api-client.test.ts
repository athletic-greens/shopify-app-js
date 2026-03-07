import {createGraphQLClient} from '@shopify/graphql-client';

import {createCustomerApiClient} from '../../customer-api-client';
import {
  SDK_VARIANT_HEADER,
  SDK_VERSION_HEADER,
  SDK_VARIANT_SOURCE_HEADER,
  API_DISCOVERY_PATH,
  OIDC_DISCOVERY_PATH,
  DEFAULT_SCOPE,
} from '../../constants';

const storeDomain = 'my-shop.myshopify.com';
const storeUrl = `https://${storeDomain}`;
const clientId = 'test-client-id';
const redirectUri = 'https://myapp.com/callback';

const discoveredGraphqlUrl = `${storeUrl}/customer/api/2025-01/graphql`;
const mockOidcConfig = {
  authorization_endpoint: `${storeUrl}/authentication/oauth/authorize`,
  token_endpoint: `${storeUrl}/authentication/oauth/token`,
  end_session_endpoint: `${storeUrl}/authentication/logout`,
  jwks_uri: `${storeUrl}/authentication/.well-known/jwks.json`,
  issuer: 'https://shopify.com/authentication/12345678',
};

const mockTokenResponse = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  id_token: 'test-id-token',
};

const graphqlClientMock = {
  config: {},
  fetch: jest.fn(),
  request: jest.fn(),
  requestStream: jest.fn(),
};

jest.mock('@shopify/graphql-client', () => ({
  ...jest.requireActual('@shopify/graphql-client'),
  createGraphQLClient: jest.fn(),
}));

// Mock PKCE module to avoid Web Crypto API dependency in tests
jest.mock('../../pkce', () => ({
  generateCodeVerifier: jest.fn().mockResolvedValue('mock-code-verifier'),
  generateCodeChallenge: jest.fn().mockResolvedValue('mock-code-challenge'),
  generateRandomString: jest.fn().mockReturnValue('mock-random'),
}));

function mockFetch() {
  const fetchMock = jest.fn().mockImplementation((url: string) => {
    if (url.endsWith(OIDC_DISCOVERY_PATH)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockOidcConfig),
      });
    }
    if (url.endsWith(API_DISCOVERY_PATH)) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            graphql_api: discoveredGraphqlUrl,
            mcp_api: `${storeUrl}/customer/api/mcp`,
          }),
      });
    }
    // Token endpoint
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    });
  });
  return fetchMock;
}

const config = {storeDomain, clientId, redirectUri};

describe('Customer API Client', () => {
  describe('createCustomerApiClient()', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = mockFetch();
      (global as any).fetch = fetchMock;
      (createGraphQLClient as jest.Mock).mockReturnValue(graphqlClientMock);
      // Restore pkce mock implementations after resetAllMocks
      const pkce = jest.requireMock('../../pkce');
      pkce.generateCodeVerifier.mockResolvedValue('mock-code-verifier');
      pkce.generateCodeChallenge.mockResolvedValue('mock-code-challenge');
      pkce.generateRandomString.mockReturnValue('mock-random');
    });

    afterEach(() => {
      jest.resetAllMocks();
      jest.restoreAllMocks();
    });

    describe('validation', () => {
      it('throws if storeDomain is missing', () => {
        expect(() =>
          createCustomerApiClient({
            ...config,
            storeDomain: '' as any,
          }),
        ).toThrow('Customer API Client: a valid store domain must be provided');
      });

      it('throws if clientId is missing', () => {
        expect(() =>
          createCustomerApiClient({
            ...config,
            clientId: '' as any,
          }),
        ).toThrow('Customer API Client: a client ID must be provided');
      });

      it('throws if redirectUri is missing', () => {
        expect(() =>
          createCustomerApiClient({
            ...config,
            redirectUri: '' as any,
          }),
        ).toThrow('Customer API Client: a redirect URI must be provided');
      });
    });

    describe('config', () => {
      it('returns a config object with the normalized store domain', () => {
        const client = createCustomerApiClient(config);
        expect(client.config.storeDomain).toBe(storeUrl);
      });

      it('returns a config object with clientId and redirectUri', () => {
        const client = createCustomerApiClient(config);
        expect(client.config.clientId).toBe(clientId);
        expect(client.config.redirectUri).toBe(redirectUri);
      });

      it('returns a config object with base headers (no Authorization)', () => {
        const client = createCustomerApiClient(config);
        expect(client.config.headers).toMatchObject({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        });
        expect(client.config.headers).not.toHaveProperty(SDK_VARIANT_HEADER);
        expect(client.config.headers).not.toHaveProperty(SDK_VERSION_HEADER);
        expect(client.config.headers).not.toHaveProperty('Authorization');
      });

      it('includes SDK_VARIANT_SOURCE_HEADER when clientName is provided', () => {
        const client = createCustomerApiClient({
          ...config,
          clientName: 'my-app',
        });
        expect(client.config.headers).toHaveProperty(
          SDK_VARIANT_SOURCE_HEADER,
          'my-app',
        );
      });

      it('returns a frozen client object', () => {
        const client = createCustomerApiClient(config);
        expect(Object.isFrozen(client)).toBe(true);
      });
    });

    describe('getHeaders()', () => {
      it('returns base headers', () => {
        const client = createCustomerApiClient(config);
        const headers = client.getHeaders();
        expect(headers).toMatchObject({
          'Content-Type': 'application/json',
        });
      });

      it('merges custom headers with base headers', () => {
        const client = createCustomerApiClient(config);
        const headers = client.getHeaders({'X-Custom': 'value'});
        expect(headers).toMatchObject({
          'Content-Type': 'application/json',
          'X-Custom': 'value',
        });
      });
    });

    describe('setTokens() / getTokens()', () => {
      it('returns null initially', () => {
        const client = createCustomerApiClient(config);
        expect(client.getTokens()).toBeNull();
      });

      it('stores and returns token set', () => {
        const client = createCustomerApiClient(config);
        const tokenSet = {accessToken: 'abc', refreshToken: 'def'};
        client.setTokens(tokenSet);
        expect(client.getTokens()).toEqual(tokenSet);
      });

      it('overwrites previously stored tokens', () => {
        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'old'});
        client.setTokens({accessToken: 'new'});
        expect(client.getTokens()?.accessToken).toBe('new');
      });
    });

    describe('getAuthorizationUrl()', () => {
      it('calls the OIDC discovery endpoint', async () => {
        const client = createCustomerApiClient(config);
        await client.getAuthorizationUrl();
        expect(fetchMock).toHaveBeenCalledWith(
          `${storeUrl}${OIDC_DISCOVERY_PATH}`,
        );
      });

      it('returns a URL with required OAuth params', async () => {
        const client = createCustomerApiClient(config);
        const result = await client.getAuthorizationUrl();
        const url = new URL(result.url);

        expect(url.origin + url.pathname).toBe(
          mockOidcConfig.authorization_endpoint,
        );
        expect(url.searchParams.get('client_id')).toBe(clientId);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('code_challenge')).toBeTruthy();
        expect(url.searchParams.get('state')).toBeTruthy();
        expect(url.searchParams.get('nonce')).toBeTruthy();
      });

      it('uses the default scope when none is provided', async () => {
        const client = createCustomerApiClient(config);
        const result = await client.getAuthorizationUrl();
        const url = new URL(result.url);
        expect(url.searchParams.get('scope')).toBe(DEFAULT_SCOPE);
      });

      it('uses a custom scope when provided', async () => {
        const client = createCustomerApiClient(config);
        const result = await client.getAuthorizationUrl({
          scope: 'openid email',
        });
        const url = new URL(result.url);
        expect(url.searchParams.get('scope')).toBe('openid email');
      });

      it('uses provided state and nonce', async () => {
        const client = createCustomerApiClient(config);
        const result = await client.getAuthorizationUrl({
          state: 'my-state',
          nonce: 'my-nonce',
        });
        const url = new URL(result.url);
        expect(url.searchParams.get('state')).toBe('my-state');
        expect(url.searchParams.get('nonce')).toBe('my-nonce');
      });

      it('returns codeVerifier, state, and nonce for storage', async () => {
        const client = createCustomerApiClient(config);
        const result = await client.getAuthorizationUrl();
        expect(result.codeVerifier).toBeTruthy();
        expect(result.state).toBeTruthy();
        expect(result.nonce).toBeTruthy();
      });
    });

    describe('exchangeCode()', () => {
      const exchangeParams = {code: 'auth-code', codeVerifier: 'verifier-123'};

      it('POSTs to the token endpoint with correct params', async () => {
        const client = createCustomerApiClient(config);
        await client.exchangeCode(exchangeParams);

        const tokenCall = fetchMock.mock.calls.find(([url]: [string]) =>
          url === mockOidcConfig.token_endpoint,
        );
        expect(tokenCall).toBeDefined();
        const [, options] = tokenCall;
        expect(options.method).toBe('POST');

        const body = new URLSearchParams(options.body);
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('client_id')).toBe(clientId);
        expect(body.get('redirect_uri')).toBe(redirectUri);
        expect(body.get('code')).toBe('auth-code');
        expect(body.get('code_verifier')).toBe('verifier-123');
      });

      it('returns a CustomerTokenSet with camelCase fields', async () => {
        const client = createCustomerApiClient(config);
        const tokenSet = await client.exchangeCode(exchangeParams);

        expect(tokenSet.accessToken).toBe(mockTokenResponse.access_token);
        expect(tokenSet.refreshToken).toBe(mockTokenResponse.refresh_token);
        expect(tokenSet.expiresIn).toBe(mockTokenResponse.expires_in);
        expect(tokenSet.idToken).toBe(mockTokenResponse.id_token);
      });

      it('stores tokens internally after exchange', async () => {
        const client = createCustomerApiClient(config);
        await client.exchangeCode(exchangeParams);

        expect(client.getTokens()?.accessToken).toBe(
          mockTokenResponse.access_token,
        );
      });

      it('throws if the token endpoint returns an error status', async () => {
        fetchMock.mockImplementation((url: string) => {
          if (url === mockOidcConfig.token_endpoint) {
            return Promise.resolve({ok: false, status: 400});
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              url.endsWith(OIDC_DISCOVERY_PATH)
                ? Promise.resolve(mockOidcConfig)
                : Promise.resolve({graphql_api: discoveredGraphqlUrl}),
          });
        });

        const client = createCustomerApiClient(config);
        await expect(client.exchangeCode(exchangeParams)).rejects.toThrow(
          'Customer API Client: token request failed with status 400',
        );
      });
    });

    describe('refreshToken()', () => {
      it('uses the stored refresh token when none is provided', async () => {
        const client = createCustomerApiClient(config);
        client.setTokens({
          accessToken: 'old-access',
          refreshToken: 'stored-refresh-token',
        });

        await client.refreshToken();

        const tokenCall = fetchMock.mock.calls.find(([url]: [string]) =>
          url === mockOidcConfig.token_endpoint,
        );
        const body = new URLSearchParams(tokenCall[1].body);
        expect(body.get('grant_type')).toBe('refresh_token');
        expect(body.get('refresh_token')).toBe('stored-refresh-token');
      });

      it('uses the provided refresh token over the stored one', async () => {
        const client = createCustomerApiClient(config);
        client.setTokens({
          accessToken: 'old-access',
          refreshToken: 'stored-refresh',
        });

        await client.refreshToken({refreshToken: 'explicit-refresh'});

        const tokenCall = fetchMock.mock.calls.find(([url]: [string]) =>
          url === mockOidcConfig.token_endpoint,
        );
        const body = new URLSearchParams(tokenCall[1].body);
        expect(body.get('refresh_token')).toBe('explicit-refresh');
      });

      it('throws if no refresh token is available', async () => {
        const client = createCustomerApiClient(config);
        await expect(client.refreshToken()).rejects.toThrow(
          'Customer API Client: a refresh token is required',
        );
      });

      it('updates stored tokens after refresh', async () => {
        const client = createCustomerApiClient(config);
        client.setTokens({
          accessToken: 'old',
          refreshToken: 'refresh-token',
        });

        await client.refreshToken();

        expect(client.getTokens()?.accessToken).toBe(
          mockTokenResponse.access_token,
        );
      });
    });

    describe('getLogoutUrl()', () => {
      it('returns the end_session_endpoint URL', async () => {
        const client = createCustomerApiClient(config);
        const url = await client.getLogoutUrl();
        expect(url).toContain(mockOidcConfig.end_session_endpoint);
      });

      it('includes id_token_hint when idToken is provided', async () => {
        const client = createCustomerApiClient(config);
        const url = await client.getLogoutUrl({idToken: 'my-id-token'});
        expect(new URL(url).searchParams.get('id_token_hint')).toBe(
          'my-id-token',
        );
      });

      it('uses stored idToken when none is provided', async () => {
        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'x', idToken: 'stored-id-token'});
        const url = await client.getLogoutUrl();
        expect(new URL(url).searchParams.get('id_token_hint')).toBe(
          'stored-id-token',
        );
      });

      it('includes post_logout_redirect_uri when provided', async () => {
        const client = createCustomerApiClient(config);
        const url = await client.getLogoutUrl({
          postLogoutRedirectUri: 'https://myapp.com/goodbye',
        });
        expect(
          new URL(url).searchParams.get('post_logout_redirect_uri'),
        ).toBe('https://myapp.com/goodbye');
      });
    });

    describe('fetch()', () => {
      const query = '{ customer { id } }';

      it('throws if no access token is set and none is provided', async () => {
        const client = createCustomerApiClient(config);
        await expect(client.fetch(query)).rejects.toThrow(
          'Customer API Client: a customer access token is required',
        );
      });

      it('uses stored access token when making requests', async () => {
        (graphqlClientMock.fetch as jest.Mock).mockResolvedValue({
          status: 200,
        });

        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'stored-token'});
        await client.fetch(query);

        expect(graphqlClientMock.fetch).toHaveBeenCalledWith(
          query,
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'stored-token',
            }),
          }),
        );
      });

      it('uses a per-request token when provided', async () => {
        (graphqlClientMock.fetch as jest.Mock).mockResolvedValue({
          status: 200,
        });

        const client = createCustomerApiClient(config);
        await client.fetch(query, {customerAccessToken: 'per-request-token'});

        expect(graphqlClientMock.fetch).toHaveBeenCalledWith(
          query,
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'per-request-token',
            }),
          }),
        );
      });

      it('calls createGraphQLClient with the discovered API URL', async () => {
        (graphqlClientMock.fetch as jest.Mock).mockResolvedValue({
          status: 200,
        });

        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'token'});
        await client.fetch(query);

        expect(createGraphQLClient).toHaveBeenCalledWith(
          expect.objectContaining({url: discoveredGraphqlUrl}),
        );
      });

      it('only calls createGraphQLClient once across multiple fetches', async () => {
        (graphqlClientMock.fetch as jest.Mock).mockResolvedValue({
          status: 200,
        });

        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'token'});
        await client.fetch(query);
        await client.fetch(query);

        expect(createGraphQLClient).toHaveBeenCalledTimes(1);
      });

      it('passes apiVersion as a URL override when provided', async () => {
        (graphqlClientMock.fetch as jest.Mock).mockResolvedValue({
          status: 200,
        });

        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'token'});
        await client.fetch(query, {apiVersion: '2024-07'});

        const call = (graphqlClientMock.fetch as jest.Mock).mock.calls[0];
        expect(call[1].url).toBe(
          `${storeUrl}/customer/api/2024-07/graphql`,
        );
      });
    });

    describe('request()', () => {
      const query = '{ customer { id } }';

      it('throws if no access token is set and none is provided', async () => {
        const client = createCustomerApiClient(config);
        await expect(client.request(query)).rejects.toThrow(
          'Customer API Client: a customer access token is required',
        );
      });

      it('uses stored access token and returns the graphql client response', async () => {
        const mockResponse = {data: {customer: {id: '123'}}};
        (graphqlClientMock.request as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'stored-token'});
        const result = await client.request(query);

        expect(result).toEqual(mockResponse);
        expect(graphqlClientMock.request).toHaveBeenCalledWith(
          query,
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'stored-token',
            }),
          }),
        );
      });

      it('passes variables to the graphql client', async () => {
        (graphqlClientMock.request as jest.Mock).mockResolvedValue({data: {}});

        const client = createCustomerApiClient(config);
        client.setTokens({accessToken: 'token'});
        await client.request(query, {variables: {id: '123'}});

        expect(graphqlClientMock.request).toHaveBeenCalledWith(
          query,
          expect.objectContaining({variables: {id: '123'}}),
        );
      });
    });
  });

  describe('confidential client (clientSecret provided)', () => {
    const clientSecret = 'super-secret';
    const confidentialConfig = {...config, clientSecret};
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = mockFetch();
      (global as any).fetch = fetchMock;
      (createGraphQLClient as jest.Mock).mockReturnValue(graphqlClientMock);
      const pkce = jest.requireMock('../../pkce');
      pkce.generateCodeVerifier.mockResolvedValue('mock-code-verifier');
      pkce.generateCodeChallenge.mockResolvedValue('mock-code-challenge');
      pkce.generateRandomString.mockReturnValue('mock-random');
    });

    afterEach(() => {
      jest.resetAllMocks();
      jest.restoreAllMocks();
    });

    it('exposes clientSecret on config', () => {
      const client = createCustomerApiClient(confidentialConfig);
      expect(client.config.clientSecret).toBe(clientSecret);
    });

    describe('getAuthorizationUrl()', () => {
      it('does not include code_challenge or code_challenge_method', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        const result = await client.getAuthorizationUrl();
        const url = new URL(result.url);

        expect(url.searchParams.has('code_challenge')).toBe(false);
        expect(url.searchParams.has('code_challenge_method')).toBe(false);
      });

      it('does not return a codeVerifier', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        const result = await client.getAuthorizationUrl();
        expect(result.codeVerifier).toBeUndefined();
      });

      it('still includes required OAuth params', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        const result = await client.getAuthorizationUrl();
        const url = new URL(result.url);

        expect(url.searchParams.get('client_id')).toBe(clientId);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
        expect(url.searchParams.get('state')).toBeTruthy();
        expect(url.searchParams.get('nonce')).toBeTruthy();
      });
    });

    describe('exchangeCode()', () => {
      it('sends Basic Authorization header instead of client_id in body', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        await client.exchangeCode({code: 'auth-code'});

        const tokenCall = fetchMock.mock.calls.find(
          ([url]: [string]) => url === mockOidcConfig.token_endpoint,
        );
        const [, options] = tokenCall;
        const expectedBasic = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
        expect(options.headers['Authorization']).toBe(expectedBasic);

        const body = new URLSearchParams(options.body);
        expect(body.has('client_id')).toBe(false);
      });

      it('does not send code_verifier in body', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        await client.exchangeCode({code: 'auth-code'});

        const tokenCall = fetchMock.mock.calls.find(
          ([url]: [string]) => url === mockOidcConfig.token_endpoint,
        );
        const body = new URLSearchParams(tokenCall[1].body);
        expect(body.has('code_verifier')).toBe(false);
      });

      it('does not throw when codeVerifier is omitted', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        await expect(
          client.exchangeCode({code: 'auth-code'}),
        ).resolves.toBeDefined();
      });
    });

    describe('refreshToken()', () => {
      it('sends Basic Authorization header instead of client_id in body', async () => {
        const client = createCustomerApiClient(confidentialConfig);
        client.setTokens({accessToken: 'x', refreshToken: 'stored-refresh'});
        await client.refreshToken();

        const tokenCall = fetchMock.mock.calls.find(
          ([url]: [string]) => url === mockOidcConfig.token_endpoint,
        );
        const [, options] = tokenCall;
        const expectedBasic = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
        expect(options.headers['Authorization']).toBe(expectedBasic);

        const body = new URLSearchParams(options.body);
        expect(body.has('client_id')).toBe(false);
      });
    });
  });

  describe('public client (no clientSecret)', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
      fetchMock = mockFetch();
      (global as any).fetch = fetchMock;
      (createGraphQLClient as jest.Mock).mockReturnValue(graphqlClientMock);
      const pkce = jest.requireMock('../../pkce');
      pkce.generateCodeVerifier.mockResolvedValue('mock-code-verifier');
      pkce.generateCodeChallenge.mockResolvedValue('mock-code-challenge');
      pkce.generateRandomString.mockReturnValue('mock-random');
    });

    afterEach(() => {
      jest.resetAllMocks();
      jest.restoreAllMocks();
    });

    it('throws if codeVerifier is missing in exchangeCode()', async () => {
      const client = createCustomerApiClient(config);
      await expect(client.exchangeCode({code: 'auth-code'})).rejects.toThrow(
        'Customer API Client: codeVerifier is required for public clients',
      );
    });

    it('sends client_id and code_verifier in body (no Authorization header)', async () => {
      const client = createCustomerApiClient(config);
      await client.exchangeCode({code: 'auth-code', codeVerifier: 'verifier'});

      const tokenCall = fetchMock.mock.calls.find(
        ([url]: [string]) => url === mockOidcConfig.token_endpoint,
      );
      const [, options] = tokenCall;
      expect(options.headers['Authorization']).toBeUndefined();

      const body = new URLSearchParams(options.body);
      expect(body.get('client_id')).toBe(clientId);
      expect(body.get('code_verifier')).toBe('verifier');
    });
  });
});
