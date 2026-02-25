/**
 * @file tests for RequestManager request lifecycle management
 * @module spec/request-manager
 * @description
 * this test suite validates the RequestManager's request lifecycle functionality:
 * - Request creation with unique IDs
 * - Promise resolver management
 * - Request resolution and rejection
 * - Request metadata tracking
 * - Counter management and cleanup
 */

import { describe, expect, it } from 'vitest';

import { RequestManager } from '#request-manager';

describe('cl:RequestManager', () => {
  describe('mt:createRequest', () => {
    it('should create request with unique incremental id', () => {
      const manager = new RequestManager();

      const first = manager.createRequest('method1');
      const second = manager.createRequest('method2');

      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
    });

    it('should create request with proper message envelope', () => {
      const manager = new RequestManager();
      const params = { key: 'value' };

      const { message } = manager.createRequest('test.method', params);

      expect(message).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'test.method',
        params: {
          key: 'value',
          _meta: { progressToken: 1 },
        },
      });
    });

    it('should track pending request count', () => {
      const manager = new RequestManager();

      expect(manager.pendingCount).toBe(0);

      manager.createRequest('method1');
      expect(manager.pendingCount).toBe(1);

      manager.createRequest('method2');
      expect(manager.pendingCount).toBe(2);
    });
  });

  describe('mt:resolveRequest', () => {
    it('should resolve existing request and remove from pending', async () => {
      const manager = new RequestManager();
      const { id, promise } = manager.createRequest('test');

      const resolved = manager.resolveRequest(id, { success: true });

      expect(resolved).toBe(true);
      expect(manager.pendingCount).toBe(0);
      await expect(promise).resolves.toEqual({ success: true });
    });

    it('should return false when resolving non-existent request', () => {
      const manager = new RequestManager();

      const resolved = manager.resolveRequest(999, { data: 'test' });

      expect(resolved).toBe(false);
    });
  });

  describe('mt:rejectRequest', () => {
    it('should reject existing request and remove from pending', async () => {
      const manager = new RequestManager();
      const { id, promise } = manager.createRequest('test');
      const error = new Error('Test error');

      const rejected = manager.rejectRequest(id, error);

      expect(rejected).toBe(true);
      expect(manager.pendingCount).toBe(0);
      await expect(promise).rejects.toThrow('Test error');
    });

    it('should return false when rejecting non-existent request', () => {
      const manager = new RequestManager();
      const error = new Error('Test error');

      const rejected = manager.rejectRequest(999, error);

      expect(rejected).toBe(false);
    });
  });

  describe('mt:registerRequest', () => {
    it('should register request with custom id', async () => {
      const manager = new RequestManager();

      const promise = manager.registerRequest(0, 'initialize');

      expect(manager.pendingCount).toBe(1);
      expect(manager.getRequest(0)).toBeDefined();

      manager.resolveRequest(0, { success: true });
      await expect(promise).resolves.toEqual({ success: true });
    });

    it('should support string ids', async () => {
      const manager = new RequestManager();

      const promise = manager.registerRequest('custom-id', 'test');

      expect(manager.getRequest('custom-id')).toBeDefined();
      manager.resolveRequest('custom-id', { data: 'test' });
      await expect(promise).resolves.toEqual({ data: 'test' });
    });
  });

  describe('mt:getRequest', () => {
    it('should return request metadata', () => {
      const manager = new RequestManager();
      const { id } = manager.createRequest('test.method');

      const pending = manager.getRequest(id);

      expect(pending).toBeDefined();
      expect(pending?.request).toEqual({ id, method: 'test.method' });
      expect(pending?.startsAt).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent request', () => {
      const manager = new RequestManager();

      const pending = manager.getRequest(999);

      expect(pending).toBeUndefined();
    });
  });

  describe('mt:getRequestDuration', () => {
    it('should return duration in milliseconds', () => {
      const manager = new RequestManager();
      const { id } = manager.createRequest('test');

      const duration = manager.getRequestDuration(id);

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe('number');
    });

    it('should return undefined for non-existent request', () => {
      const manager = new RequestManager();

      const duration = manager.getRequestDuration(999);

      expect(duration).toBeUndefined();
    });
  });

  describe('mt:clear', () => {
    it('should remove all pending requests', () => {
      const manager = new RequestManager();
      manager.createRequest('method1');
      manager.createRequest('method2');

      manager.clear();

      expect(manager.pendingCount).toBe(0);
    });
  });

  describe('mt:resetIdCounter', () => {
    it('should reset counter to start from 1', () => {
      const manager = new RequestManager();
      manager.createRequest('first');
      manager.createRequest('second');
      manager.createRequest('third');

      manager.resetIdCounter();
      const { id } = manager.createRequest('reset');

      expect(id).toBe(1);
    });
  });
});
