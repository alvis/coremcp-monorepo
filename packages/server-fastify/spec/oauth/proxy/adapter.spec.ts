import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';

import type {
  AuthCodeMapping,
  ProxyClient,
  TokenMapping,
} from '#oauth/proxy/adapter';

const HOUR_IN_MS = 3600000;
const TEN_MINUTES_IN_MS = 600000;

vi.useFakeTimers();
vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

describe('cl:MemoryProxyStorageAdapter', () => {
  let adapter: MemoryProxyStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryProxyStorageAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  describe('client operations', () => {
    const sampleClient: ProxyClient = {
      client_id: 'proxy_abc123',
      client_secret_hash: 'hashed_secret',
      client_name: 'Test Client',
      redirect_uris: ['https://example.com/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      scope: 'mcp read',
      created_at: Date.now(),
    };

    it('should store and retrieve a client', async () => {
      await adapter.upsertClient(sampleClient.client_id, sampleClient);
      const retrieved = await adapter.findClient(sampleClient.client_id);

      expect(retrieved).toEqual(sampleClient);
    });

    it('should return null for non-existent client', async () => {
      const retrieved = await adapter.findClient('non-existent');

      expect(retrieved).toBeNull();
    });

    it('should update an existing client', async () => {
      await adapter.upsertClient(sampleClient.client_id, sampleClient);

      const updatedClient = { ...sampleClient, client_name: 'Updated Name' };
      await adapter.upsertClient(sampleClient.client_id, updatedClient);

      const retrieved = await adapter.findClient(sampleClient.client_id);

      expect(retrieved?.client_name).toBe('Updated Name');
    });

    it('should delete a client', async () => {
      await adapter.upsertClient(sampleClient.client_id, sampleClient);
      await adapter.destroyClient(sampleClient.client_id);

      const retrieved = await adapter.findClient(sampleClient.client_id);

      expect(retrieved).toBeNull();
    });

    it('should handle deleting non-existent client gracefully', async () => {
      await expect(
        adapter.destroyClient('non-existent'),
      ).resolves.not.toThrow();
    });
  });

  describe('auth code mapping operations', () => {
    const sampleMapping: AuthCodeMapping = {
      clientId: 'proxy_abc123',
      redirectUri: 'https://example.com/callback',
      codeChallenge: 'challenge123',
      codeChallengeMethod: 'S256',
      scope: 'mcp read',
      issuedAt: Date.now(),
      expiresAt: Date.now() + TEN_MINUTES_IN_MS,
    };

    it('should store and retrieve an auth code mapping', async () => {
      const code = 'auth_code_123';
      await adapter.upsertAuthCodeMapping(code, sampleMapping);

      const retrieved = await adapter.findAuthCodeMapping(code);

      expect(retrieved).toEqual(sampleMapping);
    });

    it('should return null for non-existent code', async () => {
      const retrieved = await adapter.findAuthCodeMapping('non-existent');

      expect(retrieved).toBeNull();
    });

    it('should return null for expired code', async () => {
      const code = 'expired_code';
      const expiredMapping = {
        ...sampleMapping,
        expiresAt: Date.now() - 1000, // expired 1 second ago
      };

      await adapter.upsertAuthCodeMapping(code, expiredMapping);

      const retrieved = await adapter.findAuthCodeMapping(code);

      expect(retrieved).toBeNull();
    });

    it('should consume auth code mapping atomically', async () => {
      const code = 'auth_code_456';
      await adapter.upsertAuthCodeMapping(code, sampleMapping);

      // first consumption should succeed
      const consumed = await adapter.consumeAuthCodeMapping(code);

      expect(consumed).toEqual(sampleMapping);

      // second consumption should fail
      const secondAttempt = await adapter.consumeAuthCodeMapping(code);

      expect(secondAttempt).toBeNull();
    });

    it('should return null when consuming non-existent code', async () => {
      const consumed = await adapter.consumeAuthCodeMapping('non-existent');

      expect(consumed).toBeNull();
    });
  });

  describe('token mapping operations', () => {
    const sampleTokenMapping: TokenMapping = {
      clientId: 'proxy_abc123',
      tokenType: 'access_token',
      issuedAt: Date.now(),
      expiresAt: Date.now() + HOUR_IN_MS,
    };

    it('should store and retrieve a token mapping', async () => {
      const tokenHash = 'token_hash_123';
      await adapter.upsertTokenMapping(tokenHash, sampleTokenMapping);

      const retrieved = await adapter.findTokenMapping(tokenHash);

      expect(retrieved).toEqual(sampleTokenMapping);
    });

    it('should return null for non-existent token', async () => {
      const retrieved = await adapter.findTokenMapping('non-existent');

      expect(retrieved).toBeNull();
    });

    it('should return null for expired token mapping', async () => {
      const tokenHash = 'expired_token';
      const expiredMapping = {
        ...sampleTokenMapping,
        expiresAt: Date.now() - 1000,
      };

      await adapter.upsertTokenMapping(tokenHash, expiredMapping);

      const retrieved = await adapter.findTokenMapping(tokenHash);

      expect(retrieved).toBeNull();
    });

    it('should delete a token mapping', async () => {
      const tokenHash = 'token_hash_456';
      await adapter.upsertTokenMapping(tokenHash, sampleTokenMapping);
      await adapter.destroyTokenMapping(tokenHash);

      const retrieved = await adapter.findTokenMapping(tokenHash);

      expect(retrieved).toBeNull();
    });

    it('should handle token mapping without expiry', async () => {
      const tokenHash = 'no_expiry_token';
      const mappingNoExpiry: TokenMapping = {
        clientId: 'proxy_abc123',
        tokenType: 'refresh_token',
        issuedAt: Date.now(),
      };

      await adapter.upsertTokenMapping(tokenHash, mappingNoExpiry);

      const retrieved = await adapter.findTokenMapping(tokenHash);

      expect(retrieved).toEqual(mappingNoExpiry);
    });
  });

  describe('cleanup operations', () => {
    it('should clean up expired auth code mappings', async () => {
      const validCode = 'valid_code';
      const expiredCode = 'expired_code';

      await adapter.upsertAuthCodeMapping(validCode, {
        clientId: 'client1',
        redirectUri: 'https://example.com/callback',
        issuedAt: Date.now(),
        expiresAt: Date.now() + HOUR_IN_MS,
      });

      await adapter.upsertAuthCodeMapping(expiredCode, {
        clientId: 'client2',
        redirectUri: 'https://example.com/callback',
        issuedAt: Date.now() - HOUR_IN_MS,
        expiresAt: Date.now() - 1000,
      });

      const cleaned = await adapter.cleanupExpired();

      expect(cleaned).toBe(1);
      expect(await adapter.findAuthCodeMapping(validCode)).not.toBeNull();
      expect(await adapter.findAuthCodeMapping(expiredCode)).toBeNull();
    });

    it('should clean up expired token mappings', async () => {
      const validToken = 'valid_token';
      const expiredToken = 'expired_token';

      await adapter.upsertTokenMapping(validToken, {
        clientId: 'client1',
        tokenType: 'access_token',
        issuedAt: Date.now(),
        expiresAt: Date.now() + HOUR_IN_MS,
      });

      await adapter.upsertTokenMapping(expiredToken, {
        clientId: 'client2',
        tokenType: 'access_token',
        issuedAt: Date.now() - HOUR_IN_MS,
        expiresAt: Date.now() - 1000,
      });

      const cleaned = await adapter.cleanupExpired();

      expect(cleaned).toBe(1);
      expect(await adapter.findTokenMapping(validToken)).not.toBeNull();
      expect(await adapter.findTokenMapping(expiredToken)).toBeNull();
    });

    it('should return 0 when nothing to clean up', async () => {
      const cleaned = await adapter.cleanupExpired();

      expect(cleaned).toBe(0);
    });
  });
});
