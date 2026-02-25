/**
 * @file tests for ToolManager cross-server tool operations
 * @module spec/tool
 * @description
 * this test suite validates the ToolManager's ability to coordinate tool
 * operations across multiple connected MCP servers. It covers:
 * - Listing tools from all connected servers with server attribution
 * - Finding tools by name across multiple servers
 * - Server-specific tool listing and retrieval
 * - Tool execution with arguments
 * - Error handling for tool execution failures
 * - Network error and disconnection handling
 * - Server-specific error handling
 *
 * The ToolManager enables clients to work with tools from multiple sources
 * seamlessly, handling server routing and aggregation automatically while
 * preserving tool execution results including error states.
 * @see {@link ../src/tool.ts} - ToolManager implementation
 * @see {@link ../src/connector.ts} - McpConnector for server communication
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManager } from '#cache';

import { ToolManager } from '#tool';

import type { CallToolResult, Tool } from '@coremcp/protocol';

import type { ConnectionManager } from '#connection';
import type { McpConnector } from '#connector';

// mock ClientServer
vi.mock('#server');

// MOCKS //

const { listToolsFn1, callToolFn1 } = vi.hoisted(() => ({
  listToolsFn1: vi.fn(),
  callToolFn1: vi.fn(),
}));

const { listToolsFn2, callToolFn2 } = vi.hoisted(() => ({
  listToolsFn2: vi.fn(),
  callToolFn2: vi.fn(),
}));

// TEST SUITES //

describe('ToolManager', () => {
  let manager: ToolManager;
  let connectorsMap: Map<string, McpConnector>;
  let mockConnectionManager: ConnectionManager;
  let mockServer1: McpConnector;
  let mockServer2: McpConnector;

  const testTools1: Tool[] = [
    {
      name: 'server1-tool1',
      description: 'First tool from server 1',
      inputSchema: {
        type: 'object',
        properties: {
          arg1: { type: 'string', description: 'First argument' },
        },
        required: ['arg1'],
      } as Tool['inputSchema'],
    },
    {
      name: 'server1-tool2',
      description: 'Second tool from server 1',
      inputSchema: {
        type: 'object',
        properties: {
          arg1: { type: 'number', description: 'Number argument' },
          arg2: { type: 'boolean', description: 'Boolean argument' },
        },
        required: [],
      } as Tool['inputSchema'],
    },
  ];

  const testTools2: Tool[] = [
    {
      name: 'server2-tool1',
      description: 'First tool from server 2',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input text' },
        },
        required: ['input'],
      } as Tool['inputSchema'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    listToolsFn1.mockResolvedValue(testTools1);
    listToolsFn2.mockResolvedValue(testTools2);

    mockServer1 = {
      listTools: listToolsFn1,
      callTool: callToolFn1,
    } as unknown as McpConnector;

    mockServer2 = {
      listTools: listToolsFn2,
      callTool: callToolFn2,
    } as unknown as McpConnector;

    connectorsMap = new Map([
      ['server1', mockServer1],
      ['server2', mockServer2],
    ]);

    mockConnectionManager = {
      connectors: connectorsMap,
    } satisfies Partial<ConnectionManager> as Partial<ConnectionManager> as ConnectionManager;

    manager = new ToolManager(mockConnectionManager);
  });

  describe('listTools', () => {
    it('should list tools from all connected servers', async () => {
      const result = await manager.listTools();

      expect(mockServer1.listTools).toHaveBeenCalled();
      expect(mockServer2.listTools).toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { ...testTools1[0], serverName: 'server1' },
        { ...testTools1[1], serverName: 'server1' },
        { ...testTools2[0], serverName: 'server2' },
      ]);
    });

    it('should handle errors from individual servers', async () => {
      listToolsFn1.mockRejectedValue(new Error('Server1 error'));

      const result = await manager.listTools();

      expect(mockServer2.listTools).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe('server2');
    });
  });

  describe('listToolsFromServer', () => {
    it('should list tools from specific server', async () => {
      const result = await manager.listToolsFromServer('server1');

      expect(mockServer1.listTools).toHaveBeenCalled();
      expect(mockServer2.listTools).not.toHaveBeenCalled();
      expect(result).toEqual(testTools1);
    });

    it('should throw error if server not found', async () => {
      await expect(manager.listToolsFromServer('non-existent')).rejects.toThrow(
        'Server non-existent not found',
      );
    });
  });

  describe('getTool', () => {
    it('should get specific tool from server', async () => {
      const result = await manager.getTool('server1', 'server1-tool2');

      expect(result).toEqual(testTools1[1]);
    });

    it('should return undefined for non-existent tool', async () => {
      const result = await manager.getTool('server1', 'non-existent-tool');

      expect(result).toBeUndefined();
    });

    it('should throw error if server not found', async () => {
      await expect(manager.getTool('non-existent', 'tool')).rejects.toThrow(
        'Server non-existent not found',
      );
    });
  });

  describe('callTool', () => {
    it('should call tool on specific server with arguments', async () => {
      const expectedResult: CallToolResult = {
        content: [
          {
            type: 'text',
            text: 'Tool executed successfully',
          },
        ],
        isError: false,
      };

      callToolFn1.mockResolvedValue(expectedResult);

      const result = await manager.callTool('server1', 'test-tool', {
        arg1: 'value1',
        arg2: 42,
      });

      expect(callToolFn1).toHaveBeenCalledWith('test-tool', {
        arg1: 'value1',
        arg2: 42,
      });
      expect(result).toEqual(expectedResult);
    });

    it('should call tool without arguments', async () => {
      const expectedResult: CallToolResult = {
        content: [
          {
            type: 'text',
            text: 'Tool executed without arguments',
          },
        ],
        isError: false,
      };

      callToolFn2.mockResolvedValue(expectedResult);

      const result = await manager.callTool('server2', 'no-args-tool');

      expect(mockServer2.callTool).toHaveBeenCalledWith(
        'no-args-tool',
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle tool execution errors', async () => {
      const errorResult: CallToolResult = {
        content: [
          {
            type: 'text',
            text: 'Tool execution failed: Invalid input',
          },
        ],
        isError: true,
      };

      callToolFn1.mockResolvedValue(errorResult);

      const result = await manager.callTool('server1', 'failing-tool', {
        invalidArg: 'bad-value',
      });

      expect(result).toEqual(errorResult);
      expect(result.isError).toBe(true);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.callTool('non-existent', 'tool', {}),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('findTool', () => {
    it('should find tool by name from any server', async () => {
      const result = await manager.findTool('server2-tool1');

      expect(result).toEqual({
        ...testTools2[0],
        serverName: 'server2',
      });
    });

    it('should return undefined for non-existent tool', async () => {
      const result = await manager.findTool('non-existent-tool');

      expect(result).toBeUndefined();
    });

    it('should return first match when multiple servers have same tool name', async () => {
      // add common tool to both servers
      const commonTool: Tool = {
        name: 'common-tool',
        description: 'Common tool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        } as Tool['inputSchema'],
      };

      testTools1.push(commonTool);
      testTools2.push({
        ...commonTool,
        description: 'Common tool from server 2',
      });

      const result = await manager.findTool('common-tool');

      expect(result?.serverName).toBe('server1');
      expect(result?.description).toBe('Common tool');
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      callToolFn1.mockRejectedValue(new Error('Network error'));

      await expect(manager.callTool('server1', 'tool', {})).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('caching', () => {
    it('should use cached tools when available', async () => {
      const cacheManager = new CacheManager();
      const cachedTools: Tool[] = [
        {
          name: 'cached-tool',
          description: 'Cached tool',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          } as Tool['inputSchema'],
        },
      ];
      cacheManager.set('server1', 'tools', cachedTools);

      const managerWithCache = new ToolManager(
        mockConnectionManager,
        cacheManager,
      );

      const result = await managerWithCache.listTools();

      expect(result).toContainEqual({
        ...cachedTools[0],
        serverName: 'server1',
      });
      expect(mockServer1.listTools).not.toHaveBeenCalled();
    });

    it('should return cached tools for specific server', async () => {
      const cacheManager = new CacheManager();
      const cachedTools: Tool[] = [
        {
          name: 'server-cached-tool',
          description: 'Server cached tool',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          } as Tool['inputSchema'],
        },
      ];
      cacheManager.set('server2', 'tools', cachedTools);

      const managerWithCache = new ToolManager(
        mockConnectionManager,
        cacheManager,
      );

      const result = await managerWithCache.listToolsFromServer('server2');

      expect(result).toEqual(cachedTools);
      expect(mockServer2.listTools).not.toHaveBeenCalled();
    });
  });
});
