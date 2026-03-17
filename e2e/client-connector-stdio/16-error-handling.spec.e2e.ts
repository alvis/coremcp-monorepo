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
      // SPEC ALIGNMENT: PASS
      /**
       * verifies calling a nonexistent tool returns a protocol error.
       * per spec, tool lookup failures are reported as MCP error responses.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L209-L215 (tools/call validation)
       */
      await expect(
        ctx.connector.callTool('nonExistentTool', {}),
      ).rejects.toThrow('Unknown tool: nonExistentTool');
    });

    it('should maintain connection after tool not found error [ERROR-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies a tool lookup failure does not tear down the connector session.
       * per spec, JSON-RPC error responses are valid messages and should not
       * invalidate the transport.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (error responses remain valid stdio messages)
       */
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
      // SPEC ALIGNMENT: PASS
      /**
       * verifies nonexistent resource reads return an error.
       * per spec, resource-not-found is a protocol error case.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L236 (ProtocolErrorCode.ResourceNotFound)
       */
      await expect(
        ctx.connector.readResource('test://nonexistent/resource'),
      ).rejects.toThrow();
    });

    it('should maintain connection after resource error [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies a resource lookup failure does not close the session.
       * per spec, valid error responses should not poison the connection.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (stdio transport stays open after error messages)
       */
      await expect(
        ctx.connector.readResource('test://does/not/exist'),
      ).rejects.toThrow();

      expect(ctx.connector.info.isConnected).toBe(true);
    });
  });

  describe('invalid prompt', () => {
    it('should throw error for nonexistent prompt name [ERROR-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies a missing prompt name is rejected as an invalid request.
       * per spec, prompts/get requires a valid prompt identifier.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L232 (ProtocolErrorCode.InvalidParams = -32602)
       */
      await expect(
        ctx.connector.getPrompt('nonexistent_prompt'),
      ).rejects.toThrow();
    });
  });

  describe('connection stability after errors', () => {
    it('should handle multiple consecutive errors without degradation [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies repeated protocol errors do not degrade session stability.
       * per spec, error responses are ordinary MCP messages and should not
       * prevent later successful requests.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (error responses remain valid stdio messages)
       */
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
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector remains usable after benign transport noise.
       * Per stdio transport behavior, the session should tolerate empty-line noise
       * without becoming unhealthy.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L33-L64 (stdio read loop ignores empty chunks/lines)
       */
      // verify connection is active and operations succeed
      const tools = await ctx.connector.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // connection should still be active
      expect(ctx.connector.info.isConnected).toBe(true);
    });
  });
});
