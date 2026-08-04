import {
  createGraphQLClient,
  validateDomainAndGetStoreUrl,
} from '@shopify/graphql-client';

import {
  API_DISCOVERY_PATH,
  AUTHORIZATION_HEADER,
  CLIENT,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_SCOPE,
  OIDC_DISCOVERY_PATH,
  SDK_VARIANT_HEADER,
  SDK_VARIANT_SOURCE_HEADER,
  SDK_VERSION_HEADER,
} from './constants';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateRandomString,
} from './pkce';
import {
  CustomFetchApi,
  CustomerApiClient,
  CustomerApiClientConfig,
  CustomerApiClientOptions,
  CustomerApiClientRequestOptions,
  CustomerOperations,
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

/**
 * Read a discovery response body as JSON, turning the engine-specific parse
 * failure into something attributable. Safari rejects `Response.json()` with a
 * bare DOMException — "The string did not match the expected pattern" — thrown
 * inside native code, so it reaches error reporting with no JS frames and no
 * indication of which request produced it.
 *
 * `name` stays `SyntaxError` deliberately: callers classify this failure as
 * retryable by error name, and the original is kept on `cause`.
 */
async function parseDiscoveryJson<T>(
  response: Response,
  label: 'OIDC' | 'API',
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (cause) {
    const error = new Error(
      `${CLIENT}: ${label} discovery response was not valid JSON (status ${response.status}). The body was most likely an intercepted or cached non-JSON response.`,
      {cause},
    );
    error.name = 'SyntaxError';
    throw error;
  }
}

export function createCustomerApiClient({
  storeDomain,
  apiVersion: defaultApiVersion,
  clientId,
  clientSecret,
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
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `${CLIENT}: OIDC discovery request failed with status ${response.status}. Ensure the store domain is correct.`,
      );
    }
    return parseDiscoveryJson<OidcConfig>(response, 'OIDC');
  });

  const apiUrlPromise: Promise<string> = fetchFn(
    `${storeUrl}${API_DISCOVERY_PATH}`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `${CLIENT}: API discovery request failed with status ${response.status}. Ensure the store domain is correct.`,
        );
      }
      return parseDiscoveryJson<{graphql_api: string}>(response, 'API');
    })
    .then((data: {graphql_api: string}) => {
      if (!data.graphql_api) {
        throw new Error(
          `${CLIENT}: API discovery response did not include a graphql_api URL.`,
        );
      }
      return data.graphql_api;
    });

  // Both discoveries are started eagerly above and are only awaited by the
  // methods that need them — a client used solely for `request()` never awaits
  // oidcPromise, and vice versa. Without a handler attached here, a discovery
  // failure on an unused promise surfaces as an *unhandled* rejection and takes
  // down the page: on mobile Safari that showed up as a bare
  // "SyntaxError: The string did not match the expected pattern" with no JS
  // frames, because the throw happened inside native `Response.json()`.
  //
  // Attaching a no-op catch marks each promise as handled without swallowing
  // anything: every `await`/`then` elsewhere still receives the rejection,
  // since handlers are per-consumer.
  oidcPromise.catch(() => {});
  apiUrlPromise.catch(() => {});

  // Mutable token state (stored in closure, not on frozen config)
  let tokens: CustomerTokenSet | null = null;

  const baseHeaders: Record<string, string> = {
    'Content-Type': DEFAULT_CONTENT_TYPE,
    Accept: DEFAULT_CONTENT_TYPE,
    ...(clientName ? {[SDK_VARIANT_SOURCE_HEADER]: clientName} : {}),
  };

  const config: CustomerApiClientConfig = {
    storeDomain: storeUrl,
    ...(defaultApiVersion ? {apiVersion: defaultApiVersion} : {}),
    clientId,
    ...(clientSecret ? {clientSecret} : {}),
    redirectUri,
    clientName,
    headers: baseHeaders,
  };

  // Wrap fetch to strip SDK telemetry headers that are blocked by the
  // Customer Account API's CORS policy (unlike the Storefront API).
  const graphqlFetchFn: CustomFetchApi = (url, init) => {
    if (init?.headers) {
      const headers = {...(init.headers as Record<string, string>)};
      delete headers[SDK_VARIANT_HEADER];
      delete headers[SDK_VERSION_HEADER];
      return fetchFn(url, {...init, headers});
    }
    return fetchFn(url, init);
  };

  // Eagerly created (and shared) graphql client promise — resolves once API URL discovery completes.
  // Using a promise rather than a lazy assignment avoids the request race in concurrent callers.
  const graphqlClientPromise: Promise<ReturnType<typeof createGraphQLClient>> =
    apiUrlPromise.then((apiUrl) =>
      createGraphQLClient({
        headers: baseHeaders,
        url: apiUrl,
        retries,
        customFetchApi: graphqlFetchFn,
        logger,
      }),
    );

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (clientSecret) {
      headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    }

    const response = await fetchFn(token_endpoint, {
      method: 'POST',
      headers,
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
      ...(data.expires_in == null ? {} : {expiresIn: data.expires_in}),
      ...(data.id_token ? {idToken: data.id_token} : {}),
    };
  }

  const client: CustomerApiClient = {
    config,

    getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
      return {...customHeaders, ...baseHeaders};
    },

    setTokens(tokenSet: CustomerTokenSet): void {
      tokens = tokenSet;
    },

    getTokens(): CustomerTokenSet | null {
      return tokens;
    },

    async getAuthorizationUrl(params?: GetAuthorizationUrlParams): Promise<{
      url: string;
      codeVerifier?: string;
      state: string;
      nonce: string;
    }> {
      const {authorization_endpoint} = await oidcPromise;

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

      const usePkce = !clientSecret;
      let codeVerifier: string | undefined;
      if (usePkce) {
        codeVerifier = await generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
      }

      return {url: url.toString(), codeVerifier, state, nonce};
    },

    async exchangeCode(params: ExchangeCodeParams): Promise<CustomerTokenSet> {
      const isPublicClient = !clientSecret;
      const missingPublicClientCodeVerifier =
        isPublicClient && !params.codeVerifier;
      if (missingPublicClientCodeVerifier) {
        throw new Error(
          `${CLIENT}: codeVerifier is required for public clients. Use the value returned by getAuthorizationUrl().`,
        );
      }

      const tokenSet = await postToTokenEndpoint({
        grant_type: 'authorization_code',
        ...(isPublicClient ? {client_id: clientId} : {}),
        redirect_uri: redirectUri,
        code: params.code,
        ...(isPublicClient && params.codeVerifier
          ? {code_verifier: params.codeVerifier}
          : {}),
      });

      // Token writes are intentionally last-write-wins; concurrent callers are not supported.
      // eslint-disable-next-line require-atomic-updates
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
        ...(clientSecret ? {} : {client_id: clientId}),
        refresh_token: refreshToken,
      });

      // Token writes are intentionally last-write-wins; concurrent callers are not supported.
      // eslint-disable-next-line require-atomic-updates
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

    async fetch<Operation extends keyof CustomerOperations = string>(
      operation: Operation,
      options?: CustomerApiClientRequestOptions<Operation, CustomerOperations>,
    ): Promise<Response> {
      const accessToken = resolveAccessToken(
        options as CustomerRequestOptions | undefined,
      );
      const graphqlClient = await graphqlClientPromise;

      const {
        customerAccessToken: _ignored,
        apiVersion,
        headers,
        ...restOptions
      } = (options ?? {}) as CustomerRequestOptions;

      const resolvedApiVersion = apiVersion ?? defaultApiVersion;
      const baseUrl = await apiUrlPromise;
      const url = resolvedApiVersion
        ? replaceVersionInUrl(baseUrl, resolvedApiVersion)
        : undefined;

      return graphqlClient.fetch(operation as string, {
        ...restOptions,
        ...(url ? {url} : {}),
        headers: {
          ...headers,
          [AUTHORIZATION_HEADER]: accessToken,
        },
      });
    },

    async request<
      TData = undefined,
      Operation extends keyof CustomerOperations = string,
    >(
      operation: Operation,
      options?: CustomerApiClientRequestOptions<Operation, CustomerOperations>,
    ) {
      const accessToken = resolveAccessToken(
        options as CustomerRequestOptions | undefined,
      );
      const graphqlClient = await graphqlClientPromise;

      const {
        customerAccessToken: _ignored,
        apiVersion,
        headers,
        ...restOptions
      } = (options ?? {}) as CustomerRequestOptions;

      const resolvedApiVersion = apiVersion ?? defaultApiVersion;
      const baseUrl = await apiUrlPromise;
      const url = resolvedApiVersion
        ? replaceVersionInUrl(baseUrl, resolvedApiVersion)
        : undefined;

      return graphqlClient.request<TData>(operation as string, {
        ...restOptions,
        ...(url ? {url} : {}),
        headers: {
          ...headers,
          [AUTHORIZATION_HEADER]: accessToken,
        },
      });
    },
  };

  return Object.freeze(client);
}
