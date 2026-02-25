import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import { handleCallback } from '#oauth/proxy/handlers/callback';
import { encodeProxyState } from '#oauth/proxy/state';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OAuthProxyConfig } from '#oauth/proxy/config';

describe('fn:handleCallback', () => {
  const STATE_SECRET = 'a-very-long-secret-key-at-least-32-chars';

  const createMockRequest = (
    query: Record<string, string | undefined>,
  ): FastifyRequest => ({ query }) as FastifyRequest;

  const createMockReply = (): FastifyReply => {
    const reply = {
      redirect: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    return reply as unknown as FastifyReply;
  };

  const createConfig = (): OAuthProxyConfig => ({
    externalAS: {
      issuer: 'https://external-as.example.com',
      authorizationEndpoint: 'https://external-as.example.com/oauth/authorize',
      tokenEndpoint: 'https://external-as.example.com/oauth/token',
    },
    proxyClient: {
      clientId: 'proxy-client-id',
      clientSecret: 'proxy-client-secret',
      redirectUri: 'https://proxy.example.com/oauth/callback',
    },
    storage: new MemoryProxyStorageAdapter(),
    stateSecret: STATE_SECRET,
    stateExpirySeconds: 600,
  });

  let storage: MemoryProxyStorageAdapter;
  let config: OAuthProxyConfig;

  beforeEach(() => {
    storage = new MemoryProxyStorageAdapter();
    config = createConfig();
    config.storage = storage;
  });

  describe('state validation', () => {
    it('should reject missing state parameter', async () => {
      const request = createMockRequest({
        code: 'auth-code-123',
      });
      const reply = createMockReply();

      await handleCallback(
        request as FastifyRequest<{
          Querystring: { code?: string; state?: string };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'Missing state parameter',
        }),
      );
    });

    it('should reject invalid state JWT', async () => {
      const request = createMockRequest({
        code: 'auth-code-123',
        state: 'invalid-state-token',
      });
      const reply = createMockReply();

      await handleCallback(
        request as FastifyRequest<{
          Querystring: { code?: string; state?: string };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_request',
        }),
      );
    });
  });

  describe('error forwarding', () => {
    it('should forward external AS errors to original client', async () => {
      const proxyState = await encodeProxyState(
        {
          clientId: 'test-client',
          redirectUri: 'https://app.example.com/callback',
          originalState: 'user-state-123',
          timestamp: Date.now(),
        },
        STATE_SECRET,
      );

      const request = createMockRequest({
        error: 'access_denied',
        error_description: 'User denied access',
        state: proxyState,
      });
      const reply = createMockReply();

      await handleCallback(
        request as FastifyRequest<{
          Querystring: { code?: string; state?: string };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.origin).toBe('https://app.example.com');
      expect(redirectUrl.searchParams.get('error')).toBe('access_denied');
      expect(redirectUrl.searchParams.get('error_description')).toBe(
        'User denied access',
      );
      expect(redirectUrl.searchParams.get('state')).toBe('user-state-123');
    });
  });

  describe('successful callback', () => {
    it('should store auth code mapping and redirect to client', async () => {
      const proxyState = await encodeProxyState(
        {
          clientId: 'test-client',
          redirectUri: 'https://app.example.com/callback',
          originalState: 'user-state-456',
          codeChallenge: 'challenge123',
          codeChallengeMethod: 'S256',
          scope: 'openid profile',
          timestamp: Date.now(),
        },
        STATE_SECRET,
      );

      const request = createMockRequest({
        code: 'external-auth-code',
        state: proxyState,
      });
      const reply = createMockReply();

      await handleCallback(
        request as FastifyRequest<{
          Querystring: { code?: string; state?: string };
        }>,
        reply,
        config,
        storage,
      );

      // should redirect to original client
      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.origin).toBe('https://app.example.com');
      expect(redirectUrl.pathname).toBe('/callback');
      expect(redirectUrl.searchParams.get('code')).toBe('external-auth-code');
      expect(redirectUrl.searchParams.get('state')).toBe('user-state-456');

      // should store auth code mapping
      const codeMapping =
        await storage.findAuthCodeMapping('external-auth-code');

      expect(codeMapping).not.toBeNull();
      expect(codeMapping?.clientId).toBe('test-client');
      expect(codeMapping?.redirectUri).toBe('https://app.example.com/callback');
      expect(codeMapping?.codeChallenge).toBe('challenge123');
      expect(codeMapping?.codeChallengeMethod).toBe('S256');
      expect(codeMapping?.scope).toBe('openid profile');
    });

    it('should handle callback without original state', async () => {
      const proxyState = await encodeProxyState(
        {
          clientId: 'test-client',
          redirectUri: 'https://app.example.com/callback',
          timestamp: Date.now(),
        },
        STATE_SECRET,
      );

      const request = createMockRequest({
        code: 'auth-code-789',
        state: proxyState,
      });
      const reply = createMockReply();

      await handleCallback(
        request as FastifyRequest<{
          Querystring: { code?: string; state?: string };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.searchParams.get('code')).toBe('auth-code-789');
      expect(redirectUrl.searchParams.has('state')).toBe(false);
    });

    it('should reject callback without code when no error', async () => {
      const proxyState = await encodeProxyState(
        {
          clientId: 'test-client',
          redirectUri: 'https://app.example.com/callback',
          originalState: 'state123',
          timestamp: Date.now(),
        },
        STATE_SECRET,
      );

      const request = createMockRequest({
        state: proxyState,
      });
      const reply = createMockReply();

      await handleCallback(
        request as FastifyRequest<{
          Querystring: { code?: string; state?: string };
        }>,
        reply,
        config,
        storage,
      );

      // should redirect with error
      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.searchParams.get('error')).toBe('server_error');
      expect(redirectUrl.searchParams.get('state')).toBe('state123');
    });
  });
});
