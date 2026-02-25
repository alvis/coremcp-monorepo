/**
 * @file tests for ResourceManager cross-server resource operations
 * @module spec/resource
 * @description
 * this test suite validates the ResourceManager's ability to coordinate resource
 * operations across multiple connected MCP servers. It covers:
 * - Listing resources and resource templates from all connected servers
 * - Finding resources by URI across multiple servers
 * - Reading resource content from specific servers
 * - Resource subscription management (subscribe/unsubscribe)
 * - Resource template argument completion
 * - Error handling for disconnected or non-existent servers
 * - Server-specific resource operations
 *
 * The ResourceManager enables clients to work with resources from multiple sources
 * seamlessly, handling server routing, aggregation, and subscription lifecycle.
 * @see {@link ../src/resource.ts} - ResourceManager implementation
 * @see {@link ../src/connector.ts} - McpConnector for server communication
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManager } from '#cache';
import { ResourceManager } from '#resource';

import type {
  CompleteResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from '@coremcp/protocol';

import type { ConnectionManager } from '#connection';
import type { McpConnector } from '#connector';

// mock ClientServer
vi.mock('#server');

// MOCKS //

const {
  listResourcesFn1,
  listResourceTemplatesFn1,
  readResourceFn1,
  subscribeToResourceFn1,
  unsubscribeFromResourceFn1,
  completeFn1,
} = vi.hoisted(() => ({
  listResourcesFn1: vi.fn(),
  listResourceTemplatesFn1: vi.fn(),
  readResourceFn1: vi.fn(),
  subscribeToResourceFn1: vi.fn(),
  unsubscribeFromResourceFn1: vi.fn(),
  completeFn1: vi.fn(),
}));

const {
  listResourcesFn2,
  listResourceTemplatesFn2,
  readResourceFn2,
  subscribeToResourceFn2,
  unsubscribeFromResourceFn2,
  completeFn2,
} = vi.hoisted(() => ({
  listResourcesFn2: vi.fn(),
  listResourceTemplatesFn2: vi.fn(),
  readResourceFn2: vi.fn(),
  subscribeToResourceFn2: vi.fn(),
  unsubscribeFromResourceFn2: vi.fn(),
  completeFn2: vi.fn(),
}));

// TEST SUITES //

describe('cl:ResourceManager', () => {
  let manager: ResourceManager;
  let connectorsMap: Map<string, McpConnector>;
  let mockConnectionManager: ConnectionManager;
  let mockServer1: McpConnector;
  let mockServer2: McpConnector;

  const testResources1: Resource[] = [
    {
      uri: 'file:///server1/file1.txt',
      name: 'file1.txt',
      description: 'First file from server 1',
      mimeType: 'text/plain',
    },
    {
      uri: 'file:///server1/file2.json',
      name: 'file2.json',
      description: 'Second file from server 1',
      mimeType: 'application/json',
    },
  ];

  const testResources2: Resource[] = [
    {
      uri: 'http://server2/api/data',
      name: 'API Data',
      description: 'Data from server 2 API',
      mimeType: 'application/json',
    },
  ];

  const testTemplates1: ResourceTemplate[] = [
    {
      uriTemplate: 'file:///server1/{path}',
      name: 'File Template',
      description: 'Template for files on server 1',
      mimeType: 'text/plain',
    },
  ];

  const testTemplates2: ResourceTemplate[] = [
    {
      uriTemplate: 'http://server2/api/{endpoint}',
      name: 'API Template',
      description: 'Template for API endpoints on server 2',
      mimeType: 'application/json',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    listResourcesFn1.mockResolvedValue(testResources1);
    listResourceTemplatesFn1.mockResolvedValue(testTemplates1);
    listResourcesFn2.mockResolvedValue(testResources2);
    listResourceTemplatesFn2.mockResolvedValue(testTemplates2);

    mockServer1 = {
      listResources: listResourcesFn1,
      listResourceTemplates: listResourceTemplatesFn1,
      readResource: readResourceFn1,
      subscribeToResource: subscribeToResourceFn1,
      unsubscribeFromResource: unsubscribeFromResourceFn1,
      complete: completeFn1,
    } as unknown as McpConnector;

    mockServer2 = {
      listResources: listResourcesFn2,
      listResourceTemplates: listResourceTemplatesFn2,
      readResource: readResourceFn2,
      subscribeToResource: subscribeToResourceFn2,
      unsubscribeFromResource: unsubscribeFromResourceFn2,
      complete: completeFn2,
    } as unknown as McpConnector;

    connectorsMap = new Map([
      ['server1', mockServer1],
      ['server2', mockServer2],
    ]);

    mockConnectionManager = {
      connectors: connectorsMap,
    } satisfies Partial<ConnectionManager> as Partial<ConnectionManager> as ConnectionManager;

    manager = new ResourceManager(mockConnectionManager);
  });

  describe('listResources', () => {
    it('should list resources from all connected servers', async () => {
      const result = await manager.listResources();

      expect(mockServer1.listResources).toHaveBeenCalled();
      expect(mockServer2.listResources).toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { ...testResources1[0], serverName: 'server1' },
        { ...testResources1[1], serverName: 'server1' },
        { ...testResources2[0], serverName: 'server2' },
      ]);
    });

    it('should handle errors from individual servers', async () => {
      listResourcesFn1.mockRejectedValue(new Error('Server1 error'));

      const result = await manager.listResources();

      expect(mockServer2.listResources).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe('server2');
    });
  });

  describe('listResourcesFromServer', () => {
    it('should list resources from specific server', async () => {
      const result = await manager.listResourcesFromServer('server1');

      expect(mockServer1.listResources).toHaveBeenCalled();
      expect(mockServer2.listResources).not.toHaveBeenCalled();
      expect(result).toEqual(testResources1);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.listResourcesFromServer('non-existent'),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('listResourceTemplates', () => {
    it('should list resource templates from all connected servers', async () => {
      const result = await manager.listResourceTemplates();

      expect(mockServer1.listResourceTemplates).toHaveBeenCalled();
      expect(mockServer2.listResourceTemplates).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { ...testTemplates1[0], serverName: 'server1' },
        { ...testTemplates2[0], serverName: 'server2' },
      ]);
    });
  });

  describe('listResourceTemplatesFromServer', () => {
    it('should list resource templates from specific server', async () => {
      const result = await manager.listResourceTemplatesFromServer('server2');

      expect(mockServer2.listResourceTemplates).toHaveBeenCalled();
      expect(mockServer1.listResourceTemplates).not.toHaveBeenCalled();
      expect(result).toEqual(testTemplates2);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.listResourceTemplatesFromServer('non-existent'),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('findResource', () => {
    it('should find resource by URI from any server', async () => {
      const result = await manager.findResource('file:///server1/file2.json');

      expect(result).toEqual({
        ...testResources1[1],
        serverName: 'server1',
      });
    });

    it('should return undefined for non-existent resource', async () => {
      const result = await manager.findResource('file:///non-existent.txt');

      expect(result).toBeUndefined();
    });

    it('should return first match when multiple servers have same URI', async () => {
      // add common resource to both servers
      const commonResource: Resource = {
        uri: 'file:///common.txt',
        name: 'common.txt',
        description: 'Common resource',
        mimeType: 'text/plain',
      };

      testResources1.push(commonResource);
      testResources2.push(commonResource);

      const result = await manager.findResource('file:///common.txt');

      expect(result?.serverName).toBe('server1');
    });
  });

  describe('readResource', () => {
    it('should read resource from specific server', async () => {
      const expectedResult: ReadResourceResult = {
        contents: [
          {
            uri: 'file:///test.txt',
            mimeType: 'text/plain',
            text: 'Hello, world!',
          },
        ],
      };

      readResourceFn1.mockResolvedValue(expectedResult);

      const result = await manager.readResource('server1', 'file:///test.txt');

      expect(mockServer1.readResource).toHaveBeenCalledWith('file:///test.txt');
      expect(result).toEqual(expectedResult);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.readResource('non-existent', 'file:///test.txt'),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('subscribeToResource', () => {
    it('should subscribe to resource on specific server', async () => {
      subscribeToResourceFn1.mockResolvedValue(undefined);

      await manager.subscribeToResource('server1', 'file:///test.txt');

      expect(mockServer1.subscribeToResource).toHaveBeenCalledWith(
        'file:///test.txt',
      );
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.subscribeToResource('non-existent', 'file:///test.txt'),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('unsubscribeFromResource', () => {
    it('should unsubscribe from resource on specific server', async () => {
      unsubscribeFromResourceFn1.mockResolvedValue(undefined);

      await manager.unsubscribeFromResource('server1', 'file:///test.txt');

      expect(mockServer1.unsubscribeFromResource).toHaveBeenCalledWith(
        'file:///test.txt',
      );
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.unsubscribeFromResource('non-existent', 'file:///test.txt'),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('completeResourceTemplate', () => {
    it('should complete resource template argument from specific server', async () => {
      const expectedResult: CompleteResult = {
        completion: {
          values: ['users', 'posts', 'comments'],
          total: 3,
          hasMore: false,
        },
      };

      completeFn2.mockResolvedValue(expectedResult);

      const result = await manager.completeResourceTemplate(
        'server2',
        'http://server2/api/{endpoint}',
        { name: 'endpoint', value: 'u' },
      );

      expect(mockServer2.complete).toHaveBeenCalledWith(
        {
          type: 'ref/resource',
          uri: 'http://server2/api/{endpoint}',
        },
        { name: 'endpoint', value: 'u' },
      );
      expect(result).toEqual(expectedResult);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.completeResourceTemplate('non-existent', 'template', {
          name: 'arg',
          value: 'val',
        }),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('caching', () => {
    it('should use cached resource templates when available', async () => {
      const cacheManager = new CacheManager();
      const cachedTemplates: ResourceTemplate[] = [
        {
          uriTemplate: 'cached://template',
          name: 'Cached Template',
          mimeType: 'text/plain',
        },
      ];
      cacheManager.set('server1', 'resourceTemplates', cachedTemplates);

      const managerWithCache = new ResourceManager(
        mockConnectionManager,
        cacheManager,
      );

      const result = await managerWithCache.listResourceTemplates();

      expect(result).toContainEqual({
        ...cachedTemplates[0],
        serverName: 'server1',
      });
      expect(mockServer1.listResourceTemplates).not.toHaveBeenCalled();
    });

    it('should return cached templates for specific server', async () => {
      const cacheManager = new CacheManager();
      const cachedTemplates: ResourceTemplate[] = [
        {
          uriTemplate: 'cached://server-template',
          name: 'Server Cached Template',
          mimeType: 'application/json',
        },
      ];
      cacheManager.set('server2', 'resourceTemplates', cachedTemplates);

      const managerWithCache = new ResourceManager(
        mockConnectionManager,
        cacheManager,
      );

      const result =
        await managerWithCache.listResourceTemplatesFromServer('server2');

      expect(result).toEqual(cachedTemplates);
      expect(mockServer2.listResourceTemplates).not.toHaveBeenCalled();
    });

    it('should use cached resources when available', async () => {
      const cacheManager = new CacheManager();
      const cachedResources: Resource[] = [
        {
          uri: 'cached://resource1',
          name: 'Cached Resource',
          mimeType: 'text/plain',
        },
      ];
      cacheManager.set('server1', 'resources', cachedResources);

      const managerWithCache = new ResourceManager(
        mockConnectionManager,
        cacheManager,
      );

      const result = await managerWithCache.listResources();

      expect(result).toContainEqual({
        ...cachedResources[0],
        serverName: 'server1',
      });
      expect(mockServer1.listResources).not.toHaveBeenCalled();
    });

    it('should return cached resources for specific server', async () => {
      const cacheManager = new CacheManager();
      const cachedResources: Resource[] = [
        {
          uri: 'cached://server-resource',
          name: 'Server Cached Resource',
          mimeType: 'application/json',
        },
      ];
      cacheManager.set('server2', 'resources', cachedResources);

      const managerWithCache = new ResourceManager(
        mockConnectionManager,
        cacheManager,
      );

      const result = await managerWithCache.listResourcesFromServer('server2');

      expect(result).toEqual(cachedResources);
      expect(mockServer2.listResources).not.toHaveBeenCalled();
    });

    it('should handle template errors from individual servers', async () => {
      listResourceTemplatesFn1.mockRejectedValue(
        new Error('Server1 template error'),
      );

      const result = await manager.listResourceTemplates();

      expect(mockServer2.listResourceTemplates).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe('server2');
    });
  });
});
