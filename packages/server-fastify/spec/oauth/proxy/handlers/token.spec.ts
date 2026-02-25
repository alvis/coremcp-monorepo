import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import { handleToken } from '#oauth/proxy/handlers/token';
import {
  generateClientId,
  generateClientSecret,
  hashClientSecret,
} from '#oauth/proxy/registration';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OAuthProxyConfig } from '#oauth/proxy/config';
import type { ProxyTokenRequestWire } from '#oauth/proxy/types';

type TokenRequest = FastifyRequest<{ Body: ProxyTokenRequestWire }>;

describe('fn: handleToken', () => {
  const createRequest = (
    body: Partial<ProxyTokenRequestWire>,
    headers: Record<string, string | undefined> = {},
  ): TokenRequest =>
    ({
      body,
      headers,
    }) as TokenRequest;

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
      tokenEndpoint: 'https://external-as.example.com/oauth/token',
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

  beforeEach(async () => {
    storage = new MemoryProxyStorageAdapter();
    config = createConfig();
    config.storage = storage;

    // register a test client
    testClientId = generateClientId();
    testClientSecret = generateClientSecret();

    await storage.upsertClient(testClientId, {
      client_id: testClientId,
      client_secret_hash: hashClientSecret(testClientSecret),
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      created_at: Date.now(),
    });
  });

  describe('client authentication', () => {
    it('should reject missing client credentials', async () => {
      const request = createRequest({
        grant_type: 'authorization_code',
        code: 'auth-code',
      });
      const reply = createReply();

      await handleToken(request, reply, config, storage);

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
        { grant_type: 'authorization_code', code: 'auth-code' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_client',
        }),
      );
    });

    it('should accept credentials in body', async () => {
      // need to set up auth code mapping first
      await storage.upsertAuthCodeMapping('test-code', {
        clientId: testClientId,
        redirectUri: 'https://app.example.com/callback',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: 'access123',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid',
            }),
        }),
      );

      const request = createRequest({
        grant_type: 'authorization_code',
        code: 'test-code',
        client_id: testClientId,
        client_secret: testClientSecret,
      });
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(200);
    });
  });

  describe('authorization_code grant', () => {
    it('should reject missing code', async () => {
      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { grant_type: 'authorization_code' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'code is required',
        }),
      );
    });

    it('should reject invalid/expired code', async () => {
      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { grant_type: 'authorization_code', code: 'invalid-code' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_grant',
        }),
      );
    });

    it('should reject code issued to different client', async () => {
      await storage.upsertAuthCodeMapping('stolen-code', {
        clientId: 'different-client',
        redirectUri: 'https://other.example.com/callback',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { grant_type: 'authorization_code', code: 'stolen-code' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_grant',
          error_description: 'Authorization code was not issued to this client',
        }),
      );
    });

    it('should verify PKCE code_verifier', async () => {
      const codeChallenge = createHash('sha256')
        .update('valid-verifier')
        .digest('base64url');

      await storage.upsertAuthCodeMapping('pkce-code', {
        clientId: testClientId,
        redirectUri: 'https://app.example.com/callback',
        codeChallenge,
        codeChallengeMethod: 'S256',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      });

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        {
          grant_type: 'authorization_code',
          code: 'pkce-code',
          code_verifier: 'wrong-verifier',
        },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_grant',
          error_description: 'Invalid code_verifier',
        }),
      );
    });

    it('should forward successful token request', async () => {
      await storage.upsertAuthCodeMapping('valid-code', {
        clientId: testClientId,
        redirectUri: 'https://app.example.com/callback',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: 'new-access-token',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid profile',
              refresh_token: 'new-refresh-token',
            }),
        }),
      );

      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { grant_type: 'authorization_code', code: 'valid-code' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'new-access-token',
          token_type: 'Bearer',
          refresh_token: 'new-refresh-token',
        }),
      );

      // verify token mappings were stored
      const accessTokenHash = createHash('sha256')
        .update('new-access-token')
        .digest('hex');
      const accessMapping = await storage.findTokenMapping(accessTokenHash);

      expect(accessMapping).not.toBeNull();
      expect(accessMapping?.clientId).toBe(testClientId);
      expect(accessMapping?.tokenType).toBe('access_token');

      const refreshTokenHash = createHash('sha256')
        .update('new-refresh-token')
        .digest('hex');
      const refreshMapping = await storage.findTokenMapping(refreshTokenHash);

      expect(refreshMapping).not.toBeNull();
      expect(refreshMapping?.tokenType).toBe('refresh_token');
    });
  });

  describe('refresh_token grant', () => {
    it('should reject missing refresh_token', async () => {
      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { grant_type: 'refresh_token' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'invalid_request',
          error_description: 'refresh_token is required',
        }),
      );
    });
  });

  describe('unsupported grant types', () => {
    it('should reject unsupported grant_type', async () => {
      const credentials = Buffer.from(
        `${testClientId}:${testClientSecret}`,
      ).toString('base64');
      const request = createRequest(
        { grant_type: 'client_credentials' },
        { authorization: `Basic ${credentials}` },
      );
      const reply = createReply();

      await handleToken(request, reply, config, storage);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'unsupported_grant_type',
        }),
      );
    });
  });
});
