import {
  CustomFetchApi,
  ApiClientLogger,
  ApiClientLogContentTypes,
  ClientResponse,
} from '@shopify/graphql-client';

export type CustomerApiClientLogContentTypes = ApiClientLogContentTypes;

export interface CustomerApiClientConfig {
  storeDomain: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  clientName?: string;
  headers: Record<string, string>;
}

export interface CustomerApiClientOptions {
  storeDomain: string;
  clientId: string;
  /** Optional client secret for confidential clients (server-side apps). When provided, the client uses Basic Auth on token requests and omits PKCE. */
  clientSecret?: string;
  redirectUri: string;
  clientName?: string;
  retries?: number;
  customFetchApi?: CustomFetchApi;
  logger?: ApiClientLogger<CustomerApiClientLogContentTypes>;
}

export interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

export interface CustomerTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;
}

export interface GetAuthorizationUrlParams {
  scope?: string;
  state?: string;
  nonce?: string;
}

export interface GetAuthorizationUrlResult {
  url: string;
  /** The PKCE code verifier to store for use in `exchangeCode()`. Only present for public clients (when no `clientSecret` was provided). */
  codeVerifier?: string;
  state: string;
  nonce: string;
}

export interface ExchangeCodeParams {
  code: string;
  /** Required for public clients. Omit for confidential clients (when `clientSecret` was provided at construction). */
  codeVerifier?: string;
}

export interface RefreshTokenParams {
  refreshToken: string;
}

export interface CustomerRequestOptions {
  customerAccessToken?: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
  apiVersion?: string;
  retries?: number;
  signal?: AbortSignal;
}

export interface CustomerQueries {
  [key: string]: {variables: any; return: any};
  [key: number | symbol]: never;
}

export interface CustomerMutations {
  [key: string]: {variables: any; return: any};
  [key: number | symbol]: never;
}

export type CustomerOperations = CustomerQueries & CustomerMutations;

export interface CustomerApiClient {
  readonly config: Readonly<CustomerApiClientConfig>;
  getHeaders(customHeaders?: Record<string, string>): Record<string, string>;

  setTokens(tokenSet: CustomerTokenSet): void;
  getTokens(): CustomerTokenSet | null;

  getAuthorizationUrl(
    params?: GetAuthorizationUrlParams,
  ): Promise<GetAuthorizationUrlResult>;
  exchangeCode(params: ExchangeCodeParams): Promise<CustomerTokenSet>;
  refreshToken(params?: RefreshTokenParams): Promise<CustomerTokenSet>;
  getLogoutUrl(params?: {
    idToken?: string;
    postLogoutRedirectUri?: string;
  }): Promise<string>;

  fetch(operation: string, options?: CustomerRequestOptions): Promise<Response>;
  request<TData = unknown>(
    operation: string,
    options?: CustomerRequestOptions,
  ): Promise<ClientResponse<TData>>;
}

export type {CustomFetchApi, ClientResponse};
