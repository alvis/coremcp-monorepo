/**
 * @file tests for ConnectionManager server connection lifecycle
 * @module spec/connection
 * @description
 * validates connection manager's ability to manage multiple server connections,
 * including connection lifecycle, server lookup, and log level propagation.
 */

import { describe, expect, it, vi } from 'vitest';

import { ConnectionManager } from '#connection';

import {
  createAutoConnector,
  testClientCapabilities,
  testClientInfo,
  testInitializeResult,
} from './fixtures';

import type { SessionStore } from '@coremcp/core';
import type { McpLogLevel, McpServerNotification } from '@coremcp/protocol';

import type { ConnectionManagerParams, CreateConnector } from '#connection';
import type { McpConnector, McpConnectorParams } from '#connector';

// TYPES //

/** captured parameters from connector factory invocation */
interface CapturedParams {
  clientInfo?: McpConnectorParams['clientInfo'];
  capabilities?: McpConnectorParams['capabilities'];
  sessionStore?: McpConnectorParams['sessionStore'];
  log?: McpConnectorParams['log'];
  onRequest?: McpConnectorParams['onRequest'];
  onNotification?: McpConnectorParams['onNotification'];
}

// HELPERS //

/**
 * creates a connection manager with default test parameters
 * @param overrides optional parameter overrides
 * @returns connection manager and mock callbacks
 */
const createManager = (overrides?: Partial<ConnectionManagerParams>) => {
  const onRequest = vi.fn(async () => ({ result: {} }));
  const onNotification = vi.fn(async () => undefined);

  return {
    manager: new ConnectionManager({
      info: testClientInfo,
      capabilities: testClientCapabilities,
      onRequest,
      onNotification,
      ...overrides,
    }),
    onRequest,
    onNotification,
  };
};

/**
 * creates a factory that captures parameters passed to it
 * @param connector the connector to return from the factory
 * @returns factory function and captured parameters reference
 */
const createCapturingFactory = (
  connector: McpConnector,
): { factory: CreateConnector; captured: CapturedParams } => {
  const captured: CapturedParams = {};

  const factory: CreateConnector = (params) => {
    captured.clientInfo = params.clientInfo;
    captured.capabilities = params.capabilities;
    captured.sessionStore = params.sessionStore;
    captured.log = params.log;
    captured.onRequest = params.onRequest;
    captured.onNotification = params.onNotification;

    return connector;
  };

  return { factory, captured };
};

// TEST SUITES //

describe('ConnectionManager', () => {
  describe('constructor', () => {
    it('should create instance with required parameters', () => {
      const { manager } = createManager();

      expect(manager).toBeInstanceOf(ConnectionManager);
    });
  });

  describe('gt:connectors', () => {
    it('should expose internal connectors map', () => {
      const { manager } = createManager();

      const connectors = manager.connectors;

      expect(connectors).toBeInstanceOf(Map);
      expect(connectors.size).toBe(0);
    });
  });

  describe('mt:connect', () => {
    it('should connect to server via factory function and return InitializeResult', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();

      const result = await manager.connect(() => connector);

      expect(result).toEqual(testInitializeResult);
    });

    it('should store connector in internal map', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();

      await manager.connect(() => connector);

      expect(manager.connectors.size).toBe(1);
      expect(manager.connectors.get('test-connector')).toBe(connector);
    });

    it('should pass client info and capabilities to connector factory', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();
      const { factory, captured } = createCapturingFactory(connector);

      await manager.connect(factory);

      expect(captured.clientInfo).toEqual(testClientInfo);
      expect(captured.capabilities).toEqual(testClientCapabilities);
    });

    it('should pass sessionStore and log to connector factory', async () => {
      const sessionStore = {
        capabilities: { push: false },
        get: vi.fn(),
        set: vi.fn(),
        drop: vi.fn(),
        pullEvents: vi.fn(),
        pushEvents: vi.fn(),
        subscribe: vi.fn(),
      } satisfies Partial<SessionStore> as SessionStore;
      const log = vi.fn();
      const { manager } = createManager({ sessionStore, log });
      const connector = createAutoConnector();
      const { factory, captured } = createCapturingFactory(connector);

      await manager.connect(factory);

      expect(captured.sessionStore).toBe(sessionStore);
      expect(captured.log).toBe(log);
    });

    it('should pass onRequest handler to connector factory', async () => {
      const { manager, onRequest } = createManager();
      const connector = createAutoConnector();
      const { factory, captured } = createCapturingFactory(connector);

      await manager.connect(factory);

      expect(captured.onRequest).toBe(onRequest);
    });

    it('should pass onNotification handler with connector reference', async () => {
      const { manager, onNotification } = createManager();
      const connector = createAutoConnector();
      const { factory, captured } = createCapturingFactory(connector);

      await manager.connect(factory);

      // the factory receives a wrapped handler that binds the connector
      expect(captured.onNotification).toBeDefined();
      expect(captured.onNotification).not.toBe(onNotification);

      // verify the wrapper calls the original with connector reference
      const notification = {
        method: 'notifications/message',
        params: { level: 'info' as McpLogLevel, data: 'test' },
      } satisfies McpServerNotification;

      await captured.onNotification!(notification);

      expect(onNotification).toHaveBeenCalledWith(connector, notification);
    });

    it('should throw if server is already connected', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();

      await manager.connect(() => connector);

      await expect(manager.connect(() => connector)).rejects.toThrow(
        'Cannot connect to test-connector: server is already connected',
      );
    });
  });

  describe('mt:disconnect', () => {
    it('should disconnect from server by name', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();
      await manager.connect(() => connector);
      const disconnectSpy = vi.spyOn(connector, 'disconnect');

      await manager.disconnect('test-connector');

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    it('should remove connector from internal map', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();
      await manager.connect(() => connector);

      await manager.disconnect('test-connector');

      expect(manager.connectors.size).toBe(0);
      expect(manager.connectors.get('test-connector')).toBeUndefined();
    });

    it('should throw if server not found', async () => {
      const { manager } = createManager();

      await expect(manager.disconnect('nonexistent')).rejects.toThrow(
        'Cannot disconnect from nonexistent: server not found',
      );
    });
  });

  describe('mt:disconnectAll', () => {
    it('should disconnect from all servers', async () => {
      const { manager } = createManager();
      const connector1 = createAutoConnector({ name: 'server-1' });
      const connector2 = createAutoConnector({ name: 'server-2' });
      await manager.connect(() => connector1);
      await manager.connect(() => connector2);
      const disconnect1Spy = vi.spyOn(connector1, 'disconnect');
      const disconnect2Spy = vi.spyOn(connector2, 'disconnect');

      await manager.disconnectAll();

      expect(disconnect1Spy).toHaveBeenCalledTimes(1);
      expect(disconnect2Spy).toHaveBeenCalledTimes(1);
    });

    it('should clear internal map', async () => {
      const { manager } = createManager();
      const connector1 = createAutoConnector({ name: 'server-1' });
      const connector2 = createAutoConnector({ name: 'server-2' });
      await manager.connect(() => connector1);
      await manager.connect(() => connector2);

      await manager.disconnectAll();

      expect(manager.connectors.size).toBe(0);
    });

    it('should handle empty map', async () => {
      const { manager } = createManager();

      await expect(manager.disconnectAll()).resolves.toBeUndefined();

      expect(manager.connectors.size).toBe(0);
    });
  });

  describe('mt:getServer', () => {
    it('should return connector by name', async () => {
      const { manager } = createManager();
      const connector = createAutoConnector();
      await manager.connect(() => connector);

      const result = manager.getServer('test-connector');

      expect(result).toBe(connector);
    });

    it('should return undefined for unknown name', () => {
      const { manager } = createManager();

      const result = manager.getServer('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('mt:listServers', () => {
    it('should return all connectors as Record', async () => {
      const { manager } = createManager();
      const connector1 = createAutoConnector({ name: 'server-1' });
      const connector2 = createAutoConnector({ name: 'server-2' });
      await manager.connect(() => connector1);
      await manager.connect(() => connector2);

      const result = manager.listServers();

      expect(result).toEqual({
        'server-1': connector1,
        'server-2': connector2,
      });
    });

    it('should return empty record when no connectors', () => {
      const { manager } = createManager();

      const result = manager.listServers();

      expect(result).toEqual({});
    });
  });

  describe('mt:setLogLevel', () => {
    it('should call setLogLevel on all servers', async () => {
      const { manager } = createManager();
      const connector1 = createAutoConnector({ name: 'server-1' });
      const connector2 = createAutoConnector({ name: 'server-2' });
      await manager.connect(() => connector1);
      await manager.connect(() => connector2);
      const setLogLevel1Spy = vi
        .spyOn(connector1, 'setLogLevel')
        .mockResolvedValue(undefined);
      const setLogLevel2Spy = vi
        .spyOn(connector2, 'setLogLevel')
        .mockResolvedValue(undefined);

      await manager.setLogLevel('debug');

      expect(setLogLevel1Spy).toHaveBeenCalledWith('debug');
      expect(setLogLevel2Spy).toHaveBeenCalledWith('debug');
    });

    it('should handle empty map', async () => {
      const { manager } = createManager();

      await expect(manager.setLogLevel('info')).resolves.toBeUndefined();
    });
  });
});
