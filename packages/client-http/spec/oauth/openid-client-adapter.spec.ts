import { afterEach, describe, expect, it } from 'vitest';

import {
  createAuthorizationUrl,
  discoverFromChallenge,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from '#oauth/openid-client-adapter';

import {
  MOCK_AUTH_SERVER_METADATA,
  MOCK_RESOURCE_METADATA,
  SAMPLE_AUTH_HEADERS,
  TEST_CONSTANTS,
} from '../mocks/fixtures';
import {
  captureRequest,
  mockErrorResponse,
  mockJsonResponse,
} from '../mocks/https';

import type { OAuthTokenResponse } from '#oauth/types';

describe('fn:discoverFromChallenge', () => {
  afterEach(() => {
    captureRequest.mockClear();
  });

  it('should discover OAuth configuration from WWW-Authenticate header', async () => {
    mockJsonResponse(
      TEST_CONSTANTS.RESOURCE_METADATA_URL,
      MOCK_RESOURCE_METADATA,
    );
    mockJsonResponse(
      `${TEST_CONSTANTS.AUTH_SERVER_URL}/.well-known/oauth-authorization-server`,
      MOCK_AUTH_SERVER_METADATA,
    );

    const result = await discoverFromChallenge(
      SAMPLE_AUTH_HEADERS.BASIC_BEARER,
    );

    expect(result.resourceMetadata).toEqual(MOCK_RESOURCE_METADATA);
    expect(result.authServerMetadata).toEqual(MOCK_AUTH_SERVER_METADATA);
    expect(captureRequest).toHaveBeenCalledTimes(2);
  });

  it('should handle resource metadata fetch failure', async () => {
    mockErrorResponse(
      TEST_CONSTANTS.RESOURCE_METADATA_URL,
      new Error('Not found'),
    );

    await expect(
      discoverFromChallenge(SAMPLE_AUTH_HEADERS.BASIC_BEARER),
    ).rejects.toThrow();
  });

  it('should handle authorization server metadata fetch failure', async () => {
    mockJsonResponse(
      TEST_CONSTANTS.RESOURCE_METADATA_URL,
      MOCK_RESOURCE_METADATA,
    );
    mockErrorResponse(
      `${TEST_CONSTANTS.AUTH_SERVER_URL}/.well-known/oauth-authorization-server`,
      new Error('Server error'),
    );

    await expect(
      discoverFromChallenge(SAMPLE_AUTH_HEADERS.BASIC_BEARER),
    ).rejects.toThrow();
  });
});

describe('fn:createAuthorizationUrl', () => {
  it('should create authorization URL with PKCE', async () => {
    const result = await createAuthorizationUrl(
      MOCK_AUTH_SERVER_METADATA,
      TEST_CONSTANTS.CLIENT_ID,
      TEST_CONSTANTS.CALLBACK_URL,
      {
        scopes: ['files:read', 'files:write'],
        resource: 'https://mcp.example.com',
      },
    );

    expect(result.authorizationUrl).toContain(
      MOCK_AUTH_SERVER_METADATA.authorization_endpoint,
    );
    expect(result.authorizationUrl).toContain('code_challenge');
    expect(result.authorizationUrl).toContain('code_challenge_method=S256');
    expect(result.codeVerifier).toBeTruthy();
  });

  it('should include custom state parameter', async () => {
    const customState = 'custom-state-value';

    const result = await createAuthorizationUrl(
      MOCK_AUTH_SERVER_METADATA,
      TEST_CONSTANTS.CLIENT_ID,
      TEST_CONSTANTS.CALLBACK_URL,
      {
        state: customState,
      },
    );

    expect(result.authorizationUrl).toContain(`state=${customState}`);
  });

  it('should include resource parameter for confused deputy prevention', async () => {
    const resourceUrl = 'https://mcp.example.com';

    const result = await createAuthorizationUrl(
      MOCK_AUTH_SERVER_METADATA,
      TEST_CONSTANTS.CLIENT_ID,
      TEST_CONSTANTS.CALLBACK_URL,
      {
        resource: resourceUrl,
      },
    );

    expect(result.authorizationUrl).toContain(
      `resource=${encodeURIComponent(resourceUrl)}`,
    );
  });
});

describe('fn:exchangeAuthorizationCode', () => {
  it('should exchange authorization code for tokens', async () => {
    const code = 'authorization-code';
    const codeVerifier = 'code-verifier';
    const expectedTokens: OAuthTokenResponse = {
      access_token: 'access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'refresh-token',
    };

    mockJsonResponse(MOCK_AUTH_SERVER_METADATA.token_endpoint, expectedTokens, {
      method: 'POST',
    });

    const result = await exchangeAuthorizationCode(
      MOCK_AUTH_SERVER_METADATA,
      TEST_CONSTANTS.CLIENT_ID,
      TEST_CONSTANTS.CALLBACK_URL,
      code,
      codeVerifier,
    );

    expect(result).toEqual(expectedTokens);
    expect(captureRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: MOCK_AUTH_SERVER_METADATA.token_endpoint,
        method: 'POST',
      }),
    );
  });

  it('should handle token exchange failure', async () => {
    mockErrorResponse(
      MOCK_AUTH_SERVER_METADATA.token_endpoint,
      new Error('Invalid code'),
    );

    await expect(
      exchangeAuthorizationCode(
        MOCK_AUTH_SERVER_METADATA,
        TEST_CONSTANTS.CLIENT_ID,
        TEST_CONSTANTS.CALLBACK_URL,
        'invalid-code',
        'code-verifier',
      ),
    ).rejects.toThrow();
  });
});

describe('fn:refreshAccessToken', () => {
  afterEach(() => {
    captureRequest.mockClear();
  });

  it('should refresh access token using refresh token', async () => {
    const refreshToken = 'refresh-token';
    const expectedTokens: OAuthTokenResponse = {
      access_token: 'new-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    mockJsonResponse(MOCK_AUTH_SERVER_METADATA.token_endpoint, expectedTokens, {
      method: 'POST',
    });

    const result = await refreshAccessToken(
      MOCK_AUTH_SERVER_METADATA,
      TEST_CONSTANTS.CLIENT_ID,
      refreshToken,
    );

    expect(result).toEqual(expectedTokens);
    expect(captureRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: MOCK_AUTH_SERVER_METADATA.token_endpoint,
        method: 'POST',
      }),
    );
  });

  it('should handle refresh token failure', async () => {
    mockErrorResponse(
      MOCK_AUTH_SERVER_METADATA.token_endpoint,
      new Error('Invalid refresh token'),
    );

    await expect(
      refreshAccessToken(
        MOCK_AUTH_SERVER_METADATA,
        TEST_CONSTANTS.CLIENT_ID,
        'invalid-refresh-token',
      ),
    ).rejects.toThrow();
  });
});
