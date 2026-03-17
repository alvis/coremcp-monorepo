/**
 * mock OAuth 2.0 authorization server for E2E auth tests (HTTP only)
 *
 * provides a minimal but spec-compliant OAuth 2.1 server with PKCE support,
 * dynamic client registration, token refresh, and scope challenges.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import type { IncomingMessage, Server, ServerResponse } from 'node:http';

// CONSTANTS //

/** default port for the mock auth server */
export const AUTH_SERVER_PORT = 3250;

/** access token expiration time in seconds */
const TOKEN_EXPIRY_SECONDS = 3600;

/** milliseconds per second */
const MS_PER_SECOND = 1000;

// TYPES //

/** registered OAuth client entry */
interface RegisteredClient {
  /** unique client identifier */
  clientId: string;
  /** optional client secret */
  clientSecret?: string;
  /** human-readable client name */
  clientName: string;
  /** allowed redirect URIs */
  redirectUris: string[];
  /** allowed grant types */
  grantTypes: string[];
  /** allowed response types */
  responseTypes: string[];
}

/** authorization code entry */
interface AuthorizationCode {
  /** the code string */
  code: string;
  /** client that requested the code */
  clientId: string;
  /** redirect URI used in the request */
  redirectUri: string;
  /** PKCE code challenge */
  codeChallenge: string;
  /** code challenge method (S256) */
  codeChallengeMethod: string;
  /** requested scopes */
  scope: string;
  /** expiration timestamp */
  expiresAt: number;
  /** resource parameter (RFC 8707) */
  resource?: string;
}

/** issued access token entry */
interface AccessToken {
  /** token string */
  token: string;
  /** client that owns the token */
  clientId: string;
  /** granted scopes */
  scope: string;
  /** expiration timestamp */
  expiresAt: number;
  /** associated refresh token */
  refreshToken?: string;
}

/** issued refresh token entry */
interface RefreshToken {
  /** token string */
  token: string;
  /** client that owns the token */
  clientId: string;
  /** granted scopes */
  scope: string;
}

/** mock auth server state */
interface AuthServerState {
  /** registered clients by client ID */
  clients: Map<string, RegisteredClient>;
  /** pending authorization codes by code value */
  codes: Map<string, AuthorizationCode>;
  /** issued access tokens by token value */
  accessTokens: Map<string, AccessToken>;
  /** issued refresh tokens by token value */
  refreshTokens: Map<string, RefreshToken>;
}

// STATE //

let httpServer: Server | null = null;
let state: AuthServerState = createFreshState();

/**
 * creates a fresh auth server state
 * @returns empty state for the mock auth server
 */
function createFreshState(): AuthServerState {
  return {
    clients: new Map(),
    codes: new Map(),
    accessTokens: new Map(),
    refreshTokens: new Map(),
  };
}

// REQUEST HELPERS //

/**
 * reads the full body of an incoming HTTP request
 * @param req incoming HTTP request
 * @returns the request body as a string
 */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * sends a JSON response
 * @param res server response object
 * @param statusCode HTTP status code
 * @param data response body data
 */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * generates a cryptographically random string
 * @param length number of bytes of randomness
 * @returns hex-encoded random string
 */
function generateRandom(length: number): string {
  return randomBytes(length).toString('hex');
}

// ENDPOINT HANDLERS //

/**
 * handles well-known OAuth authorization server metadata endpoint
 * @param req incoming request
 * @param _req
 * @param res server response
 * @param port server port for constructing URLs
 */
function handleMetadata(
  _req: IncomingMessage,
  res: ServerResponse,
  port: number,
): void {
  const baseUrl = `http://localhost:${port}`;

  sendJson(res, 200, {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    introspection_endpoint: `${baseUrl}/introspect`,
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:admin', 'mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
  });
}

/**
 * handles dynamic client registration
 * @param req incoming request
 * @param res server response
 */
async function handleRegister(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();

    return;
  }

  const body = await readBody(req);
  const data = JSON.parse(body) as {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
  };

  const clientId = `client-${generateRandom(8)}`;
  const client: RegisteredClient = {
    clientId,
    clientName: data.client_name ?? 'Unknown Client',
    redirectUris: data.redirect_uris ?? [],
    grantTypes: data.grant_types ?? ['authorization_code', 'refresh_token'],
    responseTypes: data.response_types ?? ['code'],
  };

  state.clients.set(clientId, client);

  // RFC 7591 section 3.2.1: server MUST respond with HTTP 201 Created
  sendJson(res, 201, {
    client_id: clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: client.responseTypes,
    token_endpoint_auth_method: 'none',
  });
}

/**
 * handles authorization endpoint
 * @param req incoming request
 * @param res server response
 */
function handleAuthorize(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const codeChallenge = url.searchParams.get('code_challenge') ?? '';
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? 'S256';
  const scope = url.searchParams.get('scope') ?? '';
  const stateParam = url.searchParams.get('state') ?? '';
  const resource = url.searchParams.get('resource') ?? undefined;

  // PKCE is required: reject if code_challenge is missing
  if (!codeChallenge) {
    sendJson(res, 400, {
      error: 'invalid_request',
      error_description: 'code_challenge is required for PKCE',
    });

    return;
  }

  // auto-approve: generate authorization code immediately
  const code = generateRandom(16);
  const authCode: AuthorizationCode = {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    expiresAt: Date.now() + 5 * 60 * MS_PER_SECOND, // 5 minutes
    resource,
  };

  state.codes.set(code, authCode);

  // redirect back with code and state
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('code', code);

  if (stateParam) {
    callbackUrl.searchParams.set('state', stateParam);
  }

  res.writeHead(302, { Location: callbackUrl.toString() });
  res.end();
}

/**
 * handles token endpoint for code exchange and refresh
 * @param req incoming request
 * @param res server response
 */
async function handleToken(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();

    return;
  }

  const body = await readBody(req);
  const params = new URLSearchParams(body);

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    await handleAuthorizationCodeGrant(params, res);
  } else if (grantType === 'refresh_token') {
    handleRefreshTokenGrant(params, res);
  } else {
    sendJson(res, 400, {
      error: 'unsupported_grant_type',
      error_description: `Grant type not supported: ${grantType ?? 'none'}`,
    });
  }
}

/**
 * processes authorization code grant type
 * @param params URL search params from the token request
 * @param res server response
 */
async function handleAuthorizationCodeGrant(
  params: URLSearchParams,
  res: ServerResponse,
): Promise<void> {
  const code = params.get('code') ?? '';
  const codeVerifier = params.get('code_verifier') ?? '';
  const clientId = params.get('client_id') ?? '';

  const authCode = state.codes.get(code);

  if (!authCode) {
    sendJson(res, 400, {
      error: 'invalid_grant',
      error_description: 'Authorization code not found or expired',
    });

    return;
  }

  // verify client ID
  if (authCode.clientId !== clientId) {
    sendJson(res, 400, {
      error: 'invalid_grant',
      error_description: 'Client ID mismatch',
    });

    return;
  }

  // verify PKCE
  if (authCode.codeChallenge) {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');

    if (hash !== authCode.codeChallenge) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'Invalid code_verifier',
      });

      return;
    }
  }

  // check expiration
  if (Date.now() > authCode.expiresAt) {
    state.codes.delete(code);
    sendJson(res, 400, {
      error: 'invalid_grant',
      error_description: 'Authorization code expired',
    });

    return;
  }

  // consume the code (one-time use)
  state.codes.delete(code);

  // issue tokens
  const accessToken = generateRandom(32);
  const refreshToken = generateRandom(32);

  state.accessTokens.set(accessToken, {
    token: accessToken,
    clientId,
    scope: authCode.scope,
    expiresAt: Date.now() + TOKEN_EXPIRY_SECONDS * MS_PER_SECOND,
    refreshToken,
  });

  state.refreshTokens.set(refreshToken, {
    token: refreshToken,
    clientId,
    scope: authCode.scope,
  });

  sendJson(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_EXPIRY_SECONDS,
    refresh_token: refreshToken,
    scope: authCode.scope,
  });
}

/**
 * processes refresh token grant type
 * @param params URL search params from the token request
 * @param res server response
 */
function handleRefreshTokenGrant(
  params: URLSearchParams,
  res: ServerResponse,
): void {
  const refreshTokenValue = params.get('refresh_token') ?? '';
  const clientId = params.get('client_id') ?? '';

  const storedRefreshToken = state.refreshTokens.get(refreshTokenValue);

  if (!storedRefreshToken) {
    sendJson(res, 400, {
      error: 'invalid_grant',
      error_description: 'Refresh token not found or expired',
    });

    return;
  }

  if (storedRefreshToken.clientId !== clientId) {
    sendJson(res, 400, {
      error: 'invalid_grant',
      error_description: 'Client ID mismatch',
    });

    return;
  }

  // rotate refresh token (old one is invalidated)
  state.refreshTokens.delete(refreshTokenValue);

  const newAccessToken = generateRandom(32);
  const newRefreshToken = generateRandom(32);

  state.accessTokens.set(newAccessToken, {
    token: newAccessToken,
    clientId,
    scope: storedRefreshToken.scope,
    expiresAt: Date.now() + TOKEN_EXPIRY_SECONDS * MS_PER_SECOND,
    refreshToken: newRefreshToken,
  });

  state.refreshTokens.set(newRefreshToken, {
    token: newRefreshToken,
    clientId,
    scope: storedRefreshToken.scope,
  });

  sendJson(res, 200, {
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_EXPIRY_SECONDS,
    refresh_token: newRefreshToken,
    scope: storedRefreshToken.scope,
  });
}

/**
 * handles RFC 7662 token introspection endpoint
 *
 * validates access tokens and returns introspection response with
 * active status, subject, scope, and expiration claims.
 * accepts client credentials via HTTP Basic authentication.
 * @param req incoming request
 * @param res server response
 */
async function handleIntrospect(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();

    return;
  }

  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const token = params.get('token') ?? '';

  if (!token) {
    sendJson(res, 200, { active: false });

    return;
  }

  const stored = validateAccessToken(token);

  if (!stored) {
    sendJson(res, 200, { active: false });

    return;
  }

  sendJson(res, 200, {
    active: true,
    sub: stored.clientId,
    scope: stored.scope,
    exp: Math.floor(stored.expiresAt / MS_PER_SECOND),
    client_id: stored.clientId,
    token_type: 'Bearer',
  });
}

// SERVER LIFECYCLE //

/**
 * starts the mock OAuth authorization server
 * @param port port to listen on (defaults to AUTH_SERVER_PORT)
 * @returns promise that resolves when the server is listening
 */
export async function startAuthServer(
  port?: number,
): Promise<void> {
  const serverPort = port ?? AUTH_SERVER_PORT;

  // reset state on each start
  state = createFreshState();

  httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${serverPort}`);
    const pathname = url.pathname;

    if (pathname === '/.well-known/oauth-authorization-server') {
      handleMetadata(req, res, serverPort);
    } else if (pathname === '/register') {
      void handleRegister(req, res);
    } else if (pathname === '/authorize') {
      handleAuthorize(req, res);
    } else if (pathname === '/token') {
      void handleToken(req, res);
    } else if (pathname === '/introspect') {
      void handleIntrospect(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    httpServer!.listen(serverPort, '127.0.0.1', () => {
      resolve();
    });
  });
}

/**
 * stops the mock OAuth authorization server
 * @returns promise that resolves when the server has closed
 */
export async function stopAuthServer(): Promise<void> {
  if (!httpServer) {
    return;
  }

  return new Promise((resolve) => {
    httpServer!.close(() => {
      httpServer = null;
      state = createFreshState();
      resolve();
    });
  });
}

/**
 * validates an access token against the mock server's stored tokens
 * @param token access token to validate
 * @returns the token entry if valid, or null if invalid/expired
 */
export function validateAccessToken(token: string): AccessToken | null {
  const stored = state.accessTokens.get(token);

  if (!stored) {
    return null;
  }

  if (Date.now() > stored.expiresAt) {
    state.accessTokens.delete(token);

    return null;
  }

  return stored;
}

/**
 * checks if an access token has the required scope
 * @param token access token to check
 * @param requiredScope scope string to check for
 * @returns true if the token has the required scope
 */
export function tokenHasScope(token: string, requiredScope: string): boolean {
  const stored = validateAccessToken(token);

  if (!stored) {
    return false;
  }

  const scopes = stored.scope.split(' ');

  return scopes.includes(requiredScope);
}
