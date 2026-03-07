import {createGraphQLClient, validateDomainAndGetStoreUrl} from '@shopify/graphql-client';

import {
  AUTHORIZATION_HEADER,
  API_DISCOVERY_PATH,
  CLIENT,
  DEFAULT_CLIENT_VERSION,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_SCOPE,
  DEFAULT_SDK_VARIANT,
  OIDC_DISCOVERY_PATH,
  SDK_VARIANT_HEADER,
  SDK_VARIANT_SOURCE_HEADER,
  SDK_VERSION_HEADER,
} from './constants';
import {generateCodeChallenge, generateCodeVerifier, generateRandomString} from './pkce';
import {
  CustomerApiClient,
  CustomerApiClientConfig,
  CustomerApiClientOptions,
  CustomerRequestOptions,
  CustomerTokenSet,
  ExchangeCodeParams,
  GetAuthorizationUrlParams,
  OidcConfig,
  RefreshTokenParams,
} from './types';
import {
  validateRequiredClientId,
  validateRequiredRedirectUri,
  validateRequiredStoreDomain,
} from './validations';

export function createCustomerApiClient({
  storeDomain,
  clientId,
  redirectUri,
  clientName,
  retries = 0,
  customFetchApi,
  logger,
}: CustomerApiClientOptions): CustomerApiClient {
  validateRequiredStoreDomain(storeDomain);
  validateRequiredClientId(clientId);
  validateRequiredRedirectUri(redirectUri);

  const storeUrl = validateDomainAndGetStoreUrl({client: CLIENT, storeDomain});

  const fetchFn = customFetchApi ?? fetch;

  // Kick off both discoveries immediately — do not await
  const oidcPromise: Promise<OidcConfig> = fetchFn(
    `${storeUrl}${OIDC_DISCOVERY_PATH}`,
  ).then((r) => {
    if (!r.ok) {
      throw new Error(
        `${CLIENT}: OIDC discovery request failed with status ${r.status}. Ensure the store domain is correct.`,
      );
    }
    return r.json();
  });

  const apiUrlPromise: Promise<string> = fetchFn(
    `${storeUrl}${API_DISCOVERY_PATH}`,
  )
    .then((r) => {
      if (!r.ok) {
        throw new Error(
          `${CLIENT}: API discovery request failed with status ${r.status}. Ensure the store domain is correct.`,
        );
      }
      return r.json();
    })
    .then((data: {graphql_api: string}) => {
      if (!data.graphql_api) {
        throw new Error(
          `${CLIENT}: API discovery response did not include a graphql_api URL.`,
        );
      }
      return data.graphql_api;
    });

  // Mutable token state (stored in closure, not on frozen config)
  let tokens: CustomerTokenSet | null = null;

  // Lazily created and cached graphql client (created after API URL discovery)
  let cachedGraphqlClient: ReturnType<typeof createGraphQLClient> | undefined;

  const baseHeaders: Record<string, string> = {
    'Content-Type': DEFAULT_CONTENT_TYPE,
    Accept: DEFAULT_CONTENT_TYPE,
    [SDK_VARIANT_HEADER]: DEFAULT_SDK_VARIANT,
    [SDK_VERSION_HEADER]: DEFAULT_CLIENT_VERSION,
    ...(clientName ? {[SDK_VARIANT_SOURCE_HEADER]: clientName} : {}),
  };

  const config: CustomerApiClientConfig = {
    storeDomain: storeUrl,
    clientId,
    redirectUri,
    clientName,
    headers: baseHeaders,
  };

  async function getGraphqlClient() {
    if (!cachedGraphqlClient) {
      const apiUrl = await apiUrlPromise;
      cachedGraphqlClient = createGraphQLClient({
        headers: baseHeaders,
        url: apiUrl,
        retries,
        customFetchApi: fetchFn,
        logger,
      });
    }
    return cachedGraphqlClient;
  }

  function resolveAccessToken(options?: CustomerRequestOptions): string {
    const token =
      options?.customerAccessToken ?? tokens?.accessToken ?? undefined;
    if (!token) {
      throw new Error(
        `${CLIENT}: a customer access token is required. Call exchangeCode() after the OAuth flow or provide customerAccessToken in request options.`,
      );
    }
    return token;
  }

  function replaceVersionInUrl(url: string, apiVersion: string): string {
    return url.replace(/\/api\/[^/]+\/graphql/, `/api/${apiVersion}/graphql`);
  }

  async function postToTokenEndpoint(
    body: Record<string, string>,
  ): Promise<CustomerTokenSet> {
    const {token_endpoint} = await oidcPromise;

    const response = await fetchFn(token_endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      throw new Error(
        `${CLIENT}: token request failed with status ${response.status}`,
      );
    }

    const data: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    } = await response.json();

    return {
      accessToken: data.access_token,
      ...(data.refresh_token ? {refreshToken: data.refresh_token} : {}),
      ...(data.expires_in != null ? {expiresIn: data.expires_in} : {}),
      ...(data.id_token ? {idToken: data.id_token} : {}),
    };
  }

  const client: CustomerApiClient = {
    config,

    getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
      return {...(customHeaders ?? {}), ...baseHeaders};
    },

    setTokens(tokenSet: CustomerTokenSet): void {
      tokens = tokenSet;
    },

    getTokens(): CustomerTokenSet | null {
      return tokens;
    },

    async getAuthorizationUrl(
      params?: GetAuthorizationUrlParams,
    ): Promise<{url: string; codeVerifier: string; state: string; nonce: string}> {
      const {authorization_endpoint} = await oidcPromise;

      const codeVerifier = await generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = params?.state ?? generateRandomString(16);
      const nonce = params?.nonce ?? generateRandomString(16);
      const scope = params?.scope ?? DEFAULT_SCOPE;

      const url = new URL(authorization_endpoint);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', scope);
      url.searchParams.set('state', state);
      url.searchParams.set('nonce', nonce);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      return {url: url.toString(), codeVerifier, state, nonce};
    },

    async exchangeCode(params: ExchangeCodeParams): Promise<CustomerTokenSet> {
      const tokenSet = await postToTokenEndpoint({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code: params.code,
        code_verifier: params.codeVerifier,
      });

      tokens = tokenSet;
      return tokenSet;
    },

    async refreshToken(params?: RefreshTokenParams): Promise<CustomerTokenSet> {
      const refreshToken =
        params?.refreshToken ?? tokens?.refreshToken ?? undefined;

      if (!refreshToken) {
        throw new Error(
          `${CLIENT}: a refresh token is required. Call exchangeCode() first or provide refreshToken in params.`,
        );
      }

      const tokenSet = await postToTokenEndpoint({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      });

      tokens = tokenSet;
      return tokenSet;
    },

    async getLogoutUrl(params?: {
      idToken?: string;
      postLogoutRedirectUri?: string;
    }): Promise<string> {
      const {end_session_endpoint} = await oidcPromise;
      const idToken = params?.idToken ?? tokens?.idToken ?? undefined;

      const url = new URL(end_session_endpoint);
      if (idToken) {
        url.searchParams.set('id_token_hint', idToken);
      }
      if (params?.postLogoutRedirectUri) {
        url.searchParams.set(
          'post_logout_redirect_uri',
          params.postLogoutRedirectUri,
        );
      }

      return url.toString();
    },

    async fetch(
      operation: string,
      options?: CustomerRequestOptions,
    ): Promise<Response> {
      const accessToken = resolveAccessToken(options);
      const graphqlClient = await getGraphqlClient();

      const {
        customerAccessToken: _ignored,
        apiVersion,
        headers,
        ...restOptions
      } = options ?? {};

      const baseUrl = await apiUrlPromise;
      const url = apiVersion
        ? replaceVersionInUrl(baseUrl, apiVersion)
        : undefined;

      return graphqlClient.fetch(operation, {
        ...restOptions,
        ...(url ? {url} : {}),
        headers: {
          ...headers,
          [AUTHORIZATION_HEADER]: `Bearer ${accessToken}`,
        },
      });
    },

    async request<TData = unknown>(
      operation: string,
      options?: CustomerRequestOptions,
    ) {
      const accessToken = resolveAccessToken(options);
      const graphqlClient = await getGraphqlClient();

      const {
        customerAccessToken: _ignored,
        apiVersion,
        headers,
        ...restOptions
      } = options ?? {};

      const baseUrl = await apiUrlPromise;
      const url = apiVersion
        ? replaceVersionInUrl(baseUrl, apiVersion)
        : undefined;

      return graphqlClient.request<TData>(operation, {
        ...restOptions,
        ...(url ? {url} : {}),
        headers: {
          ...headers,
          [AUTHORIZATION_HEADER]: `Bearer ${accessToken}`,
        },
      });
    },
  };

  return Object.freeze(client);
}
