import {
  CustomFetchApi,
  ApiClientLogger,
  ApiClientLogContentTypes,
  ClientResponse,
  AllOperations,
  OperationVariables,
  ReturnData,
} from '@shopify/graphql-client';

export type CustomerApiClientLogContentTypes = ApiClientLogContentTypes;

export interface CustomerApiClientConfig {
  storeDomain: string;
  apiVersion?: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  clientName?: string;
  headers: Record<string, string>;
}

export interface CustomerApiClientOptions {
  storeDomain: string;
  /** The default API version to use for all requests (e.g. `'2026-01'`). Can be overridden per request via `options.apiVersion`. */
  apiVersion?: string;
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

/** Base request options without variables (variables are typed per-operation). */
export interface CustomerRequestBaseOptions {
  customerAccessToken?: string;
  headers?: Record<string, string>;
  apiVersion?: string;
  retries?: number;
  signal?: AbortSignal;
}

/** Full request options — used when the operation is not in the type registry. */
export type CustomerRequestOptions = CustomerRequestBaseOptions & {
  variables?: Record<string, unknown>;
};

export interface CustomerQueries {
  [key: string]: {variables: any; return: any};
  [key: number | symbol]: never;
}

export interface CustomerMutations {
  [key: string]: {variables: any; return: any};
  [key: number | symbol]: never;
}

export type CustomerOperations = CustomerQueries & CustomerMutations;

/** Typed request options: base options merged with the operation's variable types when known. */
export type CustomerApiClientRequestOptions<
  Operation extends keyof Operations,
  Operations extends AllOperations,
> = CustomerRequestBaseOptions &
  (Operation extends keyof Operations
    ? OperationVariables<Operation, Operations>
    : {variables?: Record<string, any>});

export type CustomerApiClientRequest<
  Operations extends AllOperations = AllOperations,
> = <TData = undefined, Operation extends keyof Operations = string>(
  operation: Operation,
  options?: CustomerApiClientRequestOptions<Operation, Operations>,
) => Promise<
  ClientResponse<
    TData extends undefined ? ReturnData<Operation, Operations> : TData
  >
>;

export type CustomerApiClientFetch<
  Operations extends AllOperations = AllOperations,
> = <Operation extends keyof Operations = string>(
  operation: Operation,
  options?: CustomerApiClientRequestOptions<Operation, Operations>,
) => Promise<Response>;

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

  fetch: CustomerApiClientFetch<CustomerOperations>;
  request: CustomerApiClientRequest<CustomerOperations>;
}

export type {CustomFetchApi, ClientResponse};
