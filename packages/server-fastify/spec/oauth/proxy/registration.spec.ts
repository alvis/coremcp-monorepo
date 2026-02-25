import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import {
  ClientRegistrationError,
  generateClientId,
  generateClientSecret,
  handleClientRegistration,
  hashClientSecret,
  validateClientCredentials,
  validateRegistrationRequest,
  verifyClientSecret,
} from '#oauth/proxy/registration';

import type { ClientRegistrationRequest } from '#oauth/proxy/registration';

describe('Client Registration', () => {
  describe('fn: generateClientId', () => {
    it('should generate unique client IDs with proxy_ prefix', () => {
      const id1 = generateClientId();
      const id2 = generateClientId();

      expect(id1).toMatch(/^proxy_[a-f0-9]{32}$/);
      expect(id2).toMatch(/^proxy_[a-f0-9]{32}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('fn: generateClientSecret', () => {
    it('should generate unique secrets of 64 hex characters', () => {
      const secret1 = generateClientSecret();
      const secret2 = generateClientSecret();

      expect(secret1).toMatch(/^[a-f0-9]{64}$/);
      expect(secret2).toMatch(/^[a-f0-9]{64}$/);
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('fn: hashClientSecret', () => {
    it('should produce consistent hash for same input', () => {
      const secret = 'test-secret';
      const hash1 = hashClientSecret(secret);
      const hash2 = hashClientSecret(secret);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashClientSecret('secret1');
      const hash2 = hashClientSecret('secret2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64 character hex hash', () => {
      const hash = hashClientSecret('any-secret');

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('fn: verifyClientSecret', () => {
    it('should return true for matching secret and hash', () => {
      const secret = 'my-secret';
      const hash = hashClientSecret(secret);

      expect(verifyClientSecret(secret, hash)).toBe(true);
    });

    it('should return false for non-matching secret', () => {
      const hash = hashClientSecret('correct-secret');

      expect(verifyClientSecret('wrong-secret', hash)).toBe(false);
    });

    it('should return false for different length hashes', () => {
      expect(verifyClientSecret('secret', 'short')).toBe(false);
    });
  });

  describe('fn: validateRegistrationRequest', () => {
    it('should accept valid registration request', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        client_name: 'Test App',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope: 'mcp read',
      };

      expect(() => validateRegistrationRequest(request)).not.toThrow();
    });

    it('should accept localhost redirect URIs', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['http://localhost:3000/callback'],
      };

      expect(() => validateRegistrationRequest(request)).not.toThrow();
    });

    it('should accept 127.0.0.1 redirect URIs', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['http://127.0.0.1:8080/oauth/callback'],
      };

      expect(() => validateRegistrationRequest(request)).not.toThrow();
    });

    it('should reject empty redirect_uris', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: [],
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should reject non-https redirect URIs for non-localhost', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['http://example.com/callback'],
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should reject redirect URIs with fragments', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback#fragment'],
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should reject invalid redirect URI format', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['not-a-valid-url'],
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should reject unsupported grant types', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        grant_types: ['implicit'],
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should reject unsupported response types', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        response_types: ['token'],
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should reject unsupported auth methods', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method: 'private_key_jwt',
      };

      expect(() => validateRegistrationRequest(request)).toThrow(
        ClientRegistrationError,
      );
    });

    it('should validate scopes when allowedScopes provided', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        scope: 'mcp read admin',
      };

      expect(() =>
        validateRegistrationRequest(request, ['mcp', 'read']),
      ).toThrow(ClientRegistrationError);
    });

    it('should allow valid scopes when allowedScopes provided', () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        scope: 'mcp read',
      };

      expect(() =>
        validateRegistrationRequest(request, ['mcp', 'read', 'write']),
      ).not.toThrow();
    });
  });

  describe('fn: handleClientRegistration', () => {
    let storage: MemoryProxyStorageAdapter;

    beforeEach(() => {
      storage = new MemoryProxyStorageAdapter();
    });

    it('should register a client and return credentials', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        client_name: 'Test App',
        scope: 'mcp read',
      };

      const response = await handleClientRegistration(request, storage);

      expect(response.client_id).toMatch(/^proxy_/);
      expect(response.client_secret).toMatch(/^[a-f0-9]{64}$/);
      expect(response.client_secret_expires_at).toBe(0);
      expect(response.client_name).toBe('Test App');
      expect(response.redirect_uris).toEqual(['https://example.com/callback']);
      expect(response.grant_types).toEqual(['authorization_code']);
      expect(response.response_types).toEqual(['code']);
      expect(response.token_endpoint_auth_method).toBe('client_secret_basic');
      expect(response.scope).toBe('mcp read');
    });

    it('should store the client in storage', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
      };

      const response = await handleClientRegistration(request, storage);
      const storedClient = await storage.findClient(response.client_id);

      expect(storedClient).not.toBeNull();
      expect(storedClient?.client_id).toBe(response.client_id);
    });

    it('should hash the client secret before storing', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
      };

      const response = await handleClientRegistration(request, storage);
      const storedClient = await storage.findClient(response.client_id);

      // the stored hash should not equal the plaintext secret
      expect(storedClient?.client_secret_hash).not.toBe(response.client_secret);

      // but verifying should work
      expect(
        verifyClientSecret(
          response.client_secret,
          storedClient!.client_secret_hash,
        ),
      ).toBe(true);
    });

    it('should use default grant_types if not specified', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
      };

      const response = await handleClientRegistration(request, storage);

      expect(response.grant_types).toEqual(['authorization_code']);
    });

    it('should store client metadata', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        client_name: 'Test App',
        contacts: ['admin@example.com'],
        logo_uri: 'https://example.com/logo.png',
        client_uri: 'https://example.com',
        policy_uri: 'https://example.com/privacy',
        tos_uri: 'https://example.com/tos',
      };

      const response = await handleClientRegistration(request, storage);
      const storedClient = await storage.findClient(response.client_id);

      expect(storedClient?.metadata).toEqual({
        contacts: ['admin@example.com'],
        logo_uri: 'https://example.com/logo.png',
        client_uri: 'https://example.com',
        policy_uri: 'https://example.com/privacy',
        tos_uri: 'https://example.com/tos',
      });
    });

    it('should reject invalid registration request', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: [],
      };

      await expect(handleClientRegistration(request, storage)).rejects.toThrow(
        ClientRegistrationError,
      );
    });
  });

  describe('fn: validateClientCredentials', () => {
    let storage: MemoryProxyStorageAdapter;

    beforeEach(() => {
      storage = new MemoryProxyStorageAdapter();
    });

    it('should return client for valid credentials', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
        client_name: 'Test App',
      };

      const response = await handleClientRegistration(request, storage);
      const client = await validateClientCredentials(
        response.client_id,
        response.client_secret,
        storage,
      );

      expect(client).not.toBeNull();
      expect(client?.client_id).toBe(response.client_id);
    });

    it('should return null for invalid secret', async () => {
      const request: ClientRegistrationRequest = {
        redirect_uris: ['https://example.com/callback'],
      };

      const response = await handleClientRegistration(request, storage);
      const client = await validateClientCredentials(
        response.client_id,
        'wrong-secret',
        storage,
      );

      expect(client).toBeNull();
    });

    it('should return null for non-existent client', async () => {
      const client = await validateClientCredentials(
        'non-existent',
        'any-secret',
        storage,
      );

      expect(client).toBeNull();
    });
  });
});
