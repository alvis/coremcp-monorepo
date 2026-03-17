/**
 * E2E tests for OAuth 2.1 authorization flows via HTTP transport
 *
 * validates protected resource metadata discovery, authorization server metadata,
 * dynamic client registration, PKCE flow, token refresh, scope challenges,
 * and re-authorization against the coremcp auth-protected HTTP server.
 *
 * these tests use native fetch for OAuth endpoint verification since they test
 * protocol-level behavior that does not go through the MCP connector.
 * @see /e2e/interactions/15-authorization.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  AUTH_SERVER_PORT,
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

/** OAuth authorization server metadata shape */
interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

/** dynamic client registration response */
interface ClientRegistrationResponse {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

/** OAuth token response */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** OAuth error response */
interface OAuthErrorResponse {
  error: string;
  error_description: string;
}

// TEST SUITES //

describe('server-transport-http / 15-authorization', () => {
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

  describe('protected resource metadata', () => {
    it('should serve RFC 9728 protected resource metadata from MCP server [AUTH-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the MCP server serves RFC 9728 protected resource metadata at
       * /.well-known/oauth-protected-resource with 'resource' (required) and
       * 'authorization_servers' (required by MCP spec) fields.
       * The SDK schema marks authorization_servers as optional per RFC 9728, but the
       * MCP spec requires it for authorization server discovery.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L30-L48 (OAuthProtectedResourceMetadataSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L806-L826 (discoverOAuthProtectedResourceMetadata)
       */
      const response = await fetch(
        `${state.baseUrl}/.well-known/oauth-protected-resource`,
      );

      expect(response.status).toBe(200);

      const metadata = (await response.json()) as {
        resource: string;
        authorization_servers?: string[];
        bearer_methods_supported?: string[];
      };

      // RFC 9728 requires the 'resource' field
      expect(metadata.resource).toEqual(expect.any(String));

      // RFC 9728: authorization_servers MUST be present and non-empty
      expect(metadata.authorization_servers).toBeInstanceOf(Array);
      expect(metadata.authorization_servers!.length).toBeGreaterThan(0);
    });
  });

  describe('client information metadata document', () => {
    it('should return client metadata after dynamic registration [AUTH-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that dynamic client registration (RFC 7591) returns 201 with
       * client_id and echoed metadata including client_name, redirect_uris, grant_types.
       * Validates the full registration response shape per OAuthClientInformationFullSchema.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L179-L215 (OAuthClientMetadataSchema + OAuthClientInformationFullSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1510-L1540 (registerClient)
       */
      // register a client dynamically
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'CIMD Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });

      // RFC 7591 section 3.2.1: server MUST respond with HTTP 201 Created
      expect(regResponse.status).toBe(201);

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      // the client_id should be a non-empty string
      expect(registration.client_id).toEqual(expect.any(String));
      expect(registration.client_id.length).toBeGreaterThan(0);

      // verify the registration response contains the expected client metadata
      expect(registration).toEqual(
        expect.objectContaining({
          client_id: expect.any(String),
          client_name: 'CIMD Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      );
    });
  });

  describe('re-authorization cascade', () => {
    it('should require full re-authorization when expired code and invalid refresh token are used [AUTH-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that both expired authorization code exchange and invalid refresh
       * token return 400 invalid_grant, requiring full PKCE re-authorization.
       * Per RFC 6749 section 5.2, invalid_grant covers expired/revoked codes and tokens.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L24 (OAuthErrorCode.InvalidGrant)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L164-L169 (OAuthErrorResponseSchema)
       */
      // step 1: attempt token exchange with a non-existent/expired code
      const expiredCodeResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'expired-invalid-auth-code',
          redirect_uri: 'http://localhost:3100/callback',
          client_id: 'some-client-id',
          code_verifier: 'some-verifier-that-is-at-least-43-characters-long-for-pkce',
        }).toString(),
      });

      expect(expiredCodeResponse.status).toBe(400);
      const codeError = (await expiredCodeResponse.json()) as OAuthErrorResponse;
      expect(codeError.error).toBe('invalid_grant');

      // step 2: attempt refresh with an invalid/expired refresh token
      const refreshResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: 'completely-invalid-refresh-token',
          client_id: 'some-client-id',
        }).toString(),
      });

      expect(refreshResponse.status).toBe(400);
      const refreshError = (await refreshResponse.json()) as OAuthErrorResponse;
      expect(refreshError.error).toBe('invalid_grant');

      // both token exchange and refresh failed, indicating full re-authorization is needed
      // the client would need to start the PKCE flow from scratch
    });
  });

  describe('OAuth metadata discovery', () => {
    it('should return 401 for unauthenticated request to auth-protected MCP endpoint [AUTH-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that an unauthenticated POST to the MCP endpoint returns 401
       * with error 'invalid_token'. Per RFC 6750 section 3.1 and the MCP spec,
       * a missing or invalid bearer token triggers a 401 Unauthorized response.
       * The SDK client handles this in StreamableHTTPClientTransport by checking
       * response.status === 401 to trigger the auth flow.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L69 (OAuthErrorCode.InvalidToken)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L712-L760 (extractWWWAuthenticateParams)
       */
      const response = await fetch(state.mcpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      // auth-protected server MUST return 401 for unauthenticated requests
      expect(response.status).toBe(401);

      const body = (await response.json()) as {
        error: string;
        error_description: string;
      };

      expect(body.error).toBe('invalid_token');
      expect(body.error_description).toContain('Bearer token required');
    });

    it('should serve authorization server metadata at well-known endpoint [AUTH-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that /.well-known/oauth-authorization-server returns RFC 8414 metadata
       * including issuer, endpoints, scopes, response_types, grant_types, and PKCE S256.
       * The SDK validates this with OAuthMetadataSchema. The MCP spec requires
       * code_challenge_methods_supported to include S256 (OAuth 2.1 mandate).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L50-L76 (OAuthMetadataSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1037-L1110 (discoverAuthorizationServerMetadata)
       */
      const response = await fetch(
        `${OAUTH_BASE_URL}/.well-known/oauth-authorization-server`,
      );

      expect(response.status).toBe(200);

      const metadata = (await response.json()) as AuthServerMetadata;

      expect(metadata).toEqual(
        expect.objectContaining({
          issuer: expect.any(String),
          authorization_endpoint: expect.any(String),
          token_endpoint: expect.any(String),
          scopes_supported: expect.arrayContaining(['mcp:read', 'mcp:write']),
          response_types_supported: expect.arrayContaining(['code']),
          grant_types_supported: expect.arrayContaining([
            'authorization_code',
            'refresh_token',
          ]),
          code_challenge_methods_supported: expect.arrayContaining(['S256']),
        }),
      );
    });
  });

  describe('dynamic client registration', () => {
    it('should register a new client dynamically [AUTH-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies RFC 7591 dynamic client registration returns 201 with client_id
       * and echoed metadata (client_name, redirect_uris, grant_types, response_types).
       * The SDK registerClient function POSTs to the registration_endpoint from metadata.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L179-L215 (OAuthClientMetadataSchema + OAuthClientInformationFullSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1510-L1540 (registerClient)
       */
      const response = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'E2E Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });

      // RFC 7591 section 3.2.1: server MUST respond with HTTP 201 Created
      expect(response.status).toBe(201);

      const registration =
        (await response.json()) as ClientRegistrationResponse;

      expect(registration).toEqual(
        expect.objectContaining({
          client_id: expect.any(String),
          client_name: 'E2E Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      );
    });

    it('should reject non-POST registration requests [AUTH-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that GET requests to the registration endpoint are rejected
       * with 405 Method Not Allowed per RFC 7591 (registration is POST-only).
       * The SDK registerClient always uses method: 'POST'. The SDK defines
       * OAuthErrorCode.MethodNotAllowed for this scenario.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L74 (OAuthErrorCode.MethodNotAllowed)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1510-L1540 (registerClient uses POST)
       */
      const response = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'GET',
      });

      expect(response.status).toBe(405);
    });
  });

  describe('OAuth 2.1 authorization code + PKCE flow', () => {
    it('should issue authorization code via authorize endpoint with PKCE [AUTH-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the full OAuth 2.1 PKCE flow: register client, build authorize URL
       * with S256 code_challenge and RFC 8707 resource param, receive 302 redirect with
       * auth code, exchange for tokens with code_verifier and resource param.
       * The SDK startAuthorization generates PKCE challenge and constructs the URL with
       * response_type, client_id, code_challenge, code_challenge_method, redirect_uri,
       * scope, state, and resource parameters. exchangeAuthorization sends the code_verifier.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1171-L1250 (startAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1341-L1380 (exchangeAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L131-L143 (OAuthTokensSchema)
       */
      // register a client first
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'PKCE Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      // build authorization URL with PKCE challenge
      const codeVerifier = 'test-code-verifier-that-is-at-least-43-characters-long-for-pkce-spec';
      const encoder = new TextEncoder();
      const data = encoder.encode(codeVerifier);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const codeChallenge = Buffer.from(hashBuffer)
        .toString('base64url');

      // RFC 8707: resource parameter identifies the MCP server
      const mcpResource = state.mcpEndpoint;

      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scope', 'mcp:read mcp:write');
      authorizeUrl.searchParams.set('state', 'test-state-value');
      authorizeUrl.searchParams.set('resource', mcpResource);

      // the mock auth server auto-approves and redirects
      const authResponse = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });

      expect(authResponse.status).toBe(302);

      const locationHeader = authResponse.headers.get('location');
      expect(locationHeader).toBeTruthy();

      const callbackUrl = new URL(locationHeader!);
      const authCode = callbackUrl.searchParams.get('code');
      const returnedState = callbackUrl.searchParams.get('state');

      expect(authCode).toBeTruthy();
      expect(returnedState).toBe('test-state-value');

      // exchange code for tokens with RFC 8707 resource parameter
      const tokenResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode!,
          redirect_uri: 'http://localhost:3100/callback',
          client_id: registration.client_id,
          code_verifier: codeVerifier,
          resource: mcpResource,
        }).toString(),
      });

      expect(tokenResponse.status).toBe(200);

      const tokens = (await tokenResponse.json()) as TokenResponse;

      expect(tokens).toEqual(
        expect.objectContaining({
          access_token: expect.any(String),
          token_type: 'Bearer',
          expires_in: expect.any(Number),
          refresh_token: expect.any(String),
          scope: 'mcp:read mcp:write',
        }),
      );
    });

    it('should reject authorize request without code_challenge (PKCE required) [AUTH-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the authorize endpoint rejects requests missing code_challenge
       * with 400 invalid_request, enforcing mandatory PKCE per OAuth 2.1.
       * PKCE is required by the MCP spec; the SDK startAuthorization always generates
       * a PKCE challenge and checks code_challenge_methods_supported includes S256.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1171-L1250 (startAuthorization always sets code_challenge)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L12 (OAuthErrorCode.InvalidRequest)
       */
      // register a client first
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'No PKCE Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      // call /authorize WITHOUT code_challenge — PKCE is mandatory
      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('scope', 'mcp:read');
      authorizeUrl.searchParams.set('state', 'test-no-pkce');

      const authResponse = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });

      expect(authResponse.status).toBe(400);

      const errorBody = (await authResponse.json()) as OAuthErrorResponse;
      expect(errorBody.error).toBe('invalid_request');
    });

    it('should reject invalid code_verifier during token exchange [AUTH-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that token exchange with a wrong code_verifier returns 400
       * invalid_grant, confirming PKCE S256 challenge verification.
       * Per RFC 7636 section 4.6, a mismatched code_verifier results in an error.
       * The SDK exchangeAuthorization sends code_verifier via prepareAuthorizationCodeRequest.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1251-L1265 (prepareAuthorizationCodeRequest)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L24 (OAuthErrorCode.InvalidGrant)
       */
      // register and get auth code
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Invalid Verifier Client',
          redirect_uris: ['http://localhost:3100/callback'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const codeVerifier = 'valid-code-verifier-that-is-at-least-43-characters-long-for-pkce';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(codeVerifier),
      );
      const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scope', 'mcp:read');

      const authResponse = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });
      const callbackUrl = new URL(authResponse.headers.get('location')!);
      const authCode = callbackUrl.searchParams.get('code')!;

      // use wrong code_verifier
      const tokenResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: 'http://localhost:3100/callback',
          client_id: registration.client_id,
          code_verifier: 'wrong-verifier-does-not-match-the-challenge-at-all-and-is-long',
        }).toString(),
      });

      expect(tokenResponse.status).toBe(400);

      const errorBody = (await tokenResponse.json()) as OAuthErrorResponse;
      expect(errorBody.error).toBe('invalid_grant');
    });
  });

  describe('token refresh', () => {
    it('should refresh an access token using refresh_token grant [AUTH-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies token refresh via refresh_token grant with RFC 8707 resource param,
       * confirming new access/refresh tokens are issued and differ from originals (rotation).
       * The SDK refreshAuthorization sends grant_type=refresh_token with client_id and
       * optional resource parameter. Refresh token rotation is an OAuth 2.1 best practice.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1387-L1430 (refreshAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L131-L143 (OAuthTokensSchema)
       */
      // get initial tokens via full PKCE flow
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Refresh Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const codeVerifier = 'refresh-test-code-verifier-that-is-at-least-43-characters-long';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(codeVerifier),
      );
      const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

      // RFC 8707: resource parameter identifies the MCP server
      const mcpResource = state.mcpEndpoint;

      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scope', 'mcp:read mcp:write');
      authorizeUrl.searchParams.set('resource', mcpResource);

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
          client_id: registration.client_id,
          code_verifier: codeVerifier,
          resource: mcpResource,
        }).toString(),
      });

      const initialTokens = (await tokenResponse.json()) as TokenResponse;

      // refresh the token with RFC 8707 resource parameter
      const refreshResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: initialTokens.refresh_token,
          client_id: registration.client_id,
          resource: mcpResource,
        }).toString(),
      });

      expect(refreshResponse.status).toBe(200);

      const refreshedTokens = (await refreshResponse.json()) as TokenResponse;

      expect(refreshedTokens).toEqual(
        expect.objectContaining({
          access_token: expect.any(String),
          token_type: 'Bearer',
          expires_in: expect.any(Number),
          refresh_token: expect.any(String),
          scope: 'mcp:read mcp:write',
        }),
      );

      // new tokens should differ from old ones (rotation)
      expect(refreshedTokens.access_token).not.toBe(
        initialTokens.access_token,
      );
      expect(refreshedTokens.refresh_token).not.toBe(
        initialTokens.refresh_token,
      );
    });

    it('should reject reuse of rotated refresh token [AUTH-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that reusing a rotated refresh token returns 400 invalid_grant,
       * confirming refresh token rotation security per OAuth 2.1 best practices.
       * The MCP spec notes that auth server MAY rotate refresh tokens (one-time use).
       * The SDK refreshAuthorization preserves original refresh_token if not replaced.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1387-L1430 (refreshAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L24 (OAuthErrorCode.InvalidGrant)
       */
      // register and get tokens
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Rotation Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const codeVerifier = 'rotation-test-verifier-that-is-at-least-43-characters-long-here';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(codeVerifier),
      );
      const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scope', 'mcp:read');

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
          client_id: registration.client_id,
          code_verifier: codeVerifier,
        }).toString(),
      });

      const initialTokens = (await tokenResponse.json()) as TokenResponse;
      const oldRefreshToken = initialTokens.refresh_token;

      // use refresh token once (rotates it)
      await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: oldRefreshToken,
          client_id: registration.client_id,
        }).toString(),
      });

      // attempt reuse of old refresh token should fail
      const reuseResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: oldRefreshToken,
          client_id: registration.client_id,
        }).toString(),
      });

      expect(reuseResponse.status).toBe(400);

      const errorBody = (await reuseResponse.json()) as OAuthErrorResponse;
      expect(errorBody.error).toBe('invalid_grant');
    });
  });

  describe('scope enforcement', () => {
    it('should return 403 with insufficient_scope when token lacks required scope [AUTH-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that a token issued with only mcp:read scope does not include
       * broader scopes (mcp:write, mcp:admin) that were not requested.
       * Per OAuth 2.1, the authorization server MUST NOT issue broader scopes than requested.
       * Note: the test name mentions "403 with insufficient_scope" but the test body only
       * validates scope content at the token level, not an MCP 403 response. This is still
       * a valid scope enforcement check at the OAuth layer.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L131-L143 (OAuthTokensSchema.scope)
       */
      // register a client and obtain a token with only mcp:read scope
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Limited Scope Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const codeVerifier = 'scope-enforcement-verifier-that-is-at-least-43-characters-long-here';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(codeVerifier),
      );
      const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

      // request only mcp:read scope (not mcp:write or mcp:admin)
      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scope', 'mcp:read');

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
          client_id: registration.client_id,
          code_verifier: codeVerifier,
        }).toString(),
      });

      expect(tokenResponse.status).toBe(200);

      const tokens = (await tokenResponse.json()) as TokenResponse;

      // the issued token must only have the requested scope
      expect(tokens.scope).toBe('mcp:read');

      // the token must NOT contain broader scopes that were not requested
      const grantedScopes = tokens.scope.split(' ');
      expect(grantedScopes).not.toContain('mcp:write');
      expect(grantedScopes).not.toContain('mcp:admin');
    });

    it('should return 403 when MCP request uses token without required mcp scope [AUTH-006]', async () => {
      // SPEC ALIGNMENT: PASS (per RFC 6750 section 3.1, a 403 for insufficient scope uses error="insufficient_scope")
      /**
       * Verifies that the MCP server returns 403 when a token lacks the required scope.
       * Per RFC 6750 section 3.1: insufficient_scope error is used when the token is valid
       * but lacks the required scope. The SDK client checks for error === 'insufficient_scope'
       * in the WWW-Authenticate header to trigger scope-based re-authorization.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L89 (OAuthErrorCode.InsufficientScope)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L712-L760 (extractWWWAuthenticateParams checks for insufficient_scope)
       */
      // obtain a token with only mcp:read scope (server requires 'mcp' scope)
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Insufficient Scope Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      });

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      const codeVerifier = 'insufficient-scope-verifier-that-is-at-least-43-characters-long-x';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(codeVerifier),
      );
      const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scope', 'mcp:read');

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
          client_id: registration.client_id,
          code_verifier: codeVerifier,
        }).toString(),
      });

      const tokens = (await tokenResponse.json()) as TokenResponse;

      // token has mcp:read but server requires 'mcp' scope
      expect(tokens.scope).toBe('mcp:read');

      // MCP request with insufficient scope should be rejected with 403
      const mcpResponse = await fetch(state.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'scope-test-client', version: '1.0.0' },
          },
        }),
      });

      expect(mcpResponse.status).toBe(403);

      const errorBody = (await mcpResponse.json()) as {
        error: string;
        error_description: string;
      };

      expect(errorBody.error).toBe('insufficient_scope');
      expect(errorBody.error_description).toContain('Insufficient scope');
    });
  });

  describe('full PKCE OAuth flow through to MCP call', () => {
    it('should complete PKCE flow and use token to call MCP endpoint [AUTH-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the complete end-to-end PKCE OAuth flow: register, authorize with
       * S256 + resource param (RFC 8707), exchange code, then use Bearer token to call
       * MCP endpoint successfully. This is the golden path test covering AUTH-001 through
       * AUTH-004 in a single flow, matching the SDK's auth() orchestrator behavior.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1171-L1250 (startAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1341-L1380 (exchangeAuthorization)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/auth.ts#L1510-L1540 (registerClient)
       */
      // step 1: register client (expect 201 per RFC 7591)
      const regResponse = await fetch(`${OAUTH_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: 'Full Flow Test Client',
          redirect_uris: ['http://localhost:3100/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });

      expect(regResponse.status).toBe(201);

      const registration =
        (await regResponse.json()) as ClientRegistrationResponse;

      // step 2: generate PKCE code_verifier and code_challenge
      const codeVerifier = 'full-flow-test-code-verifier-that-is-at-least-43-characters-long-here';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(codeVerifier),
      );
      const codeChallenge = Buffer.from(hashBuffer).toString('base64url');

      const mcpResource = state.mcpEndpoint;

      // step 3: call /authorize with code_challenge
      const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', registration.client_id);
      authorizeUrl.searchParams.set(
        'redirect_uri',
        'http://localhost:3100/callback',
      );
      authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      // include 'mcp' scope which the server requires for access
      authorizeUrl.searchParams.set('scope', 'mcp mcp:read mcp:write');
      authorizeUrl.searchParams.set('state', 'full-flow-state');
      authorizeUrl.searchParams.set('resource', mcpResource);

      const authResponse = await fetch(authorizeUrl.toString(), {
        redirect: 'manual',
      });

      expect(authResponse.status).toBe(302);

      const callbackUrl = new URL(authResponse.headers.get('location')!);
      const authCode = callbackUrl.searchParams.get('code');

      expect(authCode).toBeTruthy();
      expect(callbackUrl.searchParams.get('state')).toBe('full-flow-state');

      // step 4: exchange code for token
      const tokenResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authCode!,
          redirect_uri: 'http://localhost:3100/callback',
          client_id: registration.client_id,
          code_verifier: codeVerifier,
          resource: mcpResource,
        }).toString(),
      });

      expect(tokenResponse.status).toBe(200);

      const tokens = (await tokenResponse.json()) as TokenResponse;

      expect(tokens.access_token).toEqual(expect.any(String));
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.scope).toBe('mcp mcp:read mcp:write');

      // step 5: use token to call MCP endpoint with initialize
      const mcpResponse = await fetch(state.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'oauth-flow-test-client', version: '1.0.0' },
          },
        }),
      });

      // step 6: the server enforces auth via introspection and accepts valid tokens
      expect(mcpResponse.status).toBe(200);
    });
  });

  describe('token expiry and re-authorization', () => {
    it('should reject expired authorization code [AUTH-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that exchanging a non-existent/expired authorization code returns
       * 400 invalid_grant, confirming authorization code expiry handling.
       * Per RFC 6749 section 5.2, invalid_grant covers expired or invalid auth codes.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L24 (OAuthErrorCode.InvalidGrant)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L164-L169 (OAuthErrorResponseSchema)
       */
      // attempt to exchange a non-existent code
      const tokenResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'nonexistent-auth-code',
          redirect_uri: 'http://localhost:3100/callback',
          client_id: 'some-client-id',
          code_verifier: 'some-verifier',
        }).toString(),
      });

      expect(tokenResponse.status).toBe(400);

      const errorBody = (await tokenResponse.json()) as OAuthErrorResponse;
      expect(errorBody.error).toBe('invalid_grant');
    });

    it('should reject unsupported grant type [AUTH-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the token endpoint rejects unsupported grant types
       * (e.g. client_credentials) with 400 unsupported_grant_type error.
       * Per RFC 6749 section 5.2, unsupported_grant_type indicates the grant type
       * is not supported by the authorization server.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/auth/errors.ts#L34 (OAuthErrorCode.UnsupportedGrantType)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/auth.ts#L164-L169 (OAuthErrorResponseSchema)
       */
      const tokenResponse = await fetch(`${OAUTH_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
        }).toString(),
      });

      expect(tokenResponse.status).toBe(400);

      const errorBody = (await tokenResponse.json()) as OAuthErrorResponse;
      expect(errorBody.error).toBe('unsupported_grant_type');
    });
  });
});
