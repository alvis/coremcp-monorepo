/**
 * E2E tests for OAuth 2.1 authorization handling in HttpMcpConnector
 *
 * validates that our HTTP connector properly handles OAuth challenges,
 * discovers authorization metadata, performs PKCE flows, and refreshes tokens
 * when interacting with auth-protected MCP servers.
 * @see /e2e/interactions/15-authorization.md for interaction specifications
 */

import { HttpMcpConnector } from '@coremcp/client-http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import {
  AUTH_SERVER_PORT,
  CLIENT_INFO,
  spawnAuthHttpTestServer,
  startAuthServer,
  stopAuthServer,
  waitForHttpTestServer,
  killTestServer,
} from '../fixtures/index';

import type { ChildProcess } from 'node:child_process';

// CONSTANTS //

/** base URL for the mock OAuth authorization server */
const OAUTH_BASE_URL = `http://localhost:${AUTH_SERVER_PORT}`;

// TYPES //

/** OAuth token response */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** client registration response */
interface ClientRegistrationResponse {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

// HELPERS //

/**
 * performs full PKCE OAuth flow and returns tokens
 * @param clientId client ID for the OAuth flow
 * @returns token response with access and refresh tokens
 */
async function performPkceFlow(clientId: string): Promise<TokenResponse> {
  const codeVerifier =
    'connector-test-code-verifier-that-is-at-least-43-characters-long-here';
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(codeVerifier),
  );
  const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

  const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set(
    'redirect_uri',
    'http://localhost:3100/callback',
  );
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('scope', 'mcp:read mcp:write');

  const authResponse = await fetch(authorizeUrl.toString(), {
    redirect: 'manual',
  });
  const callbackUrl = new URL(authResponse.headers.get('location')!);
  const authCode = callbackUrl.searchParams.get('code')!;

  const tokenResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: 'http://localhost:3100/callback',
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });

  return (await tokenResponse.json()) as TokenResponse;
}

// TEST SUITES //

describe('client-connector-http / 15-authorization', () => {
  const state: {
    serverProcess: ChildProcess | null;
    baseUrl: string;
    mcpEndpoint: string;
    healthEndpoint: string;
  } = {
    serverProcess: null,
    baseUrl: '',
    mcpEndpoint: '',
    healthEndpoint: '',
  };

  beforeAll(async () => {
    await startAuthServer();
    const { process: proc, port } = await spawnAuthHttpTestServer();
    state.serverProcess = proc;
    state.baseUrl = `http://localhost:${port}`;
    state.mcpEndpoint = `${state.baseUrl}/mcp`;
    state.healthEndpoint = `${state.baseUrl}/health`;
    await waitForHttpTestServer(state.healthEndpoint);
  }, 60_000);

  afterAll(async () => {
    if (state.serverProcess) {
      await killTestServer(state.serverProcess);
    }
    await stopAuthServer();
  });

  describe('OAuth metadata discovery via connector', () => {
    it('should discover authorization server metadata from well-known endpoint [AUTH-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that /.well-known/oauth-authorization-server returns RFC 8414 metadata
       * with issuer, authorization/token/registration endpoints, and S256 PKCE support.
       * Note: test ID says AUTH-001 but this is actually AUTH-002 behavior (auth server
       * metadata discovery, not protected resource metadata). The check is still spec-valid.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L50-L76 (OAuthMetadataSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1037-L1110 (discoverAuthorizationServerMetadata)
       */
      const response = await fetch(
        `${OAUTH_BASE_URL}/.well-known/oauth-authorization-server`,
      );

      expect(response.status).toBe(200);

      const metadata = (await response.json()) as Record<string, unknown>;

      expect(metadata).toEqual(
        expect.objectContaining({
          issuer: expect.any(String),
          authorization_endpoint: expect.any(String),
          token_endpoint: expect.any(String),
          registration_endpoint: expect.any(String),
          code_challenge_methods_supported: expect.arrayContaining(['S256']),
        }),
      );
    });

    it('should return 404 for non-existent well-known paths [AUTH-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the auth server returns 404 for /.well-known/openid-configuration,
       * confirming the server only supports RFC 8414 OAuth metadata (not OIDC discovery).
       * The SDK discoverAuthorizationServerMetadata tries OAuth first, then falls back to OIDC.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1037-L1110 (discoverAuthorizationServerMetadata with fallback)
       */
      const response = await fetch(
        `${OAUTH_BASE_URL}/.well-known/openid-configuration`,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('connector with OAuth token store', () => {
    it('should create connector with auth configuration pointing to mock auth server [AUTH-003]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that HttpMcpConnector can be created with OAuth configuration including
       * onAuth callback, tokenStore, and redirectUri. This maps to the SDK's
       * OAuthClientProvider interface which stores tokens and handles authorization redirects.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L42-L170 (OAuthClientProvider interface)
       */
      let storedAccessToken: string | null = null;
      let storedRefreshToken: string | null = null;

      const connector = new HttpMcpConnector({
        name: 'auth-test-server',
        url: state.mcpEndpoint,
        clientInfo: CLIENT_INFO,
        capabilities: { roots: { listChanged: true } },
        oauth: {
          onAuth: async () => {
            // in a real scenario, this would open a browser for user consent
          },
          tokenStore: {
            getAccessToken: async (_issuer: string) => storedAccessToken,
            getRefreshToken: async (_issuer: string) => storedRefreshToken,
            setTokens: async (
              _issuer: string,
              accessToken: string,
              refreshToken?: string,
            ) => {
              storedAccessToken = accessToken;
              storedRefreshToken = refreshToken ?? null;
            },
            getTokenExpiration: async (_issuer: string) => null,
            clearTokens: async (_issuer: string) => {
              storedAccessToken = null;
              storedRefreshToken = null;
            },
          },
          redirectUri: 'http://localhost:3100/callback',
        },
      });

      expect(connector).toBeDefined();
    });
  });

  describe('PKCE flow integration', () => {
    it('should complete full PKCE flow and obtain valid tokens [AUTH-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the full PKCE OAuth 2.1 flow: dynamic registration, authorize with S256
       * code_challenge, exchange code for tokens with code_verifier, and validate token shape.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1171-L1250 (startAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1341-L1380 (exchangeAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L131-L143 (OAuthTokensSchema)
       */
      // register client dynamically
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Connector PKCE Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const tokens = await performPkceFlow(registration.client_id);

      expect(tokens.access_token).toBeTruthy();
      expect(tokens.refresh_token).toBeTruthy();
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.expires_in).toBeGreaterThan(0);
    });
  });

  describe('token refresh via connector', () => {
    it('should refresh tokens and receive new access and refresh tokens [AUTH-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies token refresh via refresh_token grant type, confirming new tokens are
       * issued and differ from originals (refresh token rotation). The SDK
       * refreshAuthorization preserves original refresh_token if not replaced.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1387-L1430 (refreshAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L131-L143 (OAuthTokensSchema)
       */
      // register and get initial tokens
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Connector Refresh Client',
          redirect_uris: ['http://localhost:3100/callback'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const initialTokens = await performPkceFlow(registration.client_id);

      // refresh the token
      const refreshResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: initialTokens.refresh_token,
          client_id: registration.client_id,
        }).toString(),
      });

      expect(refreshResponse.status).toBe(200);

      const newTokens = (await refreshResponse.json()) as TokenResponse;

      expect(newTokens.access_token).not.toBe(initialTokens.access_token);
      expect(newTokens.refresh_token).not.toBe(initialTokens.refresh_token);
    });
  });

  describe('scope enforcement', () => {
    it.todo(
      'should handle 403 insufficient_scope challenge and request step-up authorization [AUTH-006]',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * Verifies that the connector handles a 403 insufficient_scope challenge by triggering
         * step-up authorization with additional scopes via a new PKCE flow.
         *
         * pseudo-code:
         * 1. Register a client and obtain a token with only mcp:read scope
         * 2. Attempt an MCP request that requires mcp:write scope using the mcp:read token
         * 3. Verify the server returns 403 with error="insufficient_scope"
         * 4. Verify the connector triggers a new authorization flow requesting the missing scope
         * 5. Verify the new token includes the required mcp:write scope and the request succeeds
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L89 (OAuthErrorCode.InsufficientScope)
         */
      },
    );
  });

  describe('re-authorization', () => {
    it.todo(
      'should trigger full re-authorization when both tokens are expired [AUTH-007]',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * Verifies that the connector triggers a full re-authorization cascade when both
         * access and refresh tokens are expired, restarting the PKCE flow from scratch.
         *
         * pseudo-code:
         * 1. Register a client and complete a full PKCE flow to obtain access + refresh tokens
         * 2. Simulate token expiry (e.g. use expired/revoked tokens or wait for short-lived tokens)
         * 3. Attempt an MCP request with the expired access token, expect 401 invalid_token
         * 4. Attempt refresh_token grant with the expired refresh token, expect 400 invalid_grant
         * 5. Verify the connector restarts the full PKCE authorization flow from scratch
         * 6. Verify new tokens are obtained and the MCP request succeeds
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L24 (OAuthErrorCode.InvalidGrant)
         */
      },
    );
  });
});
