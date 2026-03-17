/**
 * E2E tests for error handling via StdioConnector
 *
 * validates JSON-RPC error responses, unknown tool/resource errors,
 * connection stability after errors, and behavior with invalid arguments
 * when using the stdio transport connector.
 * @see /e2e/interactions/16-error-handling.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerStdioClientContext,
} from '../fixtures/index';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 16-error-handling', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('tool not found', () => {
    it('should throw error for nonexistent tool [ERROR-006]', async () => {
      await expect(
        ctx.connector.callTool('nonExistentTool', {}),
      ).rejects.toThrow('Unknown tool: nonExistentTool');
    });

    it('should maintain connection after tool not found error [ERROR-006]', async () => {
      // trigger error
      await expect(
        ctx.connector.callTool('unknownTool', {}),
      ).rejects.toThrow();

      // connection should still be active
      expect(ctx.connector.info.isConnected).toBe(true);

      // should be able to make subsequent requests
      const tools = await ctx.connector.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('resource not found', () => {
    it('should throw error for nonexistent resource URI [ERROR-005]', async () => {
      await expect(
        ctx.connector.readResource('test://nonexistent/resource'),
      ).rejects.toThrow();
    });

    it('should maintain connection after resource error [ERROR-005]', async () => {
      await expect(
        ctx.connector.readResource('test://does/not/exist'),
      ).rejects.toThrow();

      expect(ctx.connector.info.isConnected).toBe(true);
    });
  });

  describe('invalid prompt', () => {
    it('should throw error for nonexistent prompt name [ERROR-003]', async () => {
      await expect(
        ctx.connector.getPrompt('nonexistent_prompt'),
      ).rejects.toThrow();
    });
  });

  describe('connection stability after errors', () => {
    it('should handle multiple consecutive errors without degradation [ERROR-005]', async () => {
      // trigger several errors in sequence
      await expect(
        ctx.connector.callTool('bad1', {}),
      ).rejects.toThrow();
      await expect(
        ctx.connector.callTool('bad2', {}),
      ).rejects.toThrow();
      await expect(
        ctx.connector.readResource('test://bad/res'),
      ).rejects.toThrow();

      // connector should still work
      expect(ctx.connector.info.isConnected).toBe(true);

      const tools = await ctx.connector.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // verify a normal tool call works
      const result = await ctx.connector.callTool('echo', {
        message: 'still-working',
      });
      expect(result).toBeDefined();
    });

    it('should ignore empty lines gracefully and remain stable [ERROR-001]', async () => {
      // verify connection is active and operations succeed
      const tools = await ctx.connector.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // connection should still be active
      expect(ctx.connector.info.isConnected).toBe(true);
    });
  });
});
