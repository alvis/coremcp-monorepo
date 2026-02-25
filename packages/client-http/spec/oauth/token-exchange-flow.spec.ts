import { describe, expect, it, vi } from 'vitest';

import { ExternalError } from '#errors';
import { exchangeCodeForTokens } from '#oauth/token-exchange-flow';

const exchangeAuthorizationCode = vi.hoisted(() =>
  vi.fn<
    (typeof import('#oauth/openid-client-adapter'))['exchangeAuthorizationCode']
  >(async () => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
  })),
);

vi.mock('#oauth/openid-client-adapter', () => ({
  exchangeAuthorizationCode,
}));

const mockAuthServerMetadata = {
  issuer: 'https://auth.example.com',
  authorization_endpoint: 'https://auth.example.com/oauth/authorize',
  token_endpoint: 'https://auth.example.com/oauth/token',
};

describe('fn:exchangeCodeForTokens', () => {
  it('should successfully exchange authorization code for tokens', async () => {
    const mockRefreshCallback = vi.fn();

    const result = await exchangeCodeForTokens(
      mockAuthServerMetadata,
      'test-client-id',
      'https://myapp.com/callback?code=abc',
      'authorization-code',
      'pkce-code-verifier',
      mockRefreshCallback,
    );

    expect(result.accessToken).toBe('test-access-token');
    expect(result.refreshToken).toBe('test-refresh-token');
  });

  it('should call exchangeAuthorizationCode with correct parameters', async () => {
    const mockRefreshCallback = vi.fn();

    await exchangeCodeForTokens(
      mockAuthServerMetadata,
      'test-client-id',
      'https://myapp.com/callback?code=abc',
      'authorization-code',
      'pkce-code-verifier',
      mockRefreshCallback,
    );

    expect(exchangeAuthorizationCode).toHaveBeenCalledWith(
      mockAuthServerMetadata,
      'test-client-id',
      'https://myapp.com/callback?code=abc',
      'authorization-code',
      'pkce-code-verifier',
    );
  });

  it('should handle token response without refresh token', async () => {
    const mockRefreshCallback = vi.fn();
    exchangeAuthorizationCode.mockResolvedValueOnce({
      access_token: 'test-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const result = await exchangeCodeForTokens(
      mockAuthServerMetadata,
      'test-client-id',
      'https://myapp.com/callback?code=abc',
      'authorization-code',
      'pkce-code-verifier',
      mockRefreshCallback,
    );

    expect(result.accessToken).toBe('test-access-token');
    expect(result.refreshToken).toBeUndefined();
  });

  it('should initialize token manager with refresh callback', async () => {
    const mockRefreshCallback = vi.fn();
    exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    const result = await exchangeCodeForTokens(
      mockAuthServerMetadata,
      'test-client-id',
      'https://myapp.com/callback?code=abc',
      'authorization-code',
      'pkce-code-verifier',
      mockRefreshCallback,
    );

    // token manager should be ready to use
    await expect(result.tokenManager.getValidToken()).resolves.toBe(
      'test-access-token',
    );
  });

  it('should throw ExternalError when token exchange fails', async () => {
    const mockRefreshCallback = vi.fn();
    exchangeAuthorizationCode.mockRejectedValue(
      new Error('Token exchange failed'),
    );

    await expect(
      exchangeCodeForTokens(
        mockAuthServerMetadata,
        'test-client-id',
        'https://myapp.com/callback?code=abc',
        'authorization-code',
        'pkce-code-verifier',
        mockRefreshCallback,
      ),
    ).rejects.toThrow(ExternalError);

    await expect(
      exchangeCodeForTokens(
        mockAuthServerMetadata,
        'test-client-id',
        'https://myapp.com/callback?code=abc',
        'authorization-code',
        'pkce-code-verifier',
        mockRefreshCallback,
      ),
    ).rejects.toThrow(
      'Failed to exchange authorization code for tokens: Token exchange failed',
    );
  });

  it('should preserve ExternalError from token exchange', async () => {
    const mockRefreshCallback = vi.fn();
    const originalError = new ExternalError(
      'Token exchange failed: 401 Unauthorized',
    );

    exchangeAuthorizationCode.mockRejectedValue(originalError);

    await expect(
      exchangeCodeForTokens(
        mockAuthServerMetadata,
        'test-client-id',
        'https://myapp.com/callback?code=abc',
        'authorization-code',
        'pkce-code-verifier',
        mockRefreshCallback,
      ),
    ).rejects.toThrow(originalError);
  });

  it('should handle non-Error exceptions', async () => {
    const mockRefreshCallback = vi.fn();
    exchangeAuthorizationCode.mockRejectedValue('String error');

    await expect(
      exchangeCodeForTokens(
        mockAuthServerMetadata,
        'test-client-id',
        'https://myapp.com/callback?code=abc',
        'authorization-code',
        'pkce-code-verifier',
        mockRefreshCallback,
      ),
    ).rejects.toThrow(ExternalError);

    await expect(
      exchangeCodeForTokens(
        mockAuthServerMetadata,
        'test-client-id',
        'https://myapp.com/callback?code=abc',
        'authorization-code',
        'pkce-code-verifier',
        mockRefreshCallback,
      ),
    ).rejects.toThrow(
      'Failed to exchange authorization code for tokens: String error',
    );
  });
});
