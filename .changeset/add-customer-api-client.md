---
'@shopify/customer-api-client': minor
---

Add `@shopify/customer-api-client` package for the Shopify Customer Account API.

The new `createCustomerApiClient()` factory provides:

- Full PKCE OAuth 2.0 flow helpers (`getAuthorizationUrl`, `exchangeCode`, `refreshToken`, `getLogoutUrl`)
- Authenticated GraphQL requests (`fetch`, `request`) using per-user customer access tokens
- Lazy endpoint discovery via `/.well-known/openid-configuration` and `/.well-known/customer-account-api`
- In-memory token state management (`setTokens`, `getTokens`) for use across requests within a session
- Browser-safe implementation using the Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`)
- Compatible with `@shopify/api-codegen-preset` using `ApiType.Customer`
