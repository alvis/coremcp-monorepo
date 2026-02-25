import { createHash, randomBytes } from 'node:crypto';

import { makeRequest } from './helpers';

import type { RequestResponse } from './helpers';
import type { TestServerInstance } from './setup';

/**
 * PKCE code verifier and challenge pair
 */
export interface PKCEPair {
  /** code verifier (random string) */
  codeVerifier: string;
  /** code challenge (base64url encoded SHA256 hash of verifier) */
  codeChallenge: string;
  /** code challenge method (always 'S256' for SHA256) */
  codeChallengeMethod: 'S256';
}

/**
 * OAuth client registration data
 */
export interface ClientRegistration {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
}

/**
 * OAuth token response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * PAR (Pushed Authorization Request) response
 */
export interface PARResponse {
  request_uri: string;
  expires_in: number;
}

/**
 * options for creating a PAR request
 */
export interface PARRequestOptions {
  server: TestServerInstance;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  pkce: PKCEPair;
  scope?: string;
}

/**
 * options for exchanging an authorization code for tokens
 */
export interface TokenExchangeOptions {
  server: TestServerInstance;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/**
 * generates a PKCE code verifier and challenge pair
 * @returns PKCE pair with verifier, challenge, and method
 * @see https://datatracker.ietf.org/doc/html/rfc7636
 */
export function generatePKCE(): PKCEPair {
  const codeVerifier = base64urlEncode(randomBytes(32));

  const hash = createHash('sha256');
  hash.update(codeVerifier);
  const codeChallenge = base64urlEncode(hash.digest());

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * base64url encodes a buffer (URL-safe base64 without padding)
 * @param buffer - buffer to encode
 * @returns base64url encoded string
 */
function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * registers a dynamic OAuth client with the authorization server
 * @param server - test server instance
 * @param registration - partial client registration data
 * @returns client registration response
 */
export async function registerClient(
  server: TestServerInstance,
  registration?: Partial<ClientRegistration>,
): Promise<ClientRegistration> {
  const response = await makeRequest<ClientRegistration>(
    server,
    '/oauth/register',
    {
      method: 'POST',
      body: {
        client_name: registration?.client_name ?? 'Test Client',
        redirect_uris: registration?.redirect_uris ?? [
          'https://example.com/callback',
        ],
        grant_types: registration?.grant_types ?? [
          'authorization_code',
          'refresh_token',
        ],
        response_types: registration?.response_types ?? ['code'],
        scope: registration?.scope ?? 'mcp read write',
      },
    },
  );

  if (response.status !== 201) {
    throw new Error(
      `Client registration failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  return response.data;
}

/**
 * creates a PAR (Pushed Authorization Request) and returns the request_uri
 * @param options - PAR request options
 * @returns PAR response with request_uri
 */
export async function createPARRequest(
  options: PARRequestOptions,
): Promise<PARResponse> {
  const { server, clientId, clientSecret, redirectUri, pkce } = options;
  const scope = options.scope ?? 'mcp read write';

  const response = await makeRequest<PARResponse>(server, '/oauth/par', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
      state: `state-${Date.now()}`,
    }).toString(),
  });

  if (response.status !== 201) {
    throw new Error(
      `PAR request failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  return response.data;
}

/**
 * performs authorization request and extracts authorization code from redirect
 * @param server - test server instance
 * @param clientId - OAuth client ID
 * @param redirectUri - redirect URI
 * @param requestUri - PAR request URI (optional, if using PAR flow)
 * @param pkce - PKCE pair (optional, if not using PAR flow)
 * @returns authorization code
 */
export async function authorize(
  server: TestServerInstance,
  clientId: string,
  redirectUri: string,
  requestUri?: string,
  pkce?: PKCEPair,
): Promise<string> {
  const params: Record<string, string> = {
    client_id: clientId,
  };

  if (requestUri) {
    params.request_uri = requestUri;
  } else if (pkce) {
    params.redirect_uri = redirectUri;
    params.response_type = 'code';
    params.code_challenge = pkce.codeChallenge;
    params.code_challenge_method = pkce.codeChallengeMethod;
    params.scope = 'mcp read write';
    params.state = `state-${Date.now()}`;
  } else {
    throw new Error('Either requestUri or pkce must be provided');
  }

  const response = await makeRequest(server, '/oauth/authorize', {
    method: 'GET',
    query: params,
  });

  if (response.status !== 302 && response.status !== 303) {
    throw new Error(
      `Authorization failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  const location = response.headers.location as string;
  if (!location) {
    throw new Error(
      `Authorization redirect missing Location header: ${JSON.stringify(response.headers)}`,
    );
  }

  const url = new URL(location, 'https://example.com');
  const code = url.searchParams.get('code');

  if (!code) {
    throw new Error(
      `Authorization code not found in redirect URL: ${location}`,
    );
  }

  return code;
}

/**
 * exchanges authorization code for access token
 * @param options - token exchange options
 * @returns token response
 */
export async function exchangeCodeForToken(
  options: TokenExchangeOptions,
): Promise<TokenResponse> {
  const { server, clientId, clientSecret, code, redirectUri, codeVerifier } =
    options;

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  };

  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await makeRequest<TokenResponse>(server, '/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  if (response.status !== 200) {
    throw new Error(
      `Token exchange failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  return response.data;
}

/**
 * introspects an access token
 * @param server - test server instance
 * @param token - access token to introspect
 * @param clientId - OAuth client ID (for authentication)
 * @param clientSecret - OAuth client secret (for authentication)
 * @returns introspection response
 */
export async function introspectToken(
  server: TestServerInstance,
  token: string,
  clientId?: string,
  clientSecret?: string,
): Promise<{ active: boolean; [key: string]: unknown }> {
  const body: Record<string, string> = {
    token,
  };

  if (clientId) {
    body.client_id = clientId;
  }
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await makeRequest<{
    active: boolean;
    [key: string]: unknown;
  }>(server, '/oauth/introspect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  if (response.status !== 200) {
    throw new Error(
      `Token introspection failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  return response.data;
}

/**
 * revokes an access or refresh token
 * @param server - test server instance
 * @param token - token to revoke
 * @param tokenTypeHint - hint about token type ('access_token' or 'refresh_token')
 * @param clientId - OAuth client ID (for authentication)
 * @param clientSecret - OAuth client secret (for authentication)
 * @returns response
 */
export async function revokeToken(
  server: TestServerInstance,
  token: string,
  tokenTypeHint?: 'access_token' | 'refresh_token',
  clientId?: string,
  clientSecret?: string,
): Promise<RequestResponse> {
  const body: Record<string, string> = {
    token,
  };

  if (tokenTypeHint) {
    body.token_type_hint = tokenTypeHint;
  }
  if (clientId) {
    body.client_id = clientId;
  }
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  return makeRequest(server, '/oauth/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
}

/**
 * refreshes an access token using a refresh token
 * @param server - test server instance
 * @param refreshToken - refresh token
 * @param clientId - OAuth client ID
 * @param clientSecret - OAuth client secret (if confidential client)
 * @returns new token response
 */
export async function refreshAccessToken(
  server: TestServerInstance,
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  };

  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const response = await makeRequest<TokenResponse>(server, '/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  if (response.status !== 200) {
    throw new Error(
      `Token refresh failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  return response.data;
}

/**
 * performs complete OAuth flow (register -> PAR -> authorize -> token)
 * @param server - test server instance
 * @param usePAR - whether to use PAR flow
 * @returns object with client, tokens, and PKCE pair
 */
export async function completeOAuthFlow(
  server: TestServerInstance,
  usePAR = true,
): Promise<{
  client: ClientRegistration;
  tokens: TokenResponse;
  pkce: PKCEPair;
  code: string;
}> {
  const client = await registerClient(server);

  const pkce = generatePKCE();

  let code: string;
  if (usePAR) {
    const parResponse = await createPARRequest({
      server,
      clientId: client.client_id,
      clientSecret: client.client_secret!,
      redirectUri: client.redirect_uris[0],
      pkce,
    });

    code = await authorize(
      server,
      client.client_id,
      client.redirect_uris[0],
      parResponse.request_uri,
    );
  } else {
    code = await authorize(
      server,
      client.client_id,
      client.redirect_uris[0],
      undefined,
      pkce,
    );
  }

  const tokens = await exchangeCodeForToken({
    server,
    clientId: client.client_id,
    clientSecret: client.client_secret,
    code,
    redirectUri: client.redirect_uris[0],
    codeVerifier: pkce.codeVerifier,
  });

  return { client, tokens, pkce, code };
}
