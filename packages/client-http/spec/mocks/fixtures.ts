/** shared test fixtures and utilities for HTTP transport testing */

import { expect, vi } from 'vitest';

import type {
  AuthorizationServerMetadata,
  ProtectedResourceMetadata,
} from '#oauth/types';

/** test constants for OAuth authorization flows */
export const TEST_CONSTANTS = {
  CLIENT_ID: 'test-client-id',
  CALLBACK_URL: 'https://client.example.com/callback',
  CUSTOM_STATE: 'custom-state-value',
  RESOURCE_METADATA_URL:
    'https://mcp.example.com/.well-known/oauth-protected-resource',
  AUTH_SERVER_URL: 'https://auth.example.com',
} as const;

/** sample WWW-Authenticate headers for authorization testing */
export const SAMPLE_AUTH_HEADERS = {
  BASIC_BEARER: `Bearer resource_metadata="${TEST_CONSTANTS.RESOURCE_METADATA_URL}"`,
  WITH_SCOPES: `Bearer resource_metadata="${TEST_CONSTANTS.RESOURCE_METADATA_URL}", scope="files:read files:write"`,
  WITH_ERROR: `Bearer error="insufficient_scope", scope="files:read files:write user:profile", resource_metadata="${TEST_CONSTANTS.RESOURCE_METADATA_URL}", error_description="Additional permissions required"`,
  UNQUOTED_VALUES: `Bearer error=insufficient_scope, resource_metadata="${TEST_CONSTANTS.RESOURCE_METADATA_URL}"`,
  NO_METADATA: 'Bearer scope="files:read"',
  SINGLE_SCOPE: 'Bearer scope="mcp"',
  WITH_REALM: 'Bearer realm="OAuth API"',
  WITH_ERROR_URI: `Bearer error="invalid_token", error_uri="https://example.com/help/oauth"`,
  COMPLETE_CHALLENGE: `Bearer realm="API", resource_metadata="${TEST_CONSTANTS.RESOURCE_METADATA_URL}", scope="files:read files:write", error="insufficient_scope", error_description="Token lacks required permissions", error_uri="https://example.com/oauth/errors"`,
  ESCAPED_QUOTES:
    'Bearer realm="API with \\"quotes\\"", error_description="Error with \\"escaped quotes\\""',
  COMMAS_IN_QUOTES:
    'Bearer realm="API, with commas", error_description="Error, with commas"',
  CASE_INSENSITIVE_SCHEME: `bearer resource_metadata="${TEST_CONSTANTS.RESOURCE_METADATA_URL}"`,
  EMPTY: '',
  INVALID_FORMAT: 'InvalidFormat',
} as const;

/** mock protected resource metadata for OAuth flows */
export const MOCK_RESOURCE_METADATA: ProtectedResourceMetadata = {
  resource: 'https://mcp.example.com',
  authorization_servers: [TEST_CONSTANTS.AUTH_SERVER_URL],
  bearer_methods_supported: ['header'],
  scopes_supported: ['files:read', 'files:write', 'mcp'],
};

/** mock authorization server metadata for OAuth flows */
export const MOCK_AUTH_SERVER_METADATA: AuthorizationServerMetadata = {
  issuer: TEST_CONSTANTS.AUTH_SERVER_URL,
  authorization_endpoint: `${TEST_CONSTANTS.AUTH_SERVER_URL}/oauth/authorize`,
  token_endpoint: `${TEST_CONSTANTS.AUTH_SERVER_URL}/oauth/token`,
  scopes_supported: ['files:read', 'files:write', 'mcp', 'user:profile'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code'],
  code_challenge_methods_supported: ['S256', 'plain'],
};

/** invalid resource metadata for error testing scenarios */
export const INVALID_RESOURCE_METADATA = {
  ...MOCK_RESOURCE_METADATA,
  authorization_servers: [],
};

/** invalid authorization server metadata for error testing scenarios */
export const INVALID_AUTH_SERVER_METADATA = {
  ...MOCK_AUTH_SERVER_METADATA,
  authorization_endpoint: undefined,
};

/**
 * creates mock fetch function that returns successful OAuth metadata responses
 * @returns mock fetch function with successful OAuth metadata responses
 */
export function createSuccessfulMockFetch(): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_RESOURCE_METADATA,
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUTH_SERVER_METADATA,
    });
}

/**
 * creates mock fetch function that simulates resource metadata fetch failure
 * @returns mock fetch function that simulates 404 error for resource metadata
 */
export function createResourceMetadataFailureMockFetch(): ReturnType<
  typeof vi.fn
> {
  return vi.fn().mockResolvedValueOnce({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  });
}

/**
 * creates mock fetch function that simulates auth server metadata fetch failure
 * @returns mock fetch function that simulates 500 error for auth server metadata
 */
export function createAuthServerMetadataFailureMockFetch(): ReturnType<
  typeof vi.fn
> {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_RESOURCE_METADATA,
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
}

/**
 * creates mock fetch function for testing invalid metadata scenarios
 * @param invalidResource whether to use invalid resource metadata
 * @param invalidAuthServer whether to use invalid auth server metadata
 * @returns mock fetch function with configured responses
 */
export function createInvalidMetadataMockFetch(
  invalidResource = false,
  invalidAuthServer = false,
): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn();

  if (invalidResource) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => INVALID_RESOURCE_METADATA,
    });
  } else {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_RESOURCE_METADATA,
    });
  }

  if (invalidAuthServer) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => INVALID_AUTH_SERVER_METADATA,
    });
  } else {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUTH_SERVER_METADATA,
    });
  }

  return mockFetch;
}

/**
 * verifies that authorization URL contains expected OAuth parameters
 * @param url authorization URL to verify
 * @param expectedParams expected OAuth parameter values
 * @param expectedParams.clientId expected client identifier
 * @param expectedParams.redirectUri expected redirect URI
 * @param expectedParams.scope expected scope string
 * @param expectedParams.state expected state parameter
 * @param expectedParams.hasCodeChallenge whether code challenge should be present
 * @param expectedParams.codeChallengeMethod expected code challenge method
 */
export function verifyOAuthUrl(
  url: string,
  expectedParams: {
    /** expected OAuth client identifier */
    clientId?: string;
    /** expected OAuth redirect URI */
    redirectUri?: string;
    /** expected OAuth scope string */
    scope?: string;
    /** expected OAuth state parameter */
    state?: string;
    /** whether PKCE code challenge should be present */
    hasCodeChallenge?: boolean;
    /** expected PKCE code challenge method */
    codeChallengeMethod?: string;
  },
): void {
  const parsedUrl = new URL(url);

  if (expectedParams.clientId) {
    expect(parsedUrl.searchParams.get('client_id')).toBe(
      expectedParams.clientId,
    );
  }

  if (expectedParams.redirectUri) {
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(
      expectedParams.redirectUri,
    );
  }

  if (expectedParams.scope) {
    expect(parsedUrl.searchParams.get('scope')).toBe(expectedParams.scope);
  }

  if (expectedParams.state) {
    expect(parsedUrl.searchParams.get('state')).toBe(expectedParams.state);
  }

  if (expectedParams.hasCodeChallenge) {
    expect(parsedUrl.searchParams.has('code_challenge')).toBe(true);
  }

  if (expectedParams.codeChallengeMethod) {
    expect(parsedUrl.searchParams.get('code_challenge_method')).toBe(
      expectedParams.codeChallengeMethod,
    );
  }

  // always verify required OAuth parameters are present
  expect(parsedUrl.searchParams.get('response_type')).toBe('code');
}

/**
 * verifies that fetch was called with correct OAuth metadata URLs
 * @param mockFetch mock fetch function to verify
 */
export function verifyMetadataFetchCalls(
  mockFetch: ReturnType<typeof vi.fn>,
): void {
  expect(mockFetch).toHaveBeenCalledTimes(2);

  // verify resource metadata fetch call
  expect(mockFetch).toHaveBeenNthCalledWith(
    1,
    TEST_CONSTANTS.RESOURCE_METADATA_URL,
    expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json' },
    }),
  );

  // verify authorization server metadata fetch call
  expect(mockFetch).toHaveBeenNthCalledWith(
    2,
    `${TEST_CONSTANTS.AUTH_SERVER_URL}/.well-known/oauth-authorization-server`,
    expect.objectContaining({
      method: 'GET',
      headers: { Accept: 'application/json' },
    }),
  );
}
