import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import { handleIntrospect } from '#oauth/proxy/handlers/introspect';
import {
  generateClientId,
  generateClientSecret,
  hashClientSecret,
} from '#oauth/proxy/registration';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OAuthProxyConfig } from '#oauth/proxy/config';
import type { ProxyIntrospectionRequestWire } from '#oauth/proxy/types';

type IntrospectionRequest = FastifyRequest<{
  Body: ProxyIntrospectionRequestWire;
}>;

describe('fn:handleIntrospect', () => {
  const createRequest = (
    body: Partial<ProxyIntrospectionRequestWire>,
    headers: Record<string, string | undefined> = {},
  ): IntrospectionRequest =>
    ({
      body,
      headers,
    }) as IntrospectionRequest;

  const createReply = (): FastifyReply => {
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    return reply as unknown as FastifyReply;
  };

  const createConfig = (): OAuthProxyConfig => ({
    externalAS: {
      issuer: 'https://external-as.example.com',
      introspectionEndpoint: 'https://external-as.example.com/oauth/introspect',
    },
    proxyClient: {
      clientId: 'proxy-client-id',
      clientSecret: 'proxy-client-secret',
      redirectUri: 'https://proxy.example.com/oauth/callback',
    },
    storage: new MemoryProxyStorageAdapter(),
    stateSecret: 'a-very-long-secret-key-at-least-32-chars',
  });

  let storage: MemoryProxyStorageAdapter;
  let config: OAuthProxyConfig;
  let testClientId: string;
  let testClientSecret: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    storage = new MemoryProxyStorageAdapter();
    config = createConfig();
    config.storage = storage;

    testClientId = generateClientId();
    testClientSecret = generateClientSecret();

    await storage.upsertClient(testClientId, {
      client_id: testClientId,
      client_secret_hash: hashClientSecret(testClientSecret),
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      created_at: Date.now(),
    });

    vi.resetAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('client authentication', () => {
    it('should reject missing client credentials', async () => {
      const request = createRequest({
        token: 'some-token',
      });
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_client',
        }),
      );
    });

    it('should reject invalid client credentials', async () => {
      const credentials = Buffer.from(`${testClientId}:wrong-secret`).toString(
        'base64',
      );
      const request = createRequest(
        { token: 'some-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('introspection forwarding', () => {
    it('should forward introspection and return active response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            active: true,
            scope: 'openid profile',
            sub: 'user123',
            exp: Math.floor(Date.now() / 1000) + 3600,
          }),
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'access-token-123' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
          scope: 'openid profile',
          sub: 'user123',
        }),
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://external-as.example.com/oauth/introspect',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should return inactive for expired tokens', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify({ active: false }),
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'expired-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.send).toHaveBeenCalledWith({ active: false });
    });

    it('should return inactive on error from external AS', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'some-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.send).toHaveBeenCalledWith({ active: false });
    });
  });

  describe('token mapping enrichment', () => {
    it('should enrich response with local client_id from token mapping', async () => {
      // store a token mapping
      const tokenHash = createHash('sha256')
        .update('mapped-access-token')
        .digest('hex');

      await storage.upsertTokenMapping(tokenHash, {
        clientId: testClientId,
        tokenType: 'access_token',
        issuedAt: Date.now(),
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () =>
          JSON.stringify({
            active: true,
            scope: 'openid',
            sub: 'user456',
          }),
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'mapped-access-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
          client_id: testClientId,
        }),
      );
    });

    it('should not add client_id for inactive tokens', async () => {
      const tokenHash = createHash('sha256')
        .update('inactive-token')
        .digest('hex');

      await storage.upsertTokenMapping(tokenHash, {
        clientId: testClientId,
        tokenType: 'access_token',
        issuedAt: Date.now(),
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify({ active: false }),
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'inactive-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleIntrospect(request, reply, config, storage);

      expect(reply.send).toHaveBeenCalledWith({ active: false });
    });
  });
});
