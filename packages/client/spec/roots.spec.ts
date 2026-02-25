/**
 * @file tests for RootManager root directory operations
 * @module spec/roots
 * @description
 * this test suite validates the RootManager's ability to manage root directories
 * for MCP clients. It covers:
 * - Constructor initialization with empty and initial roots
 * - Defensive copying to prevent external mutation
 * - Getting roots with array copy semantics
 * - Adding new roots with duplicate detection
 * - Removing roots by URI
 * - Server notification on root changes
 *
 * The RootManager enables clients to manage filesystem roots that can be
 * exposed to connected MCP servers, handling root list operations and
 * notifying servers when the roots list changes.
 * @see {@link ../src/roots.ts} - RootManager implementation
 * @see {@link ../src/connection.ts} - ConnectionManager for server access
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RootManager } from '#roots';

import type { Root } from '@coremcp/protocol';

import type { ConnectionManager } from '#connection';
import type { McpConnector } from '#connector';

// MOCKS //

const { sendNotificationFn1 } = vi.hoisted(() => ({
  sendNotificationFn1: vi.fn().mockResolvedValue(undefined),
}));

const { sendNotificationFn2 } = vi.hoisted(() => ({
  sendNotificationFn2: vi.fn().mockResolvedValue(undefined),
}));

// CONSTANTS //

const testRoot1: Root = {
  uri: 'file:///home/user/project1',
  name: 'Project 1',
};

const testRoot2: Root = {
  uri: 'file:///home/user/project2',
  name: 'Project 2',
};

const testRoot3: Root = {
  uri: 'file:///home/user/project3',
};

// TEST SUITES //

describe('cl:RootManager', () => {
  let mockServer1: McpConnector;
  let mockServer2: McpConnector;
  let connectorsMap: Map<string, McpConnector>;
  let mockConnectionManager: ConnectionManager;

  beforeEach(() => {
    mockServer1 = {
      sendNotification: sendNotificationFn1,
    } as unknown as McpConnector;

    mockServer2 = {
      sendNotification: sendNotificationFn2,
    } as unknown as McpConnector;

    connectorsMap = new Map([
      ['server1', mockServer1],
      ['server2', mockServer2],
    ]);

    mockConnectionManager = {
      connectors: connectorsMap,
    } satisfies Partial<ConnectionManager> as Partial<ConnectionManager> as ConnectionManager;
  });

  describe('constructor', () => {
    it('should create instance with empty roots array', () => {
      const manager = new RootManager([], mockConnectionManager);

      const roots = manager.getRoots();

      expect(roots).toEqual([]);
    });

    it('should create instance with initial roots', () => {
      const initialRoots = [testRoot1, testRoot2];

      const manager = new RootManager(initialRoots, mockConnectionManager);

      expect(manager.getRoots()).toEqual([testRoot1, testRoot2]);
    });

    it('should make defensive copy of roots to prevent mutation isolation', () => {
      const initialRoots = [testRoot1];
      const manager = new RootManager(initialRoots, mockConnectionManager);

      initialRoots.push(testRoot2);

      expect(manager.getRoots()).toEqual([testRoot1]);
    });
  });

  describe('mt:getRoots', () => {
    it('should return empty array when no roots', () => {
      const manager = new RootManager([], mockConnectionManager);

      const roots = manager.getRoots();

      expect(roots).toEqual([]);
    });

    it('should return copy of roots array not reference', () => {
      const manager = new RootManager([testRoot1], mockConnectionManager);

      const roots1 = manager.getRoots();
      const roots2 = manager.getRoots();

      expect(roots1).not.toBe(roots2);
      expect(roots1).toEqual(roots2);
    });

    it('should return all roots with correct properties', () => {
      const manager = new RootManager(
        [testRoot1, testRoot2, testRoot3],
        mockConnectionManager,
      );

      const roots = manager.getRoots();

      expect(roots).toEqual([
        { uri: 'file:///home/user/project1', name: 'Project 1' },
        { uri: 'file:///home/user/project2', name: 'Project 2' },
        { uri: 'file:///home/user/project3' },
      ]);
    });
  });

  describe('mt:addRoot', () => {
    it('should add new root successfully and return true', async () => {
      const manager = new RootManager([], mockConnectionManager);

      const result = await manager.addRoot(testRoot1);

      expect(result).toBe(true);
      expect(manager.getRoots()).toEqual([testRoot1]);
    });

    it('should reject duplicate root with same URI and return false', async () => {
      const manager = new RootManager([testRoot1], mockConnectionManager);
      const duplicateRoot: Root = {
        uri: testRoot1.uri,
        name: 'Different Name',
      };

      const result = await manager.addRoot(duplicateRoot);

      expect(result).toBe(false);
      expect(manager.getRoots()).toEqual([testRoot1]);
    });

    it('should notify all connected servers after adding', async () => {
      const manager = new RootManager([], mockConnectionManager);

      await manager.addRoot(testRoot1);

      expect(sendNotificationFn1).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
      expect(sendNotificationFn2).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
    });

    it('should handle adding when no servers connected', async () => {
      const emptyConnectionManager = {
        connectors: new Map(),
      } satisfies Partial<ConnectionManager> as Partial<ConnectionManager> as ConnectionManager;
      const manager = new RootManager([], emptyConnectionManager);

      const result = await manager.addRoot(testRoot1);

      expect(result).toBe(true);
      expect(manager.getRoots()).toEqual([testRoot1]);
    });

    it('should not notify servers when duplicate root rejected', async () => {
      const manager = new RootManager([testRoot1], mockConnectionManager);

      await manager.addRoot(testRoot1);

      expect(sendNotificationFn1).not.toHaveBeenCalled();
      expect(sendNotificationFn2).not.toHaveBeenCalled();
    });
  });

  describe('mt:removeRoot', () => {
    it('should remove existing root by URI and return true', async () => {
      const manager = new RootManager(
        [testRoot1, testRoot2],
        mockConnectionManager,
      );

      const result = await manager.removeRoot(testRoot1.uri);

      expect(result).toBe(true);
      expect(manager.getRoots()).toEqual([testRoot2]);
    });

    it('should return false for non-existent URI', async () => {
      const manager = new RootManager([testRoot1], mockConnectionManager);

      const result = await manager.removeRoot('file:///non/existent/path');

      expect(result).toBe(false);
      expect(manager.getRoots()).toEqual([testRoot1]);
    });

    it('should notify all connected servers after removing', async () => {
      const manager = new RootManager([testRoot1], mockConnectionManager);

      await manager.removeRoot(testRoot1.uri);

      expect(sendNotificationFn1).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
      expect(sendNotificationFn2).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
    });

    it('should handle removing when no servers connected', async () => {
      const emptyConnectionManager = {
        connectors: new Map(),
      } satisfies Partial<ConnectionManager> as Partial<ConnectionManager> as ConnectionManager;
      const manager = new RootManager([testRoot1], emptyConnectionManager);

      const result = await manager.removeRoot(testRoot1.uri);

      expect(result).toBe(true);
      expect(manager.getRoots()).toEqual([]);
    });

    it('should not notify servers when non-existent root removal attempted', async () => {
      const manager = new RootManager([testRoot1], mockConnectionManager);

      await manager.removeRoot('file:///non/existent/path');

      expect(sendNotificationFn1).not.toHaveBeenCalled();
      expect(sendNotificationFn2).not.toHaveBeenCalled();
    });
  });

  describe('server notification', () => {
    it('should call sendNotification with correct method on all connected servers', async () => {
      const manager = new RootManager([], mockConnectionManager);

      await manager.addRoot(testRoot1);

      expect(sendNotificationFn1).toHaveBeenCalledTimes(1);
      expect(sendNotificationFn1).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
      expect(sendNotificationFn2).toHaveBeenCalledTimes(1);
      expect(sendNotificationFn2).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
    });

    it('should work with multiple servers in parallel', async () => {
      const manager = new RootManager([], mockConnectionManager);

      await manager.addRoot(testRoot1);
      await manager.removeRoot(testRoot1.uri);

      expect(sendNotificationFn1).toHaveBeenCalledTimes(2);
      expect(sendNotificationFn2).toHaveBeenCalledTimes(2);
    });
  });
});
