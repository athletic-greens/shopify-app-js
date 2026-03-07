import {CLIENT} from './constants';

export function validateRequiredStoreDomain(
  storeDomain: string | undefined,
): void {
  if (!storeDomain || typeof storeDomain !== 'string') {
    throw new Error(`${CLIENT}: a valid store domain must be provided`);
  }
}

export function validateRequiredClientId(clientId: string | undefined): void {
  if (!clientId || typeof clientId !== 'string') {
    throw new Error(
      `${CLIENT}: a client ID must be provided - this is your app's OAuth client ID`,
    );
  }
}

export function validateRequiredRedirectUri(
  redirectUri: string | undefined,
): void {
  if (!redirectUri || typeof redirectUri !== 'string') {
    throw new Error(
      `${CLIENT}: a redirect URI must be provided for the OAuth flow`,
    );
  }
}
