# Customer API Client

The Customer API Client manages OAuth authentication and provides methods to interact with the [Shopify Customer Account API](https://shopify.dev/docs/api/customer). It handles the complete PKCE OAuth flow and makes authenticated GraphQL requests on behalf of logged-in customers.

## Getting started

Using your preferred package manager, install this package in a project:

```sh
yarn add @shopify/customer-api-client
```

```sh
npm install @shopify/customer-api-client --s
```

```sh
pnpm add @shopify/customer-api-client
```

### CDN

The UMD builds of each release version are available via the [`unpkg` CDN](https://unpkg.com/browse/@shopify/customer-api-client@latest/dist/umd/)

```html
<script src="https://unpkg.com/@shopify/customer-api-client@latest/dist/umd/customer-api-client.min.js"></script>

<script>
  const client = ShopifyCustomerAPIClient.createCustomerApiClient({...});
</script>
```

## Initialization

The client is safe to use in browser environments — customer tokens are user-scoped and do not need to be kept server-side only.

```typescript
import {createCustomerApiClient} from '@shopify/customer-api-client';

const client = createCustomerApiClient({
  storeDomain: 'your-shop-name.myshopify.com',
  clientId: 'your-oauth-client-id',
  redirectUri: 'https://your-app.example.com/auth/callback',
});
```

The client performs two discovery requests immediately on construction (they are not awaited until first use):

- `GET https://{storeDomain}/.well-known/openid-configuration` — provides the OAuth endpoints (`authorization_endpoint`, `token_endpoint`, `end_session_endpoint`)
- `GET https://{storeDomain}/.well-known/customer-account-api` — provides the GraphQL API URL (`graphql_api`)

### `createCustomerApiClient()` parameters

| Property        | Type                                                                    | Description                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| storeDomain     | `string`                                                                | The domain of the store. Can be the Shopify `myshopify.com` domain or a custom store domain.                                                                                            |
| clientId        | `string`                                                                | Your app's OAuth client ID.                                                                                                                                                             |
| redirectUri     | `string`                                                                | The URI to redirect to after authorization. Must match one of the redirect URIs configured for your app.                                                                                |
| clientName?     | `string`                                                                | Name of the client. Included in request headers as `X-SDK-Variant-Source`.                                                                                                             |
| retries?        | `number`                                                                | The number of HTTP request retries if the request was abandoned or the server responded with a `Too Many Requests (429)` or `Service Unavailable (503)` response. Default value is `0`. |
| customFetchApi? | `(url: string, init?: {method?: string, headers?: HeaderInit, body?: string}) => Promise<Response>` | A replacement `fetch` function used for all client network requests. By default, the client uses the global `fetch`.                                            |
| logger?         | `(logContent: HTTPResponseLog \| HTTPRetryLog) => void`                 | A logger function that accepts log content objects.                                                                                                                                     |

## Client properties

| Property            | Type                                                                                                                              | Description                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| config              | [`CustomerApiClientConfig`](#customerapiclientconfig-properties)                                                                  | Configuration for the client.                                                                                                           |
| getHeaders          | `(headers?: Record<string, string>) => Record<string, string>`                                                                    | Returns Customer API specific headers. If additional `headers` are provided, they are merged into the returned headers object.           |
| setTokens           | `(tokenSet: CustomerTokenSet) => void`                                                                                            | Stores a token set in the client. Call this to restore tokens after a page reload.                                                      |
| getTokens           | `() => CustomerTokenSet \| null`                                                                                                  | Returns the currently stored token set, or `null` if no tokens have been set.                                                           |
| getAuthorizationUrl | `(params?: GetAuthorizationUrlParams) => Promise<GetAuthorizationUrlResult>`                                                      | Generates a PKCE authorization URL. Store the returned `codeVerifier` securely for use in `exchangeCode()`.                             |
| exchangeCode        | `(params: ExchangeCodeParams) => Promise<CustomerTokenSet>`                                                                       | Exchanges an authorization code for a token set. Automatically calls `setTokens()` with the result.                                    |
| refreshToken        | `(params?: RefreshTokenParams) => Promise<CustomerTokenSet>`                                                                      | Refreshes the access token using a refresh token. Uses the stored refresh token if `params.refreshToken` is not provided. Calls `setTokens()` with the result. |
| getLogoutUrl        | `(params?: {idToken?: string; postLogoutRedirectUri?: string}) => Promise<string>`                                                | Returns the end-session URL. Uses the stored `idToken` if `params.idToken` is not provided.                                             |
| fetch               | `(operation: string, options?: CustomerRequestOptions) => Promise<Response>`                                                      | Fetches data from the Customer Account API. Uses the stored access token unless `options.customerAccessToken` is provided.              |
| request             | `<TData>(operation: string, options?: CustomerRequestOptions) => Promise<ClientResponse<TData>>`                                  | Requests data from the Customer Account API and returns a normalized response object. Uses the stored access token unless `options.customerAccessToken` is provided. |

## `CustomerApiClientConfig` properties

| Name        | Type                       | Description                                                      |
| ----------- | -------------------------- | ---------------------------------------------------------------- |
| storeDomain | `string`                   | The normalized store domain URL                                  |
| clientId    | `string`                   | The OAuth client ID                                              |
| redirectUri | `string`                   | The OAuth redirect URI                                           |
| clientName? | `string`                   | The provided client name                                         |
| headers     | `Record<string, string>`   | The base headers generated by the client during initialization   |

## `CustomerRequestOptions` properties

| Name                  | Type                     | Description                                                                                                                                                                                                                                      |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| customerAccessToken?  | `string`                 | An access token to use for this request. Overrides the stored token. If neither this option nor a stored token is available, the method throws an error.                                                                                          |
| variables?            | `Record<string, any>`    | Variable values needed in the GraphQL operation.                                                                                                                                                                                                 |
| apiVersion?           | `string`                 | Overrides the API version in the discovered GraphQL URL for this request (e.g. `'2024-10'`).                                                                                                                                                     |
| headers?              | `Record<string, string>` | Custom headers to include in the API request.                                                                                                                                                                                                    |
| retries?              | `number`                 | Alternative number of retries for the request. Retries only occur for requests that were abandoned or if the server responds with a `Too Many Request (429)` or `Service Unavailable (503)` response. Minimum value is `0` and maximum value is `3`. |

## `CustomerTokenSet`

| Name           | Type     | Description                                                 |
| -------------- | -------- | ----------------------------------------------------------- |
| accessToken    | `string` | The customer access token used to authenticate API requests |
| refreshToken?  | `string` | Token used to obtain a new access token when it expires     |
| expiresIn?     | `number` | Number of seconds until the access token expires            |
| idToken?       | `string` | OpenID Connect ID token for the customer session            |

## `GetAuthorizationUrlParams`

| Name    | Type     | Description                                                                                  |
| ------- | -------- | -------------------------------------------------------------------------------------------- |
| scope?  | `string` | OAuth scopes to request. Defaults to `openid email https://api.customers.com/auth/customer.graphql` |
| state?  | `string` | Random string to prevent CSRF attacks. Generated automatically if not provided.              |
| nonce?  | `string` | Random string for replay attack prevention. Generated automatically if not provided.         |

## `GetAuthorizationUrlResult`

| Name         | Type     | Description                                                                     |
| ------------ | -------- | ------------------------------------------------------------------------------- |
| url          | `string` | The authorization URL to redirect the customer to                               |
| codeVerifier | `string` | The PKCE code verifier. Store this securely and pass it to `exchangeCode()`     |
| state        | `string` | The state parameter used in the authorization request                           |
| nonce        | `string` | The nonce parameter used in the authorization request                           |

## `ClientResponse<TData>`

| Name        | Type                                | Description                                                                                                                                                                         |
| ----------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data?       | `TData \| any`                      | Data returned from the Customer Account API. If `TData` was provided to the function, the return type is `TData`, else it returns type `any`.                                       |
| errors?     | [`ResponseErrors`](#responseerrors) | Errors object that contains any API or network errors that occurred while fetching the data from the API. It does not include any `UserErrors`.                                     |
| extensions? | `Record<string, any>`               | Additional information on the GraphQL response data and context.                                                                                                                    |

## `ResponseErrors`

| Name               | Type       | Description                                         |
| ------------------ | ---------- | --------------------------------------------------- |
| networkStatusCode? | `number`   | HTTP response status code                           |
| message?           | `string`   | The provided error message                          |
| graphQLErrors?     | `any[]`    | The GraphQL API errors returned by the server       |
| response?          | `Response` | The raw response object from the network fetch call |

## Usage examples

### Complete OAuth PKCE flow

```typescript
import {createCustomerApiClient} from '@shopify/customer-api-client';

const client = createCustomerApiClient({
  storeDomain: 'your-shop-name.myshopify.com',
  clientId: 'your-oauth-client-id',
  redirectUri: 'https://your-app.example.com/auth/callback',
});

// Step 1: Generate the authorization URL and redirect the customer
const {url, codeVerifier, state, nonce} = await client.getAuthorizationUrl();

// Store codeVerifier and state securely (e.g., in sessionStorage) before redirecting
sessionStorage.setItem('codeVerifier', codeVerifier);
sessionStorage.setItem('oauthState', state);
window.location.href = url;

// Step 2: On the callback page, exchange the authorization code for tokens
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const returnedState = urlParams.get('state');

const savedState = sessionStorage.getItem('oauthState');
const savedCodeVerifier = sessionStorage.getItem('codeVerifier');

if (returnedState !== savedState) {
  throw new Error('State mismatch — possible CSRF attack');
}

const tokenSet = await client.exchangeCode({
  code,
  codeVerifier: savedCodeVerifier,
});

// Persist tokens for future page loads (e.g., localStorage, cookies)
localStorage.setItem('customerTokens', JSON.stringify(tokenSet));
```

### Restore tokens after a page reload

```typescript
const stored = localStorage.getItem('customerTokens');
if (stored) {
  client.setTokens(JSON.parse(stored));
}
```

### Refresh an expired access token

```typescript
// Uses the stored refresh token automatically if one was set via setTokens() or exchangeCode()
const newTokenSet = await client.refreshToken();

// Or pass the refresh token explicitly
const newTokenSet = await client.refreshToken({
  refreshToken: 'your-refresh-token',
});
```

### Make an authenticated GraphQL request

```typescript
const orderQuery = `
  query CustomerOrders {
    customer {
      orders(first: 5) {
        nodes {
          id
          name
          totalPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

// Uses the stored access token automatically
const {data, errors, extensions} = await client.request(orderQuery);
```

### Make a request with a per-request access token

```typescript
const {data, errors} = await client.request(orderQuery, {
  customerAccessToken: 'customer-access-token',
});
```

### Log out the customer

```typescript
// Returns the end-session URL; redirect the customer to it to complete logout
const logoutUrl = await client.getLogoutUrl({
  postLogoutRedirectUri: 'https://your-app.example.com',
});

window.location.href = logoutUrl;
```

### Dynamically set the API version per request

```typescript
const {data, errors} = await client.request(orderQuery, {
  apiVersion: '2024-10',
});
```

## Typing variables and return objects

This client is compatible with the `@shopify/api-codegen-preset` package.
You can use that package to create types from your operations with the [Codegen CLI](https://www.graphql-cli.com/codegen/).

There are different ways to [configure codegen](../api-codegen-preset#configuration) with it, but the simplest way is to:

1. Add the preset package as a dev dependency to your project, for example:
   ```bash
   npm install --save-dev @shopify/api-codegen-preset
   ```
1. Create a `.graphqlrc.ts` file in your root containing:

   ```ts
   import {ApiType, shopifyApiProject} from '@shopify/api-codegen-preset';

   export default {
     projects: {
       default: shopifyApiProject({
         apiType: ApiType.Customer,
         outputDir: './types',
       }),
     },
   };
   ```

1. Add `"graphql-codegen": "graphql-codegen"` to your `scripts` section in `package.json`.
1. Tag your operations with `#graphql`, for example:
   ```ts
   const {data, errors} = await client.request(
     `#graphql
     query CustomerOrders {
       customer {
         orders(first: 5) {
           nodes {
             id
             name
           }
         }
       }
     }`,
   );
   console.log(data?.customer.orders.nodes);
   ```
1. Run `npm run graphql-codegen` to parse the types from your operations.

> [!NOTE]
> Remember to ensure that your tsconfig includes the files under `./types`!

Once the script runs, it'll create the file `./types/customer.generated.d.ts`.
When TS includes that file, it'll automatically cause the client to detect the types for each query.

## Log Content Types

### `HTTPResponseLog`

This log content is sent to the logger whenever an HTTP response is received by the client.

| Property | Type                                                                      | Description                                                 |
| -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| type     | `LogType['HTTP-Response']`                                                | The type of log content. Is always set to `HTTP-Response`   |
| content  | `{requestParams: [url, init?], response: Response}`                       | Contextual data regarding the request and received response |

### `HTTPRetryLog`

This log content is sent to the logger whenever the client attempts to retry HTTP requests.

| Property | Type                                                                                                                     | Description                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| type     | `LogType['HTTP-Retry']`                                                                                                  | The type of log content. Is always set to `HTTP-Retry`                                                                                                                                                                                                                           |
| content  | `{requestParams: [url, init?], lastResponse?: Response, retryAttempt: number, maxRetries: number}`                       | Contextual data regarding the upcoming retry attempt.                                                                                                                                                                                                                            |
