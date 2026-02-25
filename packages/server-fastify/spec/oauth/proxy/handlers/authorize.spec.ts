import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import { handleAuthorize } from '#oauth/proxy/handlers/authorize';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OAuthProxyConfig } from '#oauth/proxy/config';

describe('fn:handleAuthorize', () => {
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
    stateSecret: 'a-very-long-secret-key-at-least-32-chars',
    stateExpirySeconds: 600,
  });

  let storage: MemoryProxyStorageAdapter;
  let config: OAuthProxyConfig;

  beforeEach(async () => {
    storage = new MemoryProxyStorageAdapter();
    config = createConfig();
    config.storage = storage;

    // register a test client
    await storage.upsertClient('test-client-id', {
      client_id: 'test-client-id',
      client_secret_hash: 'hash',
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      created_at: Date.now(),
    });
  });

  describe('parameter validation', () => {
    it('should reject missing client_id', async () => {
      const request = createMockRequest({
        response_type: 'code',
        redirect_uri: 'https://app.example.com/callback',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'client_id is required',
        }),
      );
    });

    it('should reject missing redirect_uri', async () => {
      const request = createMockRequest({
        response_type: 'code',
        client_id: 'test-client-id',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'redirect_uri is required',
        }),
      );
    });
  });

  describe('client validation', () => {
    it('should reject unknown client_id', async () => {
      const request = createMockRequest({
        response_type: 'code',
        client_id: 'unknown-client',
        redirect_uri: 'https://app.example.com/callback',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_client',
        }),
      );
    });

    it('should reject unregistered redirect_uri', async () => {
      const request = createMockRequest({
        response_type: 'code',
        client_id: 'test-client-id',
        redirect_uri: 'https://malicious.example.com/callback',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      // should NOT redirect to the unregistered URI
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_redirect_uri',
        }),
      );
    });
  });

  describe('successful authorization', () => {
    it('should redirect to external AS with proxy credentials', async () => {
      const request = createMockRequest({
        response_type: 'code',
        client_id: 'test-client-id',
        redirect_uri: 'https://app.example.com/callback',
        scope: 'openid profile',
        state: 'user-state-123',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.origin).toBe('https://external-as.example.com');
      expect(redirectUrl.pathname).toBe('/oauth/authorize');
      expect(redirectUrl.searchParams.get('client_id')).toBe('proxy-client-id');
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
        'https://proxy.example.com/oauth/callback',
      );
      expect(redirectUrl.searchParams.get('response_type')).toBe('code');
      expect(redirectUrl.searchParams.get('scope')).toBe('openid profile');
      expect(redirectUrl.searchParams.get('state')).toBeTruthy();
    });

    it('should include PKCE parameters in redirect', async () => {
      const request = createMockRequest({
        response_type: 'code',
        client_id: 'test-client-id',
        redirect_uri: 'https://app.example.com/callback',
        code_challenge: 'challenge123',
        code_challenge_method: 'S256',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.searchParams.get('code_challenge')).toBe(
        'challenge123',
      );
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe(
        'S256',
      );
    });
  });

  describe('scope validation', () => {
    it('should reject invalid scopes when allowedScopes configured', async () => {
      config.allowedScopes = ['openid', 'profile'];

      const request = createMockRequest({
        response_type: 'code',
        client_id: 'test-client-id',
        redirect_uri: 'https://app.example.com/callback',
        scope: 'openid admin',
        state: 'user-state',
      });
      const reply = createMockReply();

      await handleAuthorize(
        request as FastifyRequest<{
          Querystring: {
            response_type: 'code';
            client_id: string;
            redirect_uri: string;
          };
        }>,
        reply,
        config,
        storage,
      );

      // should redirect to client with error
      expect(reply.redirect).toHaveBeenCalled();

      const redirectUrl = new URL(
        (reply.redirect as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
      );

      expect(redirectUrl.origin).toBe('https://app.example.com');
      expect(redirectUrl.searchParams.get('error')).toBe('invalid_scope');
      expect(redirectUrl.searchParams.get('state')).toBe('user-state');
    });
  });
});
