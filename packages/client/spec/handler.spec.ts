import { describe, expect, it, vi } from 'vitest';

import { CacheManager } from '#cache';
import {
  createServerNotificationHandler,
  createServerRequestHandler,
} from '#handler';

import type {
  ElicitResult,
  McpServerNotification,
  McpServerRequest,
  Root,
} from '@coremcp/protocol';

import type { McpConnector } from '#connector';

// TEST SUITES //

describe('fn:createServerRequestHandler', () => {
  describe('elicitation/create', () => {
    it('should handle elicitation request with callback', async () => {
      const mockElicitResult: ElicitResult = { action: 'accept' };
      const onElicitation = vi.fn().mockResolvedValue(mockElicitResult);
      const roots: Root[] = [];
      const handler = createServerRequestHandler({ onElicitation, roots });
      const request: McpServerRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'elicitation/create',
        params: {
          message: 'test message',
          requestedSchema: {
            properties: {},
            type: 'object',
          },
        },
      };

      const result = await handler(request);

      expect(result).toEqual({ result: mockElicitResult });
      expect(onElicitation).toHaveBeenCalledWith(request.params);
    });
  });

  describe('sampling/createMessage', () => {
    it('should handle sampling request with callback', async () => {
      const mockSamplingResult = {
        role: 'assistant' as const,
        content: { type: 'text' as const, text: 'AI response' },
        model: 'test-model',
        stopReason: 'endTurn' as const,
      };
      const onSampling = vi.fn().mockResolvedValue(mockSamplingResult);
      const roots: Root[] = [];
      const handler = createServerRequestHandler({ onSampling, roots });
      const request: McpServerRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'sampling/createMessage',
        params: {
          messages: [],
          modelPreferences: {},
          systemPrompt: 'test',
          maxTokens: 100,
        },
      };

      const result = await handler(request);

      expect(result).toEqual({ result: mockSamplingResult });
      expect(onSampling).toHaveBeenCalledWith(request.params);
    });
  });

  describe('roots/list', () => {
    it('should return configured roots', async () => {
      const roots: Root[] = [
        { uri: 'file:///test1', name: 'test1' },
        { uri: 'file:///test2', name: 'test2' },
      ];
      const handler = createServerRequestHandler({ roots });
      const request: McpServerRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'roots/list',
        params: {},
      };

      const result = await handler(request);

      expect(result).toEqual({ result: { roots } });
    });
  });

  describe('unknown method', () => {
    it('should return method not found error', async () => {
      const roots: Root[] = [];
      const handler = createServerRequestHandler({ roots });
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'unknown/method',
        params: {},
      } as unknown as McpServerRequest;

      const result = await handler(request);

      expect(result).toEqual({
        error: {
          code: -32601,
          message: 'Method not found: unknown/method',
          data: { request },
        },
      });
    });
  });

  describe('error handling', () => {
    it('should return error when elicitation callback not configured', async () => {
      const roots: Root[] = [];
      const handler = createServerRequestHandler({ roots });
      const request: McpServerRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'elicitation/create',
        params: {
          message: 'test',
          requestedSchema: { properties: {}, type: 'object' },
        },
      };

      const result = await handler(request);

      expect(result).toEqual({
        error: {
          code: -32603,
          message: 'Elicitation callback not configured',
        },
      });
    });

    it('should log error when callback fails with logger', async () => {
      const log = vi.fn();
      const onElicitation = vi.fn().mockRejectedValue(new Error('Test error'));
      const roots: Root[] = [];
      const handler = createServerRequestHandler({ onElicitation, roots, log });
      const request: McpServerRequest = {
        jsonrpc: '2.0',
        id: 7,
        method: 'elicitation/create',
        params: {
          message: 'test',
          requestedSchema: { properties: {}, type: 'object' },
        },
      };

      await handler(request);

      expect(log).toHaveBeenCalledWith(
        'error',
        'Error handling server request',
        expect.objectContaining({
          method: 'elicitation/create',
          error: expect.any(Error),
        }),
      );
    });

    it('should return error when sampling callback not configured', async () => {
      const roots: Root[] = [];
      const handler = createServerRequestHandler({ roots });
      const request: McpServerRequest = {
        jsonrpc: '2.0',
        id: 6,
        method: 'sampling/createMessage',
        params: {
          messages: [],
          modelPreferences: {},
          systemPrompt: 'test',
          maxTokens: 100,
        },
      };

      const result = await handler(request);

      expect(result).toEqual({
        error: {
          code: -32603,
          message: 'Sampling callback not configured',
        },
      });
    });
  });
});

describe('fn:createServerNotificationHandler', () => {
  const mockConnector = {
    info: {
      name: 'test-server',
      serverInfo: null,
      protocolVersion: null,
      isConnected: true,
      log: undefined,
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      },
    },
  } satisfies Partial<McpConnector> as McpConnector;

  describe('notifications/message', () => {
    it('should handle log message notification', async () => {
      const onLogMessage = vi.fn();
      const handler = createServerNotificationHandler({ onLogMessage });
      const notification = {
        method: 'notifications/message',
        params: {
          level: 'info',
          data: 'test log message',
        },
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onLogMessage).toHaveBeenCalledWith({
        connector: mockConnector,
        level: 'info',
        data: 'test log message',
        logger: undefined,
      });
    });
  });

  describe('notifications/resources/updated', () => {
    it('should handle resource updated notification', async () => {
      const onResourceChange = vi.fn();
      const handler = createServerNotificationHandler({ onResourceChange });
      const notification = {
        method: 'notifications/resources/updated',
        params: {
          uri: 'file:///test.txt',
        },
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onResourceChange).toHaveBeenCalledWith({
        connector: mockConnector,
        uri: 'file:///test.txt',
      });
    });
  });

  describe('notifications/tools/list_changed', () => {
    it('should handle tools list changed with cache invalidation', async () => {
      const cacheManager = new CacheManager();
      const refreshList = vi.fn().mockResolvedValue(undefined);
      const onListChange = vi.fn();
      const handler = createServerNotificationHandler({
        cacheManager,
        refreshList,
        onListChange,
      });
      const notification = {
        method: 'notifications/tools/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockConnector,
        changeType: 'tools',
      });
      expect(refreshList).toHaveBeenCalledWith('test-server', 'tools');
    });

    it('should handle tools list changed without cache manager', async () => {
      const onListChange = vi.fn();
      const handler = createServerNotificationHandler({ onListChange });
      const notification = {
        method: 'notifications/tools/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockConnector,
        changeType: 'tools',
      });
    });

    it('should handle tools list changed when server does not support listChanged', async () => {
      const connectorWithoutListChanged = {
        info: {
          name: 'test-server',
          serverInfo: null,
          protocolVersion: null,
          isConnected: true,
          log: undefined,
          capabilities: {
            tools: {},
          },
        },
      } satisfies Partial<McpConnector> as McpConnector;
      const cacheManager = new CacheManager();
      const refreshList = vi.fn();
      const handler = createServerNotificationHandler({
        cacheManager,
        refreshList,
      });
      const notification = {
        method: 'notifications/tools/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(connectorWithoutListChanged, notification);

      expect(refreshList).not.toHaveBeenCalled();
    });
  });

  describe('notifications/resources/list_changed', () => {
    it('should handle resources list changed with cache invalidation', async () => {
      const cacheManager = new CacheManager();
      const refreshList = vi.fn().mockResolvedValue(undefined);
      const onListChange = vi.fn();
      const handler = createServerNotificationHandler({
        cacheManager,
        refreshList,
        onListChange,
      });
      const notification = {
        method: 'notifications/resources/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockConnector,
        changeType: 'resources',
      });
      expect(refreshList).toHaveBeenCalledWith('test-server', 'resources');
    });

    it('should handle resources list changed when server does not support listChanged', async () => {
      const connectorWithoutListChanged = {
        info: {
          name: 'test-server',
          serverInfo: null,
          protocolVersion: null,
          isConnected: true,
          log: undefined,
          capabilities: {
            resources: {},
          },
        },
      } satisfies Partial<McpConnector> as McpConnector;
      const cacheManager = new CacheManager();
      const refreshList = vi.fn();
      const handler = createServerNotificationHandler({
        cacheManager,
        refreshList,
      });
      const notification = {
        method: 'notifications/resources/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(connectorWithoutListChanged, notification);

      expect(refreshList).not.toHaveBeenCalled();
    });
  });

  describe('notifications/prompts/list_changed', () => {
    it('should handle prompts list changed with cache invalidation', async () => {
      const cacheManager = new CacheManager();
      const refreshList = vi.fn().mockResolvedValue(undefined);
      const onListChange = vi.fn();
      const handler = createServerNotificationHandler({
        cacheManager,
        refreshList,
        onListChange,
      });
      const notification = {
        method: 'notifications/prompts/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onListChange).toHaveBeenCalledWith({
        connector: mockConnector,
        changeType: 'prompts',
      });
      expect(refreshList).toHaveBeenCalledWith('test-server', 'prompts');
    });

    it('should handle prompts list changed when server does not support listChanged', async () => {
      const connectorWithoutListChanged = {
        info: {
          name: 'test-server',
          serverInfo: null,
          protocolVersion: null,
          isConnected: true,
          log: undefined,
          capabilities: {
            prompts: {},
          },
        },
      } satisfies Partial<McpConnector> as McpConnector;
      const cacheManager = new CacheManager();
      const refreshList = vi.fn();
      const handler = createServerNotificationHandler({
        cacheManager,
        refreshList,
      });
      const notification = {
        method: 'notifications/prompts/list_changed',
        params: {},
      } as McpServerNotification;

      await handler(connectorWithoutListChanged, notification);

      expect(refreshList).not.toHaveBeenCalled();
    });
  });

  describe('notifications/progress', () => {
    it('should handle progress notification', async () => {
      const onProgress = vi.fn();
      const handler = createServerNotificationHandler({ onProgress });
      const notification = {
        method: 'notifications/progress',
        params: {
          progressToken: 'token-123',
          progress: 50,
          total: 100,
        },
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onProgress).toHaveBeenCalledWith({
        connector: mockConnector,
        progressToken: 'token-123',
        progress: 50,
        total: 100,
        message: undefined,
      });
    });
  });

  describe('notifications/cancelled', () => {
    it('should handle cancelled notification', async () => {
      const onCancelled = vi.fn();
      const handler = createServerNotificationHandler({ onCancelled });
      const notification = {
        method: 'notifications/cancelled',
        params: {
          requestId: 'req-123',
          reason: 'User cancelled',
        },
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(onCancelled).toHaveBeenCalledWith({
        connector: mockConnector,
        requestId: 'req-123',
        reason: 'User cancelled',
      });
    });
  });

  describe('unknown notification', () => {
    it('should handle unknown notification gracefully', async () => {
      const log = vi.fn();
      const handler = createServerNotificationHandler({ log });
      const notification = {
        method: 'unknown/notification',
        params: {},
      } as unknown as McpServerNotification;

      await handler(mockConnector, notification);

      expect(log).toHaveBeenCalledWith(
        'warn',
        'Unknown notification from server',
        {
          method: 'unknown/notification',
        },
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors in notification processing', async () => {
      const log = vi.fn();
      const onLogMessage = vi
        .fn()
        .mockRejectedValue(new Error('Handler error'));
      const handler = createServerNotificationHandler({ log, onLogMessage });
      const notification = {
        method: 'notifications/message',
        params: {
          level: 'info',
          data: 'test',
        },
      } as McpServerNotification;

      await handler(mockConnector, notification);

      expect(log).toHaveBeenCalledWith(
        'error',
        'Failed to handle server notification',
        expect.objectContaining({
          method: 'notifications/message',
          error: expect.any(Error),
        }),
      );
    });
  });
});
