/**
 * @file tests for McpConnector abstract class
 * @module spec/connector
 * @description
 * tests public and protected methods via TestConnector subclass.
 * covers connection lifecycle, request/notification handling,
 * and MCP protocol methods.
 */

import { JSONRPC_VERSION, JsonRpcError } from '@coremcp/protocol';
import { describe, it, expect, vi } from 'vitest';

import {
  connectConnector,
  createAutoConnector,
  createConnector,
  createMethodResponder,
} from './fixtures/connector';
import {
  testClientCapabilities,
  testClientInfo,
  testInitializeResult,
} from './fixtures/test-data';

import type { JsonRpcMessage } from '@coremcp/protocol';

// TEST SUITES //

describe('cl:McpConnector', () => {
  describe('constructor', () => {
    it('should create connector with required parameters and initial state', () => {
      const log = vi.fn();
      const connector = createConnector({ log });

      expect(connector.info).toEqual({
        name: 'test-connector',
        serverInfo: null,
        capabilities: null,
        protocolVersion: null,
        isConnected: false,
        log,
      });
    });

    it('should set client info and capabilities in initialize request', () => {
      const connector = createConnector();

      expect(connector.getInitializeRequest()).toEqual({
        jsonrpc: JSONRPC_VERSION,
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: expect.any(String),
          clientInfo: testClientInfo,
          capabilities: testClientCapabilities,
        },
      });
    });
  });

  describe('gt:status', () => {
    it('should return complete status object with process info', () => {
      const connector = createConnector();

      expect(connector.status).toEqual({
        status: 'disconnected',
        transport: 'TestConnector',
        processInfo: {
          pid: expect.any(Number),
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
          uptime: expect.any(Number),
        },
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });
  });

  describe('mt:connect', () => {
    it('should complete connection lifecycle and return result', async () => {
      const onTransportConnect = vi.fn().mockResolvedValue(undefined);
      const onConnect = vi.fn();
      const connector = createAutoConnector({ onTransportConnect, onConnect });

      const result = await connectConnector(connector);

      expect(onTransportConnect).toHaveBeenCalledOnce();
      expect(onConnect).toHaveBeenCalledOnce();
      expect(result).toEqual(testInitializeResult);
      expect(connector.info).toEqual(
        expect.objectContaining({
          isConnected: true,
          serverInfo: testInitializeResult.serverInfo,
          capabilities: testInitializeResult.capabilities,
          protocolVersion: testInitializeResult.protocolVersion,
        }),
      );
    });

    it('should send initialize request followed by initialized notification', async () => {
      const connector = createAutoConnector();

      await connectConnector(connector);

      // wait for notification to be sent
      await vi.waitFor(() => {
        expect(connector.sentMessages).toHaveLength(2);
      });

      expect(connector.sentMessages).toEqual([
        expect.objectContaining({
          jsonrpc: JSONRPC_VERSION,
          method: 'initialize',
          params: expect.objectContaining({
            clientInfo: testClientInfo,
            capabilities: testClientCapabilities,
          }),
        }),
        expect.objectContaining({
          jsonrpc: JSONRPC_VERSION,
          method: 'notifications/initialized',
        }),
      ]);
    });

    it('should return same promise for concurrent connect calls', async () => {
      const log = vi.fn();
      const connector = createAutoConnector({ log });

      const [result1, result2] = await Promise.all([
        connector.connect(),
        connector.connect(),
      ]);

      expect(result1).toEqual(result2);
      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('Another active connection'),
      );

      const initRequests = connector.sentMessages.filter(
        (m) => 'method' in m && m.method === 'initialize',
      );
      expect(initRequests).toHaveLength(1);
    });

    it('should allow reconnection after disconnect', async () => {
      const connector = createAutoConnector();
      await connectConnector(connector);
      await connector.disconnect();

      await connectConnector(connector);

      expect(connector.info.isConnected).toBe(true);
    });

    it('should throw and reset status on transport failure', async () => {
      const log = vi.fn();
      const connector = createConnector({
        log,
        onTransportConnect: async () => {
          throw new Error('Transport failed');
        },
      });

      await expect(connector.connect()).rejects.toThrow('Transport failed');

      expect(connector.status.status).toBe('disconnected');
      expect(log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to connect'),
        expect.any(Object),
      );
    });

    it('should convert non-Error connection failure to Error for logging', async () => {
      const log = vi.fn();
      const connector = createConnector({
        log,
        onTransportConnect: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throw handling
          throw 'connection string error';
        },
      });

      await expect(connector.connect()).rejects.toBe('connection string error');

      expect(connector.status.status).toBe('disconnected');
      expect(log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to connect'),
        expect.objectContaining({
          message: 'connection string error',
        }),
      );
    });
  });

  describe('mt:disconnect', () => {
    it('should clear connection state and call transport disconnect', async () => {
      const onTransportDisconnect = vi.fn().mockResolvedValue(undefined);
      const connector = createAutoConnector({ onTransportDisconnect });
      await connectConnector(connector);

      await connector.disconnect();

      expect(onTransportDisconnect).toHaveBeenCalledOnce();
      expect(connector.info).toEqual(
        expect.objectContaining({
          isConnected: false,
          serverInfo: null,
          capabilities: null,
          protocolVersion: null,
        }),
      );
      expect(connector.status.status).toBe('disconnected');
    });

    it('should be no-op when already disconnected', async () => {
      const log = vi.fn();
      const onTransportDisconnect = vi.fn().mockResolvedValue(undefined);
      const connector = createConnector({ log, onTransportDisconnect });

      await connector.disconnect();

      expect(log).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('not connected'),
      );
      expect(onTransportDisconnect).not.toHaveBeenCalled();
    });

    it('should reject in-progress connection', async () => {
      const connector = createConnector();
      const connectPromise = connector.connect();

      // disconnect while still connecting
      connector.setInternalStatus('connecting');
      await connector.disconnect();

      await expect(connectPromise).rejects.toThrow(
        'Disconnection initiated while connection was in progress',
      );
    });
  });

  describe('mt:sendRequest', () => {
    it('should send JSON-RPC request and return response result', async () => {
      const connector = createAutoConnector();
      await connectConnector(connector);
      connector.clearSentMessages();

      const requestPromise = connector.sendRequest({
        method: 'test/method',
        params: { key: 'value' },
      });

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        result: { data: 'response' },
      } as JsonRpcMessage);

      const result = await requestPromise;

      expect(result).toEqual({ data: 'response' });
      expect(connector.sentMessages[0]).toEqual(
        expect.objectContaining({
          jsonrpc: JSONRPC_VERSION,
          id: expect.any(Number),
          method: 'test/method',
          params: expect.objectContaining({ key: 'value' }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(
        connector.sendRequest({ method: 'test/method', params: {} }),
      ).rejects.toThrow('not connected');
    });

    it('should reject with JsonRpcError on error response', async () => {
      const connector = createAutoConnector();
      await connectConnector(connector);

      const requestPromise = connector.sendRequest({
        method: 'test/method',
        params: {},
      });

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        error: { code: -32600, message: 'Invalid Request' },
      } as JsonRpcMessage);

      await expect(requestPromise).rejects.toThrow(JsonRpcError);
    });

    it('should reject on send failure', async () => {
      const connector = createAutoConnector({
        onTransportSend: async (message) => {
          if ('method' in message && message.method === 'initialize') {
            await connector.receiveMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result: testInitializeResult,
            } as JsonRpcMessage);
          } else if (
            'method' in message &&
            message.method === 'notifications/initialized'
          ) {
            // allow initialized notification
          } else {
            throw new Error('Send failed');
          }
        },
      });
      await connectConnector(connector);

      await expect(
        connector.sendRequest({ method: 'test/method', params: {} }),
      ).rejects.toThrow('Send failed');
    });

    it('should convert non-Error send failure to Error', async () => {
      const connector = createAutoConnector({
        onTransportSend: async (message) => {
          if ('method' in message && message.method === 'initialize') {
            await connector.receiveMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result: testInitializeResult,
            } as JsonRpcMessage);
          } else if (
            'method' in message &&
            message.method === 'notifications/initialized'
          ) {
            // allow initialized notification
          } else {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throw handling
            throw 'string error';
          }
        },
      });
      await connectConnector(connector);

      await expect(
        connector.sendRequest({ method: 'test/method', params: {} }),
      ).rejects.toThrow('string error');
    });
  });

  describe('mt:sendNotification', () => {
    it('should send notification without id', async () => {
      const connector = createAutoConnector();
      await connectConnector(connector);
      connector.clearSentMessages();

      await connector.sendNotification('notifications/test', { key: 'value' });

      expect(connector.sentMessages[0]).toEqual({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/test',
        params: { key: 'value' },
      });
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(
        connector.sendNotification('notifications/test'),
      ).rejects.toThrow('not connected');
    });
  });

  describe('mt:listPrompts', () => {
    it('should send prompts/list request and return prompts', async () => {
      const prompts = [
        { name: 'prompt1', description: 'First prompt' },
        { name: 'prompt2', description: 'Second prompt' },
      ];
      const connector = createMethodResponder('prompts/list', { prompts });
      await connectConnector(connector);

      const result = await connector.listPrompts();

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({ method: 'prompts/list' }),
      );
      expect(result).toEqual(prompts);
    });

    it('should handle pagination automatically', async () => {
      let callCount = 0;
      const connector = createAutoConnector({
        onTransportSend: async (message) => {
          if ('method' in message && message.method === 'initialize') {
            await connector.receiveMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result: testInitializeResult,
            } as JsonRpcMessage);
          } else if ('method' in message && message.method === 'prompts/list') {
            callCount++;
            const result =
              callCount === 1
                ? { prompts: [{ name: 'prompt1' }], nextCursor: 'cursor1' }
                : { prompts: [{ name: 'prompt2' }] };
            await connector.receiveMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result,
            } as JsonRpcMessage);
          }
        },
      });
      await connectConnector(connector);

      const result = await connector.listPrompts();

      expect(result).toEqual([{ name: 'prompt1' }, { name: 'prompt2' }]);
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.listPrompts()).rejects.toThrow('not connected');
    });
  });

  describe('mt:getPrompt', () => {
    it('should send prompts/get request with name and arguments', async () => {
      const connector = createMethodResponder('prompts/get', { messages: [] });
      await connectConnector(connector);

      await connector.getPrompt('test-prompt', { arg1: 'value1' });

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'prompts/get',
          params: expect.objectContaining({
            name: 'test-prompt',
            arguments: { arg1: 'value1' },
          }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.getPrompt('test')).rejects.toThrow(
        'not connected',
      );
    });
  });

  describe('mt:listResources', () => {
    it('should send resources/list request and return resources', async () => {
      const resources = [
        { uri: 'file://test1.txt', name: 'Test 1' },
        { uri: 'file://test2.txt', name: 'Test 2' },
      ];
      const connector = createMethodResponder('resources/list', { resources });
      await connectConnector(connector);

      const result = await connector.listResources();

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({ method: 'resources/list' }),
      );
      expect(result).toEqual(resources);
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.listResources()).rejects.toThrow('not connected');
    });
  });

  describe('mt:listResourceTemplates', () => {
    it('should send resources/templates/list request and return templates', async () => {
      const templates = [
        { uriTemplate: 'file://{path}', name: 'File' },
        { uriTemplate: 'http://{host}', name: 'HTTP' },
      ];
      const connector = createMethodResponder('resources/templates/list', {
        resourceTemplates: templates,
      });
      await connectConnector(connector);

      const result = await connector.listResourceTemplates();

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({ method: 'resources/templates/list' }),
      );
      expect(result).toEqual(templates);
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.listResourceTemplates()).rejects.toThrow(
        'not connected',
      );
    });
  });

  describe('mt:readResource', () => {
    it('should send resources/read request with uri', async () => {
      const connector = createMethodResponder('resources/read', {
        contents: [],
      });
      await connectConnector(connector);

      await connector.readResource('file://test.txt');

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'resources/read',
          params: expect.objectContaining({ uri: 'file://test.txt' }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.readResource('file://test.txt')).rejects.toThrow(
        'not connected',
      );
    });
  });

  describe('mt:subscribeToResource', () => {
    it('should send resources/subscribe request with uri', async () => {
      const connector = createMethodResponder('resources/subscribe', {});
      await connectConnector(connector);

      await connector.subscribeToResource('file://test.txt');

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'resources/subscribe',
          params: expect.objectContaining({ uri: 'file://test.txt' }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(
        connector.subscribeToResource('file://test.txt'),
      ).rejects.toThrow('not connected');
    });
  });

  describe('mt:unsubscribeFromResource', () => {
    it('should send resources/unsubscribe request with uri', async () => {
      const connector = createMethodResponder('resources/unsubscribe', {});
      await connectConnector(connector);

      await connector.unsubscribeFromResource('file://test.txt');

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'resources/unsubscribe',
          params: expect.objectContaining({ uri: 'file://test.txt' }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(
        connector.unsubscribeFromResource('file://test.txt'),
      ).rejects.toThrow('not connected');
    });
  });

  describe('mt:listTools', () => {
    it('should send tools/list request and return tools', async () => {
      const tools = [
        { name: 'tool1', description: 'First tool', inputSchema: {} },
        { name: 'tool2', description: 'Second tool', inputSchema: {} },
      ];
      const connector = createMethodResponder('tools/list', { tools });
      await connectConnector(connector);

      const result = await connector.listTools();

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({ method: 'tools/list' }),
      );
      expect(result).toEqual(tools);
    });

    it('should handle pagination automatically', async () => {
      let callCount = 0;
      const connector = createAutoConnector({
        onTransportSend: async (message) => {
          if ('method' in message && message.method === 'initialize') {
            await connector.receiveMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result: testInitializeResult,
            } as JsonRpcMessage);
          } else if ('method' in message && message.method === 'tools/list') {
            callCount++;
            const result =
              callCount === 1
                ? { tools: [{ name: 'tool1' }], nextCursor: 'cursor1' }
                : { tools: [{ name: 'tool2' }] };
            await connector.receiveMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result,
            } as JsonRpcMessage);
          }
        },
      });
      await connectConnector(connector);

      const result = await connector.listTools();

      expect(result).toEqual([{ name: 'tool1' }, { name: 'tool2' }]);
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.listTools()).rejects.toThrow('not connected');
    });
  });

  describe('mt:callTool', () => {
    it('should send tools/call request with name and arguments', async () => {
      const connector = createMethodResponder('tools/call', { content: [] });
      await connectConnector(connector);

      await connector.callTool('test-tool', { arg1: 'value1' });

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'tools/call',
          params: expect.objectContaining({
            name: 'test-tool',
            arguments: { arg1: 'value1' },
          }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.callTool('test')).rejects.toThrow('not connected');
    });
  });

  describe('mt:complete', () => {
    it('should send completion/complete request with prompt reference', async () => {
      const connector = createMethodResponder('completion/complete', {
        completion: { values: [] },
      });
      await connectConnector(connector);

      await connector.complete(
        { type: 'ref/prompt', name: 'test-prompt' },
        { name: 'arg', value: 'val' },
      );

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'completion/complete',
          params: expect.objectContaining({
            ref: { type: 'ref/prompt', name: 'test-prompt' },
            argument: { name: 'arg', value: 'val' },
          }),
        }),
      );
    });

    it('should send completion/complete request with resource template reference', async () => {
      const connector = createMethodResponder('completion/complete', {
        completion: { values: [] },
      });
      await connectConnector(connector);

      await connector.complete(
        { type: 'ref/resource', uri: 'file://{path}' },
        { name: 'path', value: '/home' },
      );

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'completion/complete',
          params: expect.objectContaining({
            ref: { type: 'ref/resource', uri: 'file://{path}' },
          }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(
        connector.complete(
          { type: 'ref/prompt', name: 'test' },
          { name: 'arg', value: 'val' },
        ),
      ).rejects.toThrow('not connected');
    });
  });

  describe('mt:setLogLevel', () => {
    it('should send logging/setLevel request', async () => {
      const connector = createMethodResponder('logging/setLevel', {});
      await connectConnector(connector);

      await connector.setLogLevel('debug');

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({
          method: 'logging/setLevel',
          params: expect.objectContaining({ level: 'debug' }),
        }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.setLogLevel('debug')).rejects.toThrow(
        'not connected',
      );
    });
  });

  describe('mt:ping', () => {
    it('should send ping request', async () => {
      const connector = createMethodResponder('ping', {});
      await connectConnector(connector);

      await connector.ping();

      expect(connector.sentMessages).toContainEqual(
        expect.objectContaining({ method: 'ping' }),
      );
    });

    it('should throw when not connected', async () => {
      const connector = createConnector();

      await expect(connector.ping()).rejects.toThrow('not connected');
    });
  });

  describe('mt:[onMessage] (via receiveMessage)', () => {
    it('should resolve pending request with result', async () => {
      const connector = createAutoConnector();
      await connectConnector(connector);

      const requestPromise = connector.sendRequest({
        method: 'test/method',
        params: {},
      });

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        result: { data: 'success' },
      } as JsonRpcMessage);

      await expect(requestPromise).resolves.toEqual({ data: 'success' });
    });

    it('should reject pending request and log on error response', async () => {
      const log = vi.fn();
      const connector = createAutoConnector({ log });
      await connectConnector(connector);

      const requestPromise = connector.sendRequest({
        method: 'test/method',
        params: {},
      });

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        error: { code: -32600, message: 'Test error' },
      } as JsonRpcMessage);

      await expect(requestPromise).rejects.toThrow(JsonRpcError);
      expect(log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('received error'),
        expect.any(Object),
      );
    });

    it('should call onRequest callback and send response', async () => {
      const onRequest = vi.fn().mockResolvedValue({ result: { ok: true } });
      const connector = createAutoConnector({ onRequest });
      await connectConnector(connector);
      connector.clearSentMessages();

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 'server-req-1',
        method: 'sampling/createMessage',
        params: { prompt: 'test' },
      } as JsonRpcMessage);

      expect(onRequest).toHaveBeenCalledWith({
        method: 'sampling/createMessage',
        params: { prompt: 'test' },
      });

      await vi.waitFor(() => {
        expect(connector.sentMessages).toContainEqual(
          expect.objectContaining({
            jsonrpc: JSONRPC_VERSION,
            id: 'server-req-1',
            result: { ok: true },
          }),
        );
      });
    });

    it('should send error response when onRequest returns error', async () => {
      const onRequest = vi.fn().mockResolvedValue({
        error: { code: -1, message: 'Handler error' },
      });
      const connector = createAutoConnector({ onRequest });
      await connectConnector(connector);
      connector.clearSentMessages();

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 'server-req-1',
        method: 'sampling/createMessage',
        params: {},
      } as JsonRpcMessage);

      await vi.waitFor(() => {
        expect(connector.sentMessages).toContainEqual(
          expect.objectContaining({
            jsonrpc: JSONRPC_VERSION,
            id: 'server-req-1',
            error: { code: -1, message: 'Handler error' },
          }),
        );
      });
    });

    it('should send error response when onRequest callback is missing', async () => {
      const connector = createAutoConnector();
      await connectConnector(connector);
      connector.clearSentMessages();

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        id: 'server-req-1',
        method: 'sampling/createMessage',
        params: {},
      } as JsonRpcMessage);

      await vi.waitFor(() => {
        expect(connector.sentMessages).toContainEqual(
          expect.objectContaining({
            id: 'server-req-1',
            error: expect.objectContaining({
              message: expect.stringContaining('not enabled'),
            }),
          }),
        );
      });
    });

    it('should call onNotification callback for notifications', async () => {
      const onNotification = vi.fn().mockResolvedValue(undefined);
      const connector = createAutoConnector({ onNotification });
      await connectConnector(connector);

      await connector.receiveMessage({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: { uri: 'file://test.txt' },
      } as JsonRpcMessage);

      expect(onNotification).toHaveBeenCalledWith({
        method: 'notifications/resources/updated',
        params: { uri: 'file://test.txt' },
      });
    });

    it('should log and ignore notifications without callback', async () => {
      const log = vi.fn();
      const connector = createAutoConnector({ log });
      await connectConnector(connector);

      await expect(
        connector.receiveMessage({
          jsonrpc: JSONRPC_VERSION,
          method: 'notifications/resources/updated',
          params: {},
        } as JsonRpcMessage),
      ).resolves.toBeUndefined();

      expect(log).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('notification'),
        expect.any(Object),
      );
    });
  });

  describe('mt:[Symbol.dispose]', () => {
    it('should be a no-op for browser compatibility', () => {
      const connector = createConnector();

      expect(() => {
        connector[Symbol.dispose]();
      }).not.toThrow();
    });
  });
});
