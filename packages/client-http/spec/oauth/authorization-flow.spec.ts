import { describe, expect, it, vi } from 'vitest';

import { ExternalError } from '#errors';
import { handleAuthorizationChallenge } from '#oauth/authorization-flow';

import type { AuthorizationFlowConfig } from '#oauth/authorization-flow';
import type {
  AuthorizationServerMetadata,
  ProtectedResourceMetadata,
} from '#oauth';

const discoverFromChallenge = vi.hoisted(() =>
  vi.fn<
    (typeof import('#oauth/openid-client-adapter'))['discoverFromChallenge']
  >(async () => ({
    authServerMetadata: {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/oauth/authorize',
      token_endpoint: 'https://auth.example.com/oauth/token',
    } satisfies AuthorizationServerMetadata,
    resourceMetadata: {
      resource: 'https://mcp.example.com',
      authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['mcp', 'files:read'],
    } satisfies ProtectedResourceMetadata,
  })),
);

const createAuthorizationUrl = vi.hoisted(() =>
  vi.fn(async () => ({
    authorizationUrl:
      'https://auth.example.com/oauth/authorize?client_id=test-client-id',
    codeVerifier: 'test-code-verifier',
  })),
);

vi.mock('#oauth/openid-client-adapter', () => ({
  discoverFromChallenge,
  createAuthorizationUrl,
}));

const defaultConfig: AuthorizationFlowConfig = {
  clientId: 'test-client-id',
  redirectUri: 'https://myapp.com/callback',
  additionalScopes: ['offline_access'],
};

const authServerMetadata: AuthorizationServerMetadata = {
  issuer: 'https://auth.example.com',
  authorization_endpoint: 'https://auth.example.com/oauth/authorize',
  token_endpoint: 'https://auth.example.com/oauth/token',
};

const resourceMetadata: ProtectedResourceMetadata = {
  resource: 'https://mcp.example.com',
  authorization_servers: ['https://auth.example.com'],
  scopes_supported: ['mcp', 'files:read'],
};

describe('cl:handleAuthorizationChallenge', () => {
  it('should successfully handle OAuth challenge and return authorization flow result', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    const result = await handleAuthorizationChallenge(
      wwwAuthHeader,
      defaultConfig,
    );

    expect(result).toEqual({
      authorizationUrl:
        'https://auth.example.com/oauth/authorize?client_id=test-client-id',
      codeVerifier: 'test-code-verifier',
      issuer: 'https://auth.example.com',
      authServerMetadata,
      resourceMetadata,
    });
  });

  it('should call discoverFromChallenge with correct WWW-Authenticate header', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    await handleAuthorizationChallenge(wwwAuthHeader, defaultConfig);

    expect(discoverFromChallenge).toHaveBeenCalledWith(wwwAuthHeader);
    expect(discoverFromChallenge).toHaveBeenCalledTimes(1);
  });

  it('should combine resource scopes with additional scopes', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    await handleAuthorizationChallenge(wwwAuthHeader, defaultConfig);

    expect(createAuthorizationUrl).toHaveBeenCalledWith(
      authServerMetadata,
      'test-client-id',
      'https://myapp.com/callback',
      {
        scopes: ['mcp', 'files:read', 'offline_access'],
        resource: 'https://mcp.example.com',
      },
    );
  });

  it('should handle resource metadata without scopes', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    const metadataWithoutScopes = {
      ...resourceMetadata,
      scopes_supported: undefined,
    };

    discoverFromChallenge.mockResolvedValueOnce({
      authServerMetadata: authServerMetadata,
      resourceMetadata: metadataWithoutScopes,
    });

    await handleAuthorizationChallenge(wwwAuthHeader, defaultConfig);

    expect(createAuthorizationUrl).toHaveBeenCalledWith(
      authServerMetadata,
      'test-client-id',
      'https://myapp.com/callback',
      {
        scopes: ['offline_access'], // Only additional scopes
        resource: 'https://mcp.example.com',
      },
    );
  });

  it('should handle config without additional scopes', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    const configWithoutScopes: AuthorizationFlowConfig = {
      clientId: 'test-client-id',
      redirectUri: 'https://myapp.com/callback',
    };

    await handleAuthorizationChallenge(wwwAuthHeader, configWithoutScopes);

    expect(createAuthorizationUrl).toHaveBeenCalledWith(
      authServerMetadata,
      'test-client-id',
      'https://myapp.com/callback',
      {
        scopes: ['mcp', 'files:read'], // Only resource scopes
        resource: 'https://mcp.example.com',
      },
    );
  });

  it('should throw ExternalError when discovery fails', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    discoverFromChallenge.mockRejectedValue(new Error('Discovery failed'));

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(ExternalError);

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(
      'Failed to handle OAuth authorization challenge: Discovery failed',
    );
  });

  it('should preserve ExternalError from discovery', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    const originalError = new ExternalError(
      'WWW-Authenticate header missing resource_metadata parameter',
    );

    discoverFromChallenge.mockRejectedValue(originalError);

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(originalError);
  });

  it('should throw ExternalError when authorization URL generation fails', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    discoverFromChallenge.mockResolvedValue({
      authServerMetadata: authServerMetadata,
      resourceMetadata: resourceMetadata,
    });

    createAuthorizationUrl.mockRejectedValue(
      new Error('URL generation failed'),
    );

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(ExternalError);

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(
      'Failed to handle OAuth authorization challenge: URL generation failed',
    );
  });

  it('should preserve ExternalError from authorization URL generation', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    discoverFromChallenge.mockResolvedValue({
      authServerMetadata: authServerMetadata,
      resourceMetadata: resourceMetadata,
    });

    const originalError = new ExternalError(
      'Authorization server metadata missing authorization_endpoint',
    );

    createAuthorizationUrl.mockRejectedValue(originalError);

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(originalError);
  });

  it('should handle non-Error exceptions', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    discoverFromChallenge.mockRejectedValue('String error');

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(ExternalError);

    await expect(
      handleAuthorizationChallenge(wwwAuthHeader, defaultConfig),
    ).rejects.toThrow(
      'Failed to handle OAuth authorization challenge: String error',
    );
  });

  it('should return all metadata for subsequent token exchange', async () => {
    const wwwAuthHeader =
      'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

    discoverFromChallenge.mockResolvedValue({
      authServerMetadata: authServerMetadata,
      resourceMetadata: resourceMetadata,
    });

    createAuthorizationUrl.mockResolvedValue({
      authorizationUrl: 'https://auth.example.com/oauth/authorize',
      codeVerifier: 'test-code-verifier',
    });

    const result = await handleAuthorizationChallenge(
      wwwAuthHeader,
      defaultConfig,
    );

    // Verify all necessary state is returned for token exchange
    expect(result.authServerMetadata).toBe(authServerMetadata);
    expect(result.resourceMetadata).toBe(resourceMetadata);
    expect(result.issuer).toBe('https://auth.example.com');
    expect(result.codeVerifier).toBe('test-code-verifier');
  });
});
