/**
 * @file tests for PromptManager cross-server prompt operations
 * @module spec/prompt
 * @description
 * this test suite validates the PromptManager's ability to coordinate prompt
 * operations across multiple connected MCP servers. It covers:
 * - Listing prompts from all connected servers with server attribution
 * - Finding prompts by name across multiple servers
 * - Getting prompt content with dynamic argument substitution
 * - Argument completion for prompt parameters
 * - Error handling for disconnected or non-existent servers
 * - Server-specific prompt operations
 *
 * The PromptManager enables clients to work with prompts from multiple sources
 * seamlessly, handling server routing and aggregation automatically.
 * @see {@link ../src/prompt.ts} - PromptManager implementation
 * @see {@link ../src/connector.ts} - McpConnector for server communication
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CacheManager } from '#cache';

import { PromptManager } from '#prompt';

import type {
  CompleteResult,
  GetPromptResult,
  Prompt,
} from '@coremcp/protocol';

import type { ConnectionManager } from '#connection';
import type { McpConnector } from '#connector';

// mock ClientServer
vi.mock('#server');

// MOCKS //

const { listPromptsFn1, getPromptFn1, completeFn1 } = vi.hoisted(() => ({
  listPromptsFn1: vi.fn(),
  getPromptFn1: vi.fn(),
  completeFn1: vi.fn(),
}));

const { listPromptsFn2, getPromptFn2, completeFn2 } = vi.hoisted(() => ({
  listPromptsFn2: vi.fn(),
  getPromptFn2: vi.fn(),
  completeFn2: vi.fn(),
}));

// TEST SUITES //

describe('PromptManager', () => {
  let manager: PromptManager;
  let connectorsMap: Map<string, McpConnector>;
  let mockConnectionManager: ConnectionManager;
  let mockServer1: McpConnector;
  let mockServer2: McpConnector;

  const testPrompts1: Prompt[] = [
    {
      name: 'server1-prompt1',
      description: 'First prompt from server 1',
      arguments: [
        { name: 'arg1', description: 'First argument', required: true },
      ],
    },
    {
      name: 'server1-prompt2',
      description: 'Second prompt from server 1',
      arguments: [],
    },
  ];

  const testPrompts2: Prompt[] = [
    {
      name: 'server2-prompt1',
      description: 'First prompt from server 2',
      arguments: [{ name: 'arg1', description: 'Argument', required: false }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    listPromptsFn1.mockResolvedValue(testPrompts1);
    listPromptsFn2.mockResolvedValue(testPrompts2);

    mockServer1 = {
      listPrompts: listPromptsFn1,
      getPrompt: getPromptFn1,
      complete: completeFn1,
    } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

    mockServer2 = {
      listPrompts: listPromptsFn2,
      getPrompt: getPromptFn2,
      complete: completeFn2,
    } satisfies Partial<McpConnector> as Partial<McpConnector> as McpConnector;

    connectorsMap = new Map([
      ['server1', mockServer1],
      ['server2', mockServer2],
    ]);

    mockConnectionManager = {
      connectors: connectorsMap,
    } satisfies Partial<ConnectionManager> as Partial<ConnectionManager> as ConnectionManager;

    manager = new PromptManager(mockConnectionManager);
  });

  describe('listPrompts', () => {
    it('should list prompts from all connected servers', async () => {
      const result = await manager.listPrompts();

      expect(mockServer1.listPrompts).toHaveBeenCalled();
      expect(mockServer2.listPrompts).toHaveBeenCalled();

      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { ...testPrompts1[0], serverName: 'server1' },
        { ...testPrompts1[1], serverName: 'server1' },
        { ...testPrompts2[0], serverName: 'server2' },
      ]);
    });

    it('should handle errors from individual servers gracefully', async () => {
      // simulate server1 error
      listPromptsFn1.mockRejectedValue(new Error('Server1 error'));

      const result = await manager.listPrompts();

      expect(mockServer2.listPrompts).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe('server2');
    });

    it('should return cached prompts when available', async () => {
      const cacheManager = new CacheManager({ ttl: 60000 });
      const managerWithCache = new PromptManager(
        mockConnectionManager,
        cacheManager,
      );

      await managerWithCache.listPrompts();

      vi.clearAllMocks();

      const result = await managerWithCache.listPrompts();

      expect(mockServer1.listPrompts).not.toHaveBeenCalled();
      expect(mockServer2.listPrompts).not.toHaveBeenCalled();
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { ...testPrompts1[0], serverName: 'server1' },
        { ...testPrompts1[1], serverName: 'server1' },
        { ...testPrompts2[0], serverName: 'server2' },
      ]);
    });
  });

  describe('findPrompt', () => {
    it('should find prompt by name from any server', async () => {
      const result = await manager.findPrompt('server2-prompt1');

      expect(result).toEqual({
        ...testPrompts2[0],
        serverName: 'server2',
      });
    });

    it('should return undefined for non-existent prompt', async () => {
      const result = await manager.findPrompt('non-existent');

      expect(result).toBeUndefined();
    });

    it('should return first match when multiple servers have same prompt name', async () => {
      // add same prompt name to both servers
      testPrompts1.push({
        name: 'common-prompt',
        description: 'Common prompt from server 1',
        arguments: [],
      });
      testPrompts2.push({
        name: 'common-prompt',
        description: 'Common prompt from server 2',
        arguments: [],
      });

      const result = await manager.findPrompt('common-prompt');

      expect(result?.serverName).toBe('server1'); // first server wins
      expect(result?.description).toBe('Common prompt from server 1');
    });
  });

  describe('getPrompt', () => {
    it('should get prompt from specific server with arguments', async () => {
      const expectedResult: GetPromptResult = {
        description: 'Processed prompt',
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Hello' },
          },
        ],
      };

      getPromptFn1.mockResolvedValue(expectedResult);

      const result = await manager.getPrompt('server1', 'test-prompt', {
        arg: 'value',
      });

      expect(mockServer1.getPrompt).toHaveBeenCalledWith('test-prompt', {
        arg: 'value',
      });
      expect(result).toEqual(expectedResult);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.getPrompt('non-existent', 'prompt', {}),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('completePrompt', () => {
    it('should complete prompt argument from specific server', async () => {
      const expectedResult: CompleteResult = {
        completion: {
          values: ['option1', 'option2'],
          total: 2,
          hasMore: false,
        },
      };

      completeFn1.mockResolvedValue(expectedResult);

      const result = await manager.completePrompt('server1', 'test-prompt', {
        name: 'arg',
        value: 'opt',
      });

      expect(mockServer1.complete).toHaveBeenCalledWith(
        { type: 'ref/prompt', name: 'test-prompt' },
        { name: 'arg', value: 'opt' },
      );
      expect(result).toEqual(expectedResult);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.completePrompt('non-existent', 'prompt', {
          name: 'arg',
          value: 'val',
        }),
      ).rejects.toThrow('Server non-existent not found');
    });
  });

  describe('listPromptsFromServer', () => {
    it('should list prompts from specific server', async () => {
      const result = await manager.listPromptsFromServer('server1');

      expect(mockServer1.listPrompts).toHaveBeenCalled();
      expect(mockServer2.listPrompts).not.toHaveBeenCalled();
      expect(result).toEqual(testPrompts1);
    });

    it('should throw error if server not found', async () => {
      await expect(
        manager.listPromptsFromServer('non-existent'),
      ).rejects.toThrow('Server non-existent not found');
    });

    it('should return cached prompts for specific server when available', async () => {
      const cacheManager = new CacheManager({ ttl: 60000 });
      const managerWithCache = new PromptManager(
        mockConnectionManager,
        cacheManager,
      );

      await managerWithCache.listPromptsFromServer('server1');

      vi.clearAllMocks();

      const result = await managerWithCache.listPromptsFromServer('server1');

      expect(mockServer1.listPrompts).not.toHaveBeenCalled();
      expect(result).toEqual(testPrompts1);
    });
  });
});
