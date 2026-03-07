export const DEFAULT_CONTENT_TYPE = 'application/json';
export const DEFAULT_SDK_VARIANT = 'customer-api-client';
// This value is replaced with package.json version during rollup build process
export const DEFAULT_CLIENT_VERSION = 'ROLLUP_REPLACE_CLIENT_VERSION';

export const AUTHORIZATION_HEADER = 'Authorization';
export const SDK_VARIANT_HEADER = 'X-SDK-Variant';
export const SDK_VERSION_HEADER = 'X-SDK-Version';
export const SDK_VARIANT_SOURCE_HEADER = 'X-SDK-Variant-Source';

export const CLIENT = 'Customer API Client';

export const OIDC_DISCOVERY_PATH = '/.well-known/openid-configuration';
export const API_DISCOVERY_PATH = '/.well-known/customer-account-api';

export const DEFAULT_SCOPE =
  'openid email https://api.customers.com/auth/customer.graphql';
