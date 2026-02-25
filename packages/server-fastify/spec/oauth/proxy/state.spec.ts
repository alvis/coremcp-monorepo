import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  decodeProxyState,
  encodeProxyState,
  ProxyStateError,
} from '#oauth/proxy/state';

import type { ProxyState } from '#oauth/proxy/state';

const TEST_SECRET = 'this-is-a-32-character-secret!!';

describe('Proxy State JWT Encoding/Decoding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fn:encodeProxyState', () => {
    it('should encode proxy state with all fields', async () => {
      const state: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        originalState: 'user-provided-state',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        codeChallengeMethod: 'S256',
        scope: 'mcp read write',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(state, TEST_SECRET);

      expect(typeof encoded).toBe('string');
      expect(encoded.split('.')).toHaveLength(3); // JWT format
    });

    it('should encode proxy state with minimal fields', async () => {
      const state: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(state, TEST_SECRET);

      expect(typeof encoded).toBe('string');
    });

    it('should create different tokens for different states', async () => {
      const state1: ProxyState = {
        clientId: 'client1',
        redirectUri: 'https://example.com/callback1',
        timestamp: Date.now(),
      };

      const state2: ProxyState = {
        clientId: 'client2',
        redirectUri: 'https://example.com/callback2',
        timestamp: Date.now(),
      };

      const encoded1 = await encodeProxyState(state1, TEST_SECRET);
      const encoded2 = await encodeProxyState(state2, TEST_SECRET);

      expect(encoded1).not.toBe(encoded2);
    });
  });

  describe('fn:decodeProxyState', () => {
    it('should decode valid proxy state', async () => {
      const originalState: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        originalState: 'user-state',
        codeChallenge: 'challenge123',
        codeChallengeMethod: 'S256',
        scope: 'mcp read',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(originalState, TEST_SECRET);
      const decoded = await decodeProxyState(encoded, TEST_SECRET);

      expect(decoded).toEqual(originalState);
    });

    it('should decode state with optional fields undefined', async () => {
      const originalState: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(originalState, TEST_SECRET);
      const decoded = await decodeProxyState(encoded, TEST_SECRET);

      expect(decoded).toEqual(originalState);
    });

    it('should throw ProxyStateError for invalid token', async () => {
      await expect(
        decodeProxyState('invalid-token', TEST_SECRET),
      ).rejects.toThrow(ProxyStateError);
    });

    it('should throw ProxyStateError for wrong secret', async () => {
      const state: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(state, TEST_SECRET);

      await expect(
        decodeProxyState(encoded, 'wrong-secret-that-is-32-chars!!'),
      ).rejects.toThrow(ProxyStateError);
    });

    it('should throw ProxyStateError for expired token', async () => {
      const state: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(state, TEST_SECRET, 60); // 60 seconds expiry

      // advance time by 2 minutes
      vi.advanceTimersByTime(120000);

      await expect(decodeProxyState(encoded, TEST_SECRET)).rejects.toThrow(
        ProxyStateError,
      );
    });
  });

  describe('roundtrip encoding/decoding', () => {
    it('should preserve all state fields through roundtrip', async () => {
      const states: ProxyState[] = [
        {
          clientId: 'client1',
          redirectUri: 'https://app1.example.com/callback',
          originalState: 'state1',
          codeChallenge: 'challenge1',
          codeChallengeMethod: 'S256',
          scope: 'scope1 scope2',
          timestamp: Date.now(),
        },
        {
          clientId: 'client2',
          redirectUri: 'http://localhost:3000/oauth/callback',
          timestamp: Date.now(),
        },
        {
          clientId: 'client3',
          redirectUri: 'https://app.example.com/auth',
          codeChallengeMethod: 'plain',
          timestamp: Date.now() - 1000,
        },
      ];

      for (const originalState of states) {
        const encoded = await encodeProxyState(originalState, TEST_SECRET);
        const decoded = await decodeProxyState(encoded, TEST_SECRET);

        expect(decoded).toEqual(originalState);
      }
    });

    it('should work with custom expiry time', async () => {
      const state: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(state, TEST_SECRET, 300); // 5 minutes

      // should still be valid after 4 minutes
      vi.advanceTimersByTime(240000);
      const decoded = await decodeProxyState(encoded, TEST_SECRET);

      expect(decoded.clientId).toBe(state.clientId);
    });
  });

  describe('error handling', () => {
    it('should provide meaningful error message for invalid token format', async () => {
      try {
        await decodeProxyState('not.a.valid.jwt.token', TEST_SECRET);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProxyStateError);
        expect((error as ProxyStateError).message).toContain(
          'Failed to decode proxy state',
        );
      }
    });

    it('should provide meaningful error message for tampered token', async () => {
      const state: ProxyState = {
        clientId: 'proxy_abc123',
        redirectUri: 'https://example.com/callback',
        timestamp: Date.now(),
      };

      const encoded = await encodeProxyState(state, TEST_SECRET);
      const tampered = encoded.slice(0, -5) + 'xxxxx'; // tamper with signature

      try {
        await decodeProxyState(tampered, TEST_SECRET);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProxyStateError);
      }
    });
  });
});
