/**
 * @file tests for McpClient multi-server orchestration
 * @module spec/client
 * @description
 * this test suite validates the McpClient's ability to orchestrate multiple
 * MCP server connections and coordinate cross-server operations. It covers:
 * - Client initialization and configuration
 * - Multi-server connection management
 * - Root directory management with server notifications
 * - Server request handling (sampling, elicitation)
 * - Notification hooks for list changes, resource updates, progress, etc.
 * - Cache auto-update on server notifications
 * - Delegation to manager classes (prompt, resource, tool)
 *
 * The McpClient provides a unified interface for working with multiple servers,
 * handling connection lifecycle, notification routing, and operation delegation.
 * @see {@link ../src/client.ts} - McpClient implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpClient } from '#client';

import {
  testClientInfo,
  testInitializeResult,
  testServerName,
} from './fixtures/test-data';

import type { SessionStore } from '@coremcp/core';

import type {
  McpLogLevel,
  McpServerNotification,
  Root,
} from '@coremcp/protocol';

import type { McpConnector } from '#connector';

vi.mock('#server');

describe('McpClient', () => {
  let client: McpClient;
  let mockServer: McpConnector;

  /**
   * creates mock connector for testing client operations
   * @param _params connector configuration parameters (unused in mock)
   * @returns mock connector instance for testing
   */
  const testCreateConnector = (_params: unknown): McpConnector => {
    return mockServer;
  };

  /**
   * creates a connector factory that captures the onNotification callback
   * @param captureCallback callback to receive the captured onNotification function
   * @param server optional custom mock server to return
   * @returns connector factory function
   */
  const createConnectorWithNotificationCapture = (
    captureCallback: (
      onNotification: (notification: McpServerNotification) => Promise<void>,
    ) => void,
    server?: McpConnector,
  ) => {
    return (params: {
      onNotification?: (notification: McpServerNotification) => Promise<void>;
    }): McpConnector => {
      if (params.onNotification) {
        captureCallback(params.onNotification);
      }

      return server ?? mockServer;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      connect: vi.fn().mockResolvedValue(testInitializeResult),
      disconnect: vi.fn().mockResolvedValue(undefined),
      listPrompts: vi.fn().mockResolvedValue([]),
      listResources: vi.fn().mockResolvedValue([]),
      listTools: vi.fn().mockResolvedValue([]),
      sendNotification: vi.fn().mockResolvedValue(undefined),
      setLogLevel: vi.fn().mockResolvedValue(undefined),
      [Symbol.dispose]: vi.fn(),
      info: {
        name: testServerName,
        serverInfo: null,
        capabilities: null,
        protocolVersion: null,
        isConnected: true,
        log: undefined,
      },
    } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

    client = new McpClient({
      name: testClientInfo.name,
      version: testClientInfo.version,
    });
  });

  describe('constructor', () => {
    it('should create client with basic configuration', () => {
      expect(client).toBeInstanceOf(McpClient);
      expect(client.roots).toEqual([]);
    });

    it('should create client with initial roots', () => {
      const roots: Root[] = [{ uri: 'file:///test', name: 'test' }];

      const clientWithRoots = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        roots,
      });

      expect(clientWithRoots.roots).toEqual(roots);
    });

    it('should configure capabilities based on callbacks', () => {
      const onElicitation = vi.fn();
      const onSampling = vi.fn();

      const clientWithCallbacks = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onElicitation,
        onSampling,
      });

      expect(clientWithCallbacks).toBeInstanceOf(McpClient);
    });

    it('should create client with session store', () => {
      const sessionStore = {
        capabilities: { push: false },
        get: vi.fn(),
        set: vi.fn(),
        drop: vi.fn(),
        pullEvents: vi.fn(),
        pushEvents: vi.fn(),
        subscribe: vi.fn(),
      } satisfies Partial<SessionStore> as Partial<SessionStore> as SessionStore;

      const clientWithStore = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        sessionStore,
      });

      expect(clientWithStore).toBeInstanceOf(McpClient);
    });

    it('should create client with cache configuration object', () => {
      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        cache: { ttl: 60000 },
      });

      expect(clientWithCache).toBeInstanceOf(McpClient);
    });
  });

  describe('connect', () => {
    it('should connect to a server successfully', async () => {
      const result = await client.connect(testCreateConnector);

      expect(mockServer.connect).toHaveBeenCalled();
      expect(result).toEqual(testInitializeResult);
    });

    it('should throw error if server already connected', async () => {
      await client.connect(testCreateConnector);

      await expect(client.connect(testCreateConnector)).rejects.toThrow(
        'Cannot connect to test-server: server is already connected',
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect from a server successfully', async () => {
      await client.connect(testCreateConnector);

      await client.disconnect('test-server');

      expect(mockServer.disconnect).toHaveBeenCalled();
    });

    it('should throw error if server not found', async () => {
      await expect(client.disconnect('nonexistent')).rejects.toThrow(
        'Cannot disconnect from nonexistent: server not found',
      );
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect from all servers successfully', async () => {
      await client.connect(testCreateConnector);

      await client.disconnectAll();

      expect(mockServer.disconnect).toHaveBeenCalled();
    });
  });

  describe('getServer', () => {
    it('should return server instance when server exists', async () => {
      await client.connect(testCreateConnector);

      const server = client.getServer('test-server');

      expect(server).toBe(mockServer);
    });

    it('should return undefined for nonexistent server', () => {
      const server = client.getServer('nonexistent');

      expect(server).toBeUndefined();
    });
  });

  describe('listServers', () => {
    it('should return map of all connected servers', async () => {
      await client.connect(testCreateConnector);

      const servers = client.listServers();

      expect(servers).toEqual({
        'test-server': mockServer,
      });
    });
  });

  describe('root management', () => {
    it('should add root successfully and notify servers', async () => {
      await client.connect(testCreateConnector);
      const root: Root = { uri: 'file:///new', name: 'new' };

      const added = await client.addRoot(root);

      expect(added).toBe(true);
      expect(client.roots).toContain(root);
      expect(mockServer.sendNotification).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
    });

    it('should return false when adding duplicate root', async () => {
      const root: Root = { uri: 'file:///test', name: 'test' };

      await client.addRoot(root);

      const added = await client.addRoot(root);

      expect(added).toBe(false);
    });

    it('should remove root successfully and notify servers', async () => {
      await client.connect(testCreateConnector);
      const root: Root = { uri: 'file:///test', name: 'test' };

      await client.addRoot(root);

      const removed = await client.removeRoot('file:///test');

      expect(removed).toBe(true);
      expect(client.roots).not.toContain(root);
      expect(mockServer.sendNotification).toHaveBeenCalledWith(
        'notifications/roots/list_changed',
      );
    });

    it('should return false when removing nonexistent root', async () => {
      const removed = await client.removeRoot('file:///nonexistent');

      expect(removed).toBe(false);
    });
  });

  describe('setLogLevel', () => {
    it('should set log level for all connected servers', async () => {
      await client.connect(testCreateConnector);
      const level: McpLogLevel = 'debug';

      await client.setLogLevel(level);

      expect(mockServer.setLogLevel).toHaveBeenCalledWith(level);
    });
  });

  describe('server request handlers', () => {
    it('should handle sampling request when callback configured', async () => {
      const onSampling = vi.fn().mockResolvedValue({
        role: 'assistant',
        content: { type: 'text', text: 'response' },
        model: 'test-model',
      });
      const clientWithSampling = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onSampling,
      });

      const result = await clientWithSampling.handleSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'hello' } }],
        maxTokens: 100,
      });

      expect(onSampling).toHaveBeenCalled();
      expect(result).toEqual({
        role: 'assistant',
        content: { type: 'text', text: 'response' },
        model: 'test-model',
      });
    });

    it('should throw error if sampling callback not configured', async () => {
      await expect(
        client.handleSamplingRequest({
          messages: [],
          maxTokens: 100,
        }),
      ).rejects.toThrow('Sampling callback not configured');
    });

    it('should handle elicitation request when callback configured', async () => {
      const onElicitation = vi.fn().mockResolvedValue({
        action: 'accept',
        content: { field: 'value' },
      });
      const clientWithElicitation = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onElicitation,
      });

      const result = await clientWithElicitation.handleElicitationRequest({
        message: 'Please provide input',
        requestedSchema: {
          type: 'object',
          properties: { field: { type: 'string' } },
        },
      });

      expect(onElicitation).toHaveBeenCalled();
      expect(result).toEqual({
        action: 'accept',
        content: { field: 'value' },
      });
    });

    it('should throw error if elicitation callback not configured', async () => {
      await expect(
        client.handleElicitationRequest({
          message: 'test',
          requestedSchema: {
            type: 'object',
            properties: {},
          },
        }),
      ).rejects.toThrow('Elicitation callback not configured');
    });
  });

  describe('notification hooks', () => {
    it('should invoke onListChange callback for tools list changed notification', async () => {
      const onListChange = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onListChange,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/tools/list_changed',
        params: {},
      });

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockServer,
        changeType: 'tools',
      });
    });

    it('should invoke onListChange callback for resources list changed notification', async () => {
      const onListChange = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onListChange,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/resources/list_changed',
        params: {},
      });

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockServer,
        changeType: 'resources',
      });
    });

    it('should invoke onListChange callback for prompts list changed notification', async () => {
      const onListChange = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onListChange,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/prompts/list_changed',
        params: {},
      });

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockServer,
        changeType: 'prompts',
      });
    });

    it('should invoke onResourceChange callback for resource updated notification', async () => {
      const onResourceChange = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onResourceChange,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/resources/updated',
        params: { uri: 'file:///test.txt' },
      });

      expect(onResourceChange).toHaveBeenCalledWith({
        connector: mockServer,
        uri: 'file:///test.txt',
      });
    });

    it('should invoke onProgress callback for progress notification', async () => {
      const onProgress = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onProgress,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/progress',
        params: {
          progressToken: 'token-123',
          progress: 50,
          total: 100,
          message: 'Processing...',
        },
      });

      expect(onProgress).toHaveBeenCalledWith({
        connector: mockServer,
        progressToken: 'token-123',
        progress: 50,
        total: 100,
        message: 'Processing...',
      });
    });

    it('should invoke onCancelled callback for cancelled notification', async () => {
      const onCancelled = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onCancelled,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/cancelled',
        params: {
          requestId: 123,
          reason: 'User cancelled',
        },
      });

      expect(onCancelled).toHaveBeenCalledWith({
        connector: mockServer,
        requestId: 123,
        reason: 'User cancelled',
      });
    });

    it('should invoke onLogMessage callback for log message notification', async () => {
      const onLogMessage = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onLogMessage,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/message',
        params: {
          level: 'info',
          data: 'Test log message',
          logger: 'test-logger',
        },
      });

      expect(onLogMessage).toHaveBeenCalledWith({
        connector: mockServer,
        level: 'info',
        data: 'Test log message',
        logger: 'test-logger',
      });
    });

    it('should not throw error when notification hooks are not configured', async () => {
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      await client.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await expect(
        capturedOnNotification!({
          method: 'notifications/tools/list_changed',
          params: {},
        }),
      ).resolves.not.toThrow();

      await expect(
        capturedOnNotification!({
          method: 'notifications/resources/updated',
          params: { uri: 'file:///test.txt' },
        }),
      ).resolves.not.toThrow();

      await expect(
        capturedOnNotification!({
          method: 'notifications/progress',
          params: {
            progressToken: 'token',
            progress: 0,
          },
        }),
      ).resolves.not.toThrow();
    });

    it('should log to client logger when onLogMessage hook is provided', async () => {
      const onLogMessage = vi.fn();
      const log = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const clientWithHook = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onLogMessage,
        log,
      });

      await clientWithHook.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }),
      );

      await capturedOnNotification!({
        method: 'notifications/message',
        params: {
          level: 'error',
          data: 'Error message',
          logger: 'test-logger',
        },
      });

      expect(onLogMessage).toHaveBeenCalledWith({
        connector: mockServer,
        level: 'error',
        data: 'Error message',
        logger: 'test-logger',
      });
      expect(log).toHaveBeenCalledWith('debug', 'Error message', {
        logger: 'test-logger',
      });
    });
  });

  describe('prompt methods', () => {
    it('should list prompts from all connected servers', async () => {
      mockServer.listPrompts = vi
        .fn()
        .mockResolvedValue([
          { name: 'test-prompt', description: 'A test prompt' },
        ]);
      await client.connect(testCreateConnector);

      const prompts = await client.listPrompts();

      expect(prompts).toEqual([
        {
          name: 'test-prompt',
          description: 'A test prompt',
          serverName: testServerName,
        },
      ]);
    });

    it('should complete prompt argument from specific server', async () => {
      mockServer.complete = vi.fn().mockResolvedValue({
        completion: { values: ['suggestion1', 'suggestion2'] },
      });
      await client.connect(testCreateConnector);

      const result = await client.completePrompt(
        testServerName,
        'test-prompt',
        { name: 'arg1', value: 'partial' },
      );

      expect(result).toEqual({
        completion: { values: ['suggestion1', 'suggestion2'] },
      });
    });

    it('should find prompt by name across servers', async () => {
      mockServer.listPrompts = vi
        .fn()
        .mockResolvedValue([{ name: 'target-prompt', description: 'Target' }]);
      await client.connect(testCreateConnector);

      const prompt = await client.findPrompt('target-prompt');

      expect(prompt).toEqual({
        name: 'target-prompt',
        description: 'Target',
        serverName: testServerName,
      });
    });
  });

  describe('resource methods', () => {
    it('should read resource from specific server', async () => {
      mockServer.readResource = vi.fn().mockResolvedValue({
        contents: [{ uri: 'file:///test.txt', text: 'content' }],
      });
      await client.connect(testCreateConnector);

      const result = await client.readResource(
        testServerName,
        'file:///test.txt',
      );

      expect(result).toEqual({
        contents: [{ uri: 'file:///test.txt', text: 'content' }],
      });
    });

    it('should list resources from all servers', async () => {
      mockServer.listResources = vi
        .fn()
        .mockResolvedValue([{ uri: 'file:///test.txt', name: 'test.txt' }]);
      await client.connect(testCreateConnector);

      const resources = await client.listResources();

      expect(resources).toEqual([
        {
          uri: 'file:///test.txt',
          name: 'test.txt',
          serverName: testServerName,
        },
      ]);
    });

    it('should list resources from specific server', async () => {
      mockServer.listResources = vi
        .fn()
        .mockResolvedValue([{ uri: 'file:///test.txt', name: 'test.txt' }]);
      await client.connect(testCreateConnector);

      const resources = await client.listResourcesFromServer(testServerName);

      expect(resources).toEqual([
        { uri: 'file:///test.txt', name: 'test.txt' },
      ]);
    });

    it('should list resource templates from all servers', async () => {
      mockServer.listResourceTemplates = vi
        .fn()
        .mockResolvedValue([
          { uriTemplate: 'file:///{path}', name: 'file-template' },
        ]);
      await client.connect(testCreateConnector);

      const templates = await client.listResourceTemplates();

      expect(templates).toEqual([
        {
          uriTemplate: 'file:///{path}',
          name: 'file-template',
          serverName: testServerName,
        },
      ]);
    });

    it('should list resource templates from specific server', async () => {
      mockServer.listResourceTemplates = vi
        .fn()
        .mockResolvedValue([
          { uriTemplate: 'file:///{path}', name: 'file-template' },
        ]);
      await client.connect(testCreateConnector);

      const templates =
        await client.listResourceTemplatesFromServer(testServerName);

      expect(templates).toEqual([
        { uriTemplate: 'file:///{path}', name: 'file-template' },
      ]);
    });

    it('should complete resource template argument', async () => {
      mockServer.complete = vi.fn().mockResolvedValue({
        completion: { values: ['path1', 'path2'] },
      });
      await client.connect(testCreateConnector);

      const result = await client.completeResourceTemplate(
        testServerName,
        'file:///{path}',
        { name: 'path', value: 'partial' },
      );

      expect(result).toEqual({
        completion: { values: ['path1', 'path2'] },
      });
    });

    it('should find resource by uri across servers', async () => {
      mockServer.listResources = vi
        .fn()
        .mockResolvedValue([{ uri: 'file:///target.txt', name: 'target.txt' }]);
      await client.connect(testCreateConnector);

      const resource = await client.findResource('file:///target.txt');

      expect(resource).toEqual({
        uri: 'file:///target.txt',
        name: 'target.txt',
        serverName: testServerName,
      });
    });

    it('should subscribe to resource updates', async () => {
      mockServer.subscribeToResource = vi.fn().mockResolvedValue(undefined);
      await client.connect(testCreateConnector);

      await client.subscribeToResource(testServerName, 'file:///test.txt');

      expect(mockServer.subscribeToResource).toHaveBeenCalledWith(
        'file:///test.txt',
      );
    });

    it('should unsubscribe from resource updates', async () => {
      mockServer.unsubscribeFromResource = vi.fn().mockResolvedValue(undefined);
      await client.connect(testCreateConnector);

      await client.unsubscribeFromResource(testServerName, 'file:///test.txt');

      expect(mockServer.unsubscribeFromResource).toHaveBeenCalledWith(
        'file:///test.txt',
      );
    });
  });

  describe('tool methods', () => {
    it('should call tool on specific server', async () => {
      mockServer.callTool = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'result' }],
      });
      await client.connect(testCreateConnector);

      const result = await client.callTool(testServerName, 'test-tool', {
        arg1: 'value1',
      });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'result' }],
      });
    });

    it('should list tools from all servers', async () => {
      mockServer.listTools = vi
        .fn()
        .mockResolvedValue([{ name: 'test-tool', description: 'A tool' }]);
      await client.connect(testCreateConnector);

      const tools = await client.listTools();

      expect(tools).toEqual([
        {
          name: 'test-tool',
          description: 'A tool',
          serverName: testServerName,
        },
      ]);
    });

    it('should list tools from specific server', async () => {
      mockServer.listTools = vi
        .fn()
        .mockResolvedValue([{ name: 'test-tool', description: 'A tool' }]);
      await client.connect(testCreateConnector);

      const tools = await client.listToolsFromServer(testServerName);

      expect(tools).toEqual([{ name: 'test-tool', description: 'A tool' }]);
    });

    it('should get specific tool from server', async () => {
      mockServer.listTools = vi
        .fn()
        .mockResolvedValue([{ name: 'target-tool', description: 'Target' }]);
      await client.connect(testCreateConnector);

      const tool = await client.getTool(testServerName, 'target-tool');

      expect(tool).toEqual({
        name: 'target-tool',
        description: 'Target',
      });
    });
  });

  describe('server request handling', () => {
    it('should handle server-to-client requests through onRequest callback', async () => {
      let capturedOnRequest: ((request: any) => Promise<any>) | undefined;

      const testCreateConnectorWithCapture = (params: any): McpConnector => {
        capturedOnRequest = params.onRequest;

        return mockServer;
      };

      const onSampling = vi.fn().mockResolvedValue({
        role: 'assistant',
        content: { type: 'text', text: 'response' },
        model: 'test-model',
      });

      const clientWithSampling = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        onSampling,
      });

      await clientWithSampling.connect(testCreateConnectorWithCapture);

      const response = await capturedOnRequest!({
        jsonrpc: '2.0',
        id: 1,
        method: 'sampling/createMessage',
        params: {
          messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
          maxTokens: 100,
        },
      });

      expect(response).toHaveProperty('result');
      expect(onSampling).toHaveBeenCalled();
    });
  });

  describe('servers getter', () => {
    it('should return all connected servers via getter', async () => {
      await client.connect(testCreateConnector);

      const servers = client.servers;

      expect(servers).toEqual({
        'test-server': mockServer,
      });
    });
  });

  describe('cache auto-update on list change notifications', () => {
    it('should refresh tools cache when tools list changed notification arrives', async () => {
      const mockTools = [{ name: 'test-tool', description: 'A tool' }];
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const testMockServer = {
        ...mockServer,
        listTools: vi.fn().mockResolvedValue(mockTools),
        info: {
          name: testServerName,
          serverInfo: null,
          capabilities: {
            tools: { listChanged: true },
          },
          protocolVersion: null,
          isConnected: true,
          log: undefined,
        },
      } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
      });

      await clientWithCache.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }, testMockServer),
      );

      await capturedOnNotification!({
        method: 'notifications/tools/list_changed',
        params: {},
      });

      expect(testMockServer.listTools).toHaveBeenCalled();
    });

    it('should refresh prompts cache when prompts list changed notification arrives', async () => {
      const mockPrompts = [{ name: 'test-prompt', description: 'A prompt' }];
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const testMockServer = {
        ...mockServer,
        listPrompts: vi.fn().mockResolvedValue(mockPrompts),
        info: {
          name: testServerName,
          serverInfo: null,
          capabilities: {
            prompts: { listChanged: true },
          },
          protocolVersion: null,
          isConnected: true,
          log: undefined,
        },
      } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
      });

      await clientWithCache.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }, testMockServer),
      );

      await capturedOnNotification!({
        method: 'notifications/prompts/list_changed',
        params: {},
      });

      expect(testMockServer.listPrompts).toHaveBeenCalled();
    });

    it('should refresh resources and templates cache when resources list changed notification arrives', async () => {
      const mockResources = [{ uri: 'file:///test.txt', name: 'test.txt' }];
      const mockTemplates = [
        { uriTemplate: 'file:///{path}', name: 'template' },
      ];
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const testMockServer = {
        ...mockServer,
        listResources: vi.fn().mockResolvedValue(mockResources),
        listResourceTemplates: vi.fn().mockResolvedValue(mockTemplates),
        info: {
          name: testServerName,
          serverInfo: null,
          capabilities: {
            resources: { listChanged: true, subscribe: true },
          },
          protocolVersion: null,
          isConnected: true,
          log: undefined,
        },
      } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
      });

      await clientWithCache.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }, testMockServer),
      );

      await capturedOnNotification!({
        method: 'notifications/resources/list_changed',
        params: {},
      });

      expect(testMockServer.listResources).toHaveBeenCalled();
      expect(testMockServer.listResourceTemplates).toHaveBeenCalled();
    });

    it('should not refresh cache when server not found in active connectors', async () => {
      const mockTools = [{ name: 'test-tool', description: 'A tool' }];
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const testMockServer = {
        ...mockServer,
        listTools: vi.fn().mockResolvedValue(mockTools),
        info: {
          name: testServerName,
          serverInfo: null,
          capabilities: {
            tools: { listChanged: true },
          },
          protocolVersion: null,
          isConnected: true,
          log: undefined,
        },
      } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
      });

      await clientWithCache.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }, testMockServer),
      );

      await clientWithCache.disconnect(testServerName);

      await capturedOnNotification!({
        method: 'notifications/tools/list_changed',
        params: {},
      });

      expect(testMockServer.listTools).toHaveBeenCalledTimes(0);
    });

    it('should handle error during cache refresh gracefully', async () => {
      const log = vi.fn();
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const testMockServer = {
        ...mockServer,
        listTools: vi.fn().mockRejectedValue(new Error('Server error')),
        info: {
          name: testServerName,
          serverInfo: null,
          capabilities: {
            tools: { listChanged: true },
          },
          protocolVersion: null,
          isConnected: true,
          log: undefined,
        },
      } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
        log,
      });

      await clientWithCache.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }, testMockServer),
      );

      await capturedOnNotification!({
        method: 'notifications/tools/list_changed',
        params: {},
      });

      expect(testMockServer.listTools).toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'error',
        'Failed to refresh list cache',
        expect.objectContaining({
          serverName: testServerName,
          listType: 'tools',
          error: expect.any(Error),
        }),
      );
    });

    it('should not refresh cache when server does not support listChanged capability', async () => {
      const mockTools = [{ name: 'test-tool', description: 'A tool' }];
      let capturedOnNotification:
        | ((notification: any) => Promise<void>)
        | undefined;

      const testMockServer = {
        ...mockServer,
        listTools: vi.fn().mockResolvedValue(mockTools),
        info: {
          name: testServerName,
          serverInfo: null,
          capabilities: {
            tools: { listChanged: false }, // server doesn't support list changed
          },
          protocolVersion: null,
          isConnected: true,
          log: undefined,
        },
      } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

      const clientWithCache = new McpClient({
        name: testClientInfo.name,
        version: testClientInfo.version,
      });

      await clientWithCache.connect(
        createConnectorWithNotificationCapture((fn) => {
          capturedOnNotification = fn;
        }, testMockServer),
      );

      await capturedOnNotification!({
        method: 'notifications/tools/list_changed',
        params: {},
      });

      expect(testMockServer.listTools).not.toHaveBeenCalled();
    });
  });
});
