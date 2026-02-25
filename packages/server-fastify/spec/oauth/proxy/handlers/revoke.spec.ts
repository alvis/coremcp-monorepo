import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import { handleRevoke } from '#oauth/proxy/handlers/revoke';
import {
  generateClientId,
  generateClientSecret,
  hashClientSecret,
} from '#oauth/proxy/registration';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OAuthProxyConfig } from '#oauth/proxy/config';
import type { ProxyRevocationRequestWire } from '#oauth/proxy/types';

type RevocationRequest = FastifyRequest<{ Body: ProxyRevocationRequestWire }>;

describe('fn:handleRevoke', () => {
  const createRequest = (
    body: Partial<ProxyRevocationRequestWire>,
    headers: Record<string, string | undefined> = {},
  ): RevocationRequest =>
    ({
      body,
      headers,
    }) as RevocationRequest;

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
      revocationEndpoint: 'https://external-as.example.com/oauth/revoke',
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

      await handleRevoke(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_client',
        }),
      );
    });
  });

  describe('revocation forwarding', () => {
    it('should forward revocation and return 200', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'access-token-to-revoke' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleRevoke(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalled();

      expect(fetch).toHaveBeenCalledWith(
        'https://external-as.example.com/oauth/revoke',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should return 200 even if token is invalid (RFC 7009)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'invalid-or-already-revoked-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleRevoke(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('should include token_type_hint if provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'refresh-token-123', token_type_hint: 'refresh_token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleRevoke(request, reply, config, storage);

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('token_type_hint=refresh_token'),
        }),
      );
    });
  });

  describe('token mapping cleanup', () => {
    it('should delete local token mapping after revocation', async () => {
      // store a token mapping
      const token = 'token-to-revoke';
      const tokenHash = createHash('sha256').update(token).digest('hex');

      await storage.upsertTokenMapping(tokenHash, {
        clientId: testClientId,
        tokenType: 'access_token',
        issuedAt: Date.now(),
      });

      // verify it exists
      const mappingBefore = await storage.findTokenMapping(tokenHash);

      expect(mappingBefore).not.toBeNull();

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleRevoke(request, reply, config, storage);

      // verify mapping was deleted
      const mappingAfter = await storage.findTokenMapping(tokenHash);

      expect(mappingAfter).toBeNull();
    });

    it('should succeed even if no mapping exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { token: 'unknown-token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleRevoke(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(200);
    });
  });
});
