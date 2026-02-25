import { describe, expect, it } from 'vitest';

import { MemoryProxyStorageAdapter } from '#oauth/proxy/adapter';
import {
  DEFAULT_STATE_EXPIRY_SECONDS,
  MINIMUM_STATE_SECRET_LENGTH,
  validateProxyConfig,
} from '#oauth/proxy/config';

import type { OAuthProxyConfig } from '#oauth/proxy/config';

describe('OAuth Proxy Configuration', () => {
  const createValidConfig = (): OAuthProxyConfig => ({
    externalAS: {
      issuer: 'https://auth.example.com',
    },
    proxyClient: {
      clientId: 'proxy-client-id',
      clientSecret: 'proxy-client-secret',
      redirectUri: 'https://proxy.example.com/oauth/callback',
    },
    storage: new MemoryProxyStorageAdapter(),
    stateSecret: 'this-is-a-32-character-secret!!!',
  });

  describe('constants', () => {
    it('should have correct default state expiry', () => {
      expect(DEFAULT_STATE_EXPIRY_SECONDS).toBe(600);
    });

    it('should have correct minimum secret length', () => {
      expect(MINIMUM_STATE_SECRET_LENGTH).toBe(32);
    });
  });

  describe('validateProxyConfig', () => {
    it('should accept valid configuration', () => {
      const config = createValidConfig();

      expect(() => validateProxyConfig(config)).not.toThrow();
    });

    it('should accept configuration with optional endpoints', () => {
      const config: OAuthProxyConfig = {
        ...createValidConfig(),
        externalAS: {
          issuer: 'https://auth.example.com',
          authorizationEndpoint: 'https://auth.example.com/authorize',
          tokenEndpoint: 'https://auth.example.com/token',
          introspectionEndpoint: 'https://auth.example.com/introspect',
          revocationEndpoint: 'https://auth.example.com/revoke',
          parEndpoint: 'https://auth.example.com/par',
        },
      };

      expect(() => validateProxyConfig(config)).not.toThrow();
    });

    it('should accept configuration with optional settings', () => {
      const config: OAuthProxyConfig = {
        ...createValidConfig(),
        allowedScopes: ['mcp', 'read', 'write'],
        stateExpirySeconds: 300,
      };

      expect(() => validateProxyConfig(config)).not.toThrow();
    });

    describe('externalAS validation', () => {
      it('should reject missing issuer', () => {
        const config = createValidConfig();
        config.externalAS.issuer = '';

        expect(() => validateProxyConfig(config)).toThrow(
          'externalAS.issuer is required',
        );
      });
    });

    describe('proxyClient validation', () => {
      it('should reject missing clientId', () => {
        const config = createValidConfig();
        config.proxyClient.clientId = '';

        expect(() => validateProxyConfig(config)).toThrow(
          'proxyClient.clientId is required',
        );
      });

      it('should reject missing clientSecret', () => {
        const config = createValidConfig();
        config.proxyClient.clientSecret = '';

        expect(() => validateProxyConfig(config)).toThrow(
          'proxyClient.clientSecret is required',
        );
      });

      it('should reject missing redirectUri', () => {
        const config = createValidConfig();
        config.proxyClient.redirectUri = '';

        expect(() => validateProxyConfig(config)).toThrow(
          'proxyClient.redirectUri is required',
        );
      });
    });

    describe('storage validation', () => {
      it('should reject missing storage', () => {
        const config = createValidConfig();
        // @ts-expect-error testing invalid config
        config.storage = null;

        expect(() => validateProxyConfig(config)).toThrow(
          'storage adapter is required',
        );
      });
    });

    describe('stateSecret validation', () => {
      it('should reject missing stateSecret', () => {
        const config = createValidConfig();
        config.stateSecret = '';

        expect(() => validateProxyConfig(config)).toThrow(
          'stateSecret is required',
        );
      });

      it('should reject short stateSecret', () => {
        const config = createValidConfig();
        config.stateSecret = 'too-short';

        expect(() => validateProxyConfig(config)).toThrow(
          `stateSecret must be at least ${MINIMUM_STATE_SECRET_LENGTH} characters`,
        );
      });

      it('should accept exactly minimum length stateSecret', () => {
        const config = createValidConfig();
        config.stateSecret = 'a'.repeat(MINIMUM_STATE_SECRET_LENGTH);

        expect(() => validateProxyConfig(config)).not.toThrow();
      });
    });
  });
});
