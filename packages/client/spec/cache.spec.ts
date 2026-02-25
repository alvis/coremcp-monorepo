/**
 * @file tests for CacheManager list caching with TTL and auto-update
 * @module spec/cache-manager
 * @description
 * this test suite validates the CacheManager's ability to cache list operations
 * with TTL-based expiration and auto-update capabilities. It covers:
 * - Getting and setting cached data
 * - TTL-based expiration
 * - Cache invalidation
 * - Auto-update configuration
 * - Per-server, per-list-type caching
 *
 * The CacheManager provides performance optimization for listXXX operations
 * by caching results with configurable TTL and auto-refresh on notifications.
 * @see {@link ../src/cache-manager.ts} - CacheManager implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManager } from '#cache';

import type { Prompt, Tool } from '@coremcp/protocol';

describe('CacheManager', () => {
  describe('constructor', () => {
    it('should use default TTL (30 minutes) when not provided', () => {
      const cache = new CacheManager();

      expect(cache.ttl).toBe(30 * 60 * 1000);
    });

    it('should use provided TTL', () => {
      const cache = new CacheManager({ ttl: 60_000 });

      expect(cache.ttl).toBe(60_000);
    });

    it('should accept empty config object', () => {
      const cache = new CacheManager({});

      expect(cache.ttl).toBe(30 * 60 * 1000);
    });
  });

  describe('set and get', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager({ ttl: 1000 });
    });

    it('should store and retrieve prompts', () => {
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];

      cache.set('server1', 'prompts', prompts);
      const retrieved = cache.get<Prompt>('server1', 'prompts');

      expect(retrieved).toEqual(prompts);
    });

    it('should return undefined for non-existent server', () => {
      const retrieved = cache.get<Prompt>('nonexistent', 'prompts');

      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for non-existent list type', () => {
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      cache.set('server1', 'prompts', prompts);

      const retrieved = cache.get<Tool>('server1', 'tools');

      expect(retrieved).toBeUndefined();
    });

    it('should maintain separate caches per server', () => {
      const prompts1: Prompt[] = [
        { name: 'server1-prompt', description: 'Server 1 prompt' },
      ];
      const prompts2: Prompt[] = [
        { name: 'server2-prompt', description: 'Server 2 prompt' },
      ];

      cache.set('server1', 'prompts', prompts1);
      cache.set('server2', 'prompts', prompts2);

      expect(cache.get<Prompt>('server1', 'prompts')).toEqual(prompts1);
      expect(cache.get<Prompt>('server2', 'prompts')).toEqual(prompts2);
    });

    it('should maintain separate caches per list type', () => {
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      const tools: Tool[] = [
        {
          name: 'test-tool',
          description: 'Test tool',
          inputSchema: { type: 'object', required: [] } as Tool['inputSchema'],
        },
      ];

      cache.set('server1', 'prompts', prompts);
      cache.set('server1', 'tools', tools);

      expect(cache.get<Prompt>('server1', 'prompts')).toEqual(prompts);
      expect(cache.get<Tool>('server1', 'tools')).toEqual(tools);
    });
  });

  describe('TTL expiration', () => {
    it('should return cached data before expiration', () => {
      vi.useFakeTimers();
      const cache = new CacheManager({ ttl: 1000 });
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];

      cache.set('server1', 'prompts', prompts);

      // advance time by 500ms (half of TTL)
      vi.advanceTimersByTime(500);

      const retrieved = cache.get<Prompt>('server1', 'prompts');

      expect(retrieved).toEqual(prompts);
      vi.useRealTimers();
    });

    it('should return undefined after expiration', () => {
      vi.useFakeTimers();
      const cache = new CacheManager({ ttl: 1000 });
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];

      cache.set('server1', 'prompts', prompts);

      // advance time beyond TTL
      vi.advanceTimersByTime(1001);

      const retrieved = cache.get<Prompt>('server1', 'prompts');

      expect(retrieved).toBeUndefined();
      vi.useRealTimers();
    });

    it('should reset TTL when updating cache', () => {
      vi.useFakeTimers();
      const cache = new CacheManager({ ttl: 1000 });
      const prompts1: Prompt[] = [
        { name: 'test-prompt-1', description: 'Test prompt 1' },
      ];
      const prompts2: Prompt[] = [
        { name: 'test-prompt-2', description: 'Test prompt 2' },
      ];

      cache.set('server1', 'prompts', prompts1);

      // advance time by 500ms
      vi.advanceTimersByTime(500);

      // update cache
      cache.set('server1', 'prompts', prompts2);

      // advance time by another 600ms (total 1100ms from first set)
      vi.advanceTimersByTime(600);

      // should still be valid because TTL was reset
      const retrieved = cache.get<Prompt>('server1', 'prompts');

      expect(retrieved).toEqual(prompts2);
      vi.useRealTimers();
    });
  });

  describe('invalidate', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager();
    });

    it('should invalidate specific list type for a server', () => {
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      const tools: Tool[] = [
        {
          name: 'test-tool',
          description: 'Test tool',
          inputSchema: { type: 'object', required: [] } as Tool['inputSchema'],
        },
      ];

      cache.set('server1', 'prompts', prompts);
      cache.set('server1', 'tools', tools);

      cache.invalidate('server1', 'prompts');

      expect(cache.get<Prompt>('server1', 'prompts')).toBeUndefined();
      expect(cache.get<Tool>('server1', 'tools')).toEqual(tools);
    });

    it('should handle invalidation of non-existent cache', () => {
      expect(() => cache.invalidate('nonexistent', 'prompts')).not.toThrow();
    });

    it('should handle invalidation of non-existent list type', () => {
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      cache.set('server1', 'prompts', prompts);

      expect(() => cache.invalidate('server1', 'tools')).not.toThrow();
      expect(cache.get<Prompt>('server1', 'prompts')).toEqual(prompts);
    });
  });

  describe('invalidateServer', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager();
    });

    it('should invalidate all list types for a server', () => {
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      const tools: Tool[] = [
        {
          name: 'test-tool',
          description: 'Test tool',
          inputSchema: { type: 'object', required: [] } as Tool['inputSchema'],
        },
      ];

      cache.set('server1', 'prompts', prompts);
      cache.set('server1', 'tools', tools);

      cache.invalidateServer('server1');

      expect(cache.get<Prompt>('server1', 'prompts')).toBeUndefined();
      expect(cache.get<Tool>('server1', 'tools')).toBeUndefined();
    });

    it('should not affect other servers', () => {
      const prompts1: Prompt[] = [
        { name: 'server1-prompt', description: 'Server 1 prompt' },
      ];
      const prompts2: Prompt[] = [
        { name: 'server2-prompt', description: 'Server 2 prompt' },
      ];

      cache.set('server1', 'prompts', prompts1);
      cache.set('server2', 'prompts', prompts2);

      cache.invalidateServer('server1');

      expect(cache.get<Prompt>('server1', 'prompts')).toBeUndefined();
      expect(cache.get<Prompt>('server2', 'prompts')).toEqual(prompts2);
    });

    it('should handle invalidation of non-existent server', () => {
      expect(() => cache.invalidateServer('nonexistent')).not.toThrow();
    });
  });

  describe('clear', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager();
    });

    it('should clear all cached data', () => {
      const prompts1: Prompt[] = [
        { name: 'server1-prompt', description: 'Server 1 prompt' },
      ];
      const prompts2: Prompt[] = [
        { name: 'server2-prompt', description: 'Server 2 prompt' },
      ];
      const tools: Tool[] = [
        {
          name: 'test-tool',
          description: 'Test tool',
          inputSchema: { type: 'object', required: [] } as Tool['inputSchema'],
        },
      ];

      cache.set('server1', 'prompts', prompts1);
      cache.set('server2', 'prompts', prompts2);
      cache.set('server1', 'tools', tools);

      cache.clear();

      expect(cache.get<Prompt>('server1', 'prompts')).toBeUndefined();
      expect(cache.get<Prompt>('server2', 'prompts')).toBeUndefined();
      expect(cache.get<Tool>('server1', 'tools')).toBeUndefined();
    });
  });

  describe('has', () => {
    let cache: CacheManager;

    beforeEach(() => {
      cache = new CacheManager({ ttl: 1000 });
    });

    it('should return true for valid cached data', () => {
      vi.useFakeTimers();
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      cache.set('server1', 'prompts', prompts);

      expect(cache.has('server1', 'prompts')).toBe(true);
      vi.useRealTimers();
    });

    it('should return false for non-existent server', () => {
      vi.useFakeTimers();

      expect(cache.has('nonexistent', 'prompts')).toBe(false);
      vi.useRealTimers();
    });

    it('should return false for non-existent list type', () => {
      vi.useFakeTimers();
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      cache.set('server1', 'prompts', prompts);

      expect(cache.has('server1', 'tools')).toBe(false);
      vi.useRealTimers();
    });

    it('should return false for expired cache', () => {
      vi.useFakeTimers();
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      cache.set('server1', 'prompts', prompts);

      // advance time beyond TTL
      vi.advanceTimersByTime(1001);

      expect(cache.has('server1', 'prompts')).toBe(false);
      vi.useRealTimers();
    });

    it('should return true before expiration', () => {
      vi.useFakeTimers();
      const prompts: Prompt[] = [
        { name: 'test-prompt', description: 'Test prompt' },
      ];
      cache.set('server1', 'prompts', prompts);

      // advance time by 500ms (half of TTL)
      vi.advanceTimersByTime(500);

      expect(cache.has('server1', 'prompts')).toBe(true);
      vi.useRealTimers();
    });
  });
});
