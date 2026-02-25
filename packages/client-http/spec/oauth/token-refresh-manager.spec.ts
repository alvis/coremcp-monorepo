import { describe, expect, it, vi } from 'vitest';

import { TokenRefreshManager } from '#oauth/token-refresh-manager';

import type { RefreshFunction } from '#oauth/token-refresh-manager';

import type { OAuthTokenResponse } from '#oauth/types';

vi.useFakeTimers();
vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

const mockAccessToken = 'current-access-token';
const mockRefreshToken = 'refresh-token';
const fiveMinutesInSeconds = 300;
const oneHourInSeconds = 3600;

describe('cl:TokenRefreshManager', () => {
  const createMockRefreshFn = () => vi.fn<RefreshFunction>();

  describe('fn:getValidToken', () => {
    it('should return current token when not expiring soon', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const manager = new TokenRefreshManager(
        mockAccessToken,
        mockRefreshToken,
        mockRefreshFn,
        oneHourInSeconds,
      );

      const token = await manager.getValidToken();

      expect(token).toBe(mockAccessToken);
      expect(mockRefreshFn).not.toHaveBeenCalled();
    });

    it('should refresh token when expiring within 5 minutes', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const newAccessToken = 'new-access-token';
      const tokenResponse: OAuthTokenResponse = {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: oneHourInSeconds,
      };

      mockRefreshFn.mockResolvedValueOnce(tokenResponse);

      const manager = new TokenRefreshManager(
        mockAccessToken,
        mockRefreshToken,
        mockRefreshFn,
        fiveMinutesInSeconds - 1,
      );

      const token = await manager.getValidToken();

      expect(token).toBe(newAccessToken);
      expect(mockRefreshFn).toHaveBeenCalledTimes(1);
    });

    it('should refresh token when already expired', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const newAccessToken = 'new-access-token';
      const tokenResponse: OAuthTokenResponse = {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: oneHourInSeconds,
      };

      mockRefreshFn.mockResolvedValueOnce(tokenResponse);

      const manager = new TokenRefreshManager(
        mockAccessToken,
        mockRefreshToken,
        mockRefreshFn,
        fiveMinutesInSeconds,
      );

      // move time forward past expiration
      vi.setSystemTime(new Date('2024-01-01T12:06:00Z'));

      const token = await manager.getValidToken();

      expect(token).toBe(newAccessToken);
      expect(mockRefreshFn).toHaveBeenCalledTimes(1);
    });

    it('should propagate refresh errors to caller', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const refreshError = new Error('Refresh failed');
      mockRefreshFn.mockRejectedValueOnce(refreshError);

      const manager = new TokenRefreshManager(
        mockAccessToken,
        mockRefreshToken,
        mockRefreshFn,
        fiveMinutesInSeconds - 1,
      );

      await expect(manager.getValidToken()).rejects.toThrow('Refresh failed');
    });
  });

  describe('expiration calculation', () => {
    it('should use JWT exp claim when available', async () => {
      const mockRefreshFn = createMockRefreshFn();
      // JWT with exp claim set to 1 hour from now
      const jwtToken = createMockJWT({
        exp: Math.floor(Date.now() / 1000) + oneHourInSeconds,
      });

      const manager = new TokenRefreshManager(
        jwtToken,
        mockRefreshToken,
        mockRefreshFn,
      );

      const token = await manager.getValidToken();

      expect(token).toBe(jwtToken);
      expect(mockRefreshFn).not.toHaveBeenCalled();
    });

    it('should fall back to expires_in when JWT has no exp claim', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const nonJwtToken = 'opaque-access-token';

      const manager = new TokenRefreshManager(
        nonJwtToken,
        mockRefreshToken,
        mockRefreshFn,
        oneHourInSeconds,
      );

      const token = await manager.getValidToken();

      expect(token).toBe(nonJwtToken);
      expect(mockRefreshFn).not.toHaveBeenCalled();
    });

    it('should default to 1 hour when neither JWT nor expires_in available', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const nonJwtToken = 'opaque-access-token';

      const manager = new TokenRefreshManager(
        nonJwtToken,
        mockRefreshToken,
        mockRefreshFn,
        undefined,
      );

      const token = await manager.getValidToken();

      expect(token).toBe(nonJwtToken);
      expect(mockRefreshFn).not.toHaveBeenCalled();
    });
  });

  describe('refresh token updates', () => {
    it('should update internal state after successful refresh', async () => {
      const mockRefreshFn = createMockRefreshFn();
      const firstNewToken = 'first-new-token';
      const secondNewToken = 'second-new-token';

      mockRefreshFn
        .mockResolvedValueOnce({
          access_token: firstNewToken,
          expires_in: fiveMinutesInSeconds - 1,
        })
        .mockResolvedValueOnce({
          access_token: secondNewToken,
          expires_in: oneHourInSeconds,
        });

      const manager = new TokenRefreshManager(
        mockAccessToken,
        mockRefreshToken,
        mockRefreshFn,
        fiveMinutesInSeconds - 1,
      );

      // first refresh
      const firstToken = await manager.getValidToken();
      expect(firstToken).toBe(firstNewToken);

      // second refresh (first refresh returned token expiring soon)
      const secondToken = await manager.getValidToken();
      expect(secondToken).toBe(secondNewToken);

      expect(mockRefreshFn).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * creates mock JWT token with custom payload
 * @param payload JWT payload claims
 * @returns base64url-encoded JWT token
 */
function createMockJWT(payload: Record<string, unknown>): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url',
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url',
  );
  const signature = 'mock-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
