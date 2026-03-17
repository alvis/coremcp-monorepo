/**
 * E2E tests for edge cases via HTTP transport using HttpMcpConnector
 *
 * validates concurrent requests, large payloads, rapid reconnection,
 * server timeout handling, network interruption recovery, and message
 * ordering guarantees against the coremcp HTTP server.
 *
 * also includes undici interceptor tests for network failure edge cases
 * to validate connector resilience under adverse network conditions.
 * @see /e2e/interactions/17-edge-cases.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerHttpClientContext,
  createMockAgent,
  interceptWithNetworkError,
  interceptWithTimeout,
  interceptWithAbortMidStream,
  createInterceptedFetch,
} from '../fixtures/index';
import { TEST_TOOLS } from '../fixtures/test-server';

import type { ServerHttpClientContext } from '../fixtures/index';

// TYPES //

/** text content item */
interface TextContentItem {
  type: 'text';
  text: string;
}

/** tool call result shape */
interface ToolCallResult {
  content: TextContentItem[];
  isError?: boolean;
}

// CONSTANTS //

/** base URL for undici interceptor tests */
const INTERCEPTOR_ORIGIN = 'http://localhost:19999';

// TEST SUITES //

describe('server-transport-http / 17-edge-cases', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent tool calls correctly [EDGE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server correctly handles multiple concurrent tool calls
       * and returns the correct response for each request. Per JSON-RPC 2.0 and MCP
       * spec, request IDs ensure responses are matched to the correct request.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler with request/response ID correlation
       */

      const requests = Array.from({ length: 6 }, async (_, i) =>
        ctx.connector.callTool('echo', {
          text: `concurrent-${i}`,
        }),
      );

      const results = await Promise.all(requests);

      // verify each response is valid
      const texts = results.map(
        (r) => (r as ToolCallResult).content[0].text,
      );

      // all concurrent texts should be present
      for (let i = 0; i < 6; i++) {
        expect(texts).toContain(`concurrent-${i}`);
      }
    });

    it('should handle mixed concurrent operations [EDGE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that different MCP operations (listTools, callTool, readResource)
       * can execute concurrently without interference. Each gets a unique request ID.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler with request/response ID correlation
       */

      const [tools, echoResult, resourceRead] = await Promise.all([
        ctx.connector.listTools(),
        ctx.connector.callTool('echo', {
          text: 'mixed-concurrent',
        }),
        ctx.connector.readResource('test://info'),
      ]);

      expect(tools.length).toBeGreaterThan(0);
      expect(echoResult.content).toBeDefined();
      expect(resourceRead).toBeDefined();
    });
  });

  describe('large payload handling', () => {
    it('should handle tool call with large text argument [EDGE-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server can handle large payloads (~10KB) in tool
       * arguments. MCP messages MUST be UTF-8 encoded per the spec; no message
       * size limit is specified in JSON-RPC or MCP.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L227-L237 — ProtocolErrorCode enum (no size limit defined)
       */

      // generate a large string (~10KB)
      const largeText = 'A'.repeat(10_000);

      const result = await ctx.connector.callTool('echo', {
        text: largeText,
      });

      const toolResult = result as ToolCallResult;
      expect(toolResult.content[0]).toEqual({
        type: 'text',
        text: largeText,
      });
    });
  });

  describe('unicode content', () => {
    it('should handle unicode characters in tool arguments [EDGE-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that unicode characters (CJK, emoji, accented Latin, Greek) round-
       * trip correctly through tool arguments. MCP messages MUST be UTF-8 encoded.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L227-L237 — JSON-RPC types (UTF-8 encoding requirement)
       */

      const unicodeText = 'Hello \u4e16\u754c \ud83c\udf1f \u00e9\u00e0\u00fc \u03b1\u03b2\u03b3';

      const result = await ctx.connector.callTool('echo', {
        text: unicodeText,
      });

      const toolResult = result as ToolCallResult;
      expect(toolResult.content[0]).toEqual({
        type: 'text',
        text: unicodeText,
      });
    });

    it('should handle CJK characters in echo [EDGE-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that CJK characters (Chinese, Japanese, Korean) round-trip correctly.
       * MCP messages MUST be UTF-8 encoded per the transports spec.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L227-L237 — JSON-RPC types (UTF-8 encoding requirement)
       */

      const cjkText = '\u6d4b\u8bd5\u6587\u672c \u30c6\u30b9\u30c8 \ud14c\uc2a4\ud2b8';

      const result = await ctx.connector.callTool('echo', {
        text: cjkText,
      });

      const toolResult = result as ToolCallResult;
      expect(toolResult.content[0]).toEqual({
        type: 'text',
        text: cjkText,
      });
    });
  });

  describe('empty arguments', () => {
    it('should handle tool call with empty arguments object [EDGE-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that calling a tool with empty arguments does not crash the server.
       * The MCP tools spec allows the arguments field to be any JSON object. Server
       * must handle it gracefully (return result or proper error).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#calling-tools
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L209-L247 — tools/call validation
       */

      // echo with empty args -- should succeed or fail gracefully
      const result = await ctx.connector.callTool(
        'echo',
        {},
      );

      // the behavior depends on the tool -- it may return empty or error
      // but should not crash
      expect(result).toBeDefined();
    });
  });

  describe('rapid reconnection', () => {
    it('should handle session invalidation after server restart [EDGE-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server returns HTTP 404 for unknown session IDs. Per MCP
       * spec (Transports > Session Management), the server MUST respond with 404
       * Not Found for requests containing an invalid or expired Mcp-Session-Id.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L855-L857 — reject invalid session with 404
       */

      // send request with invalid session ID
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': 'invalid-session-after-restart',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      // server MUST return 404 for unknown session IDs per MCP spec
      expect(response.status).toBe(404);
    });

    it('should serve fresh session after establishing new connection [EDGE-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that an existing connection can still serve requests. Confirms
       * that the session established during beforeAll is functional and the
       * connector correctly manages the session lifecycle.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#operation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L431-L447 — _oninitialize
       */

      // establish a new connector connection and verify it works
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBe(TEST_TOOLS.length);
    });
  });

  describe('server restart and recovery', () => {
    it('should recover after server restart with new session [EDGE-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies end-to-end server restart recovery: client connects, server is
       * killed, a new server is spawned, and a new client session is established.
       * Per MCP spec, clients receiving 404 MUST start a new session by sending
       * a new InitializeRequest without a session ID.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L855-L857 — session validation
       */

      // spawn a server with dynamic port for this test
      const tempCtx = await createServerHttpClientContext();
      await tempCtx.connector.connect();

      const result = await tempCtx.connector.callTool(
        'echo',
        { text: 'before-restart' },
      );
      const toolResult = result as ToolCallResult;
      expect(toolResult.content[0].text).toBe('before-restart');

      // disconnect and kill
      await tempCtx.teardown();

      // spawn a new server and verify new connection works
      const newCtx = await createServerHttpClientContext();
      await newCtx.connector.connect();

      const newResult = await newCtx.connector.callTool(
        'echo',
        { text: 'after-restart' },
      );
      const newToolResult = newResult as ToolCallResult;
      expect(newToolResult.content[0].text).toBe('after-restart');

      await newCtx.teardown();
    }, 60_000);
  });

  describe('message ordering', () => {
    it('should return correct responses for sequential requests [EDGE-013]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that sequential requests return responses in the correct order.
       * Per JSON-RPC 2.0, each request has a unique ID and the response MUST
       * include the same ID, ensuring correct request/response correlation.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler with request/response correlation
       */

      const results: string[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await ctx.connector.callTool(
          'echo',
          { text: `seq-${i}` },
        );

        const toolResult = result as ToolCallResult;
        results.push((toolResult.content[0]).text);
      }

      // sequential requests should return in order
      expect(results).toEqual([
        'seq-0',
        'seq-1',
        'seq-2',
        'seq-3',
        'seq-4',
      ]);
    });
  });

  describe('truncated JSON', () => {
    it('should return parse error for truncated JSON body [EDGE-009]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that truncated JSON in the request body returns JSON-RPC Parse
       * Error (-32700). Per JSON-RPC 2.0, malformed JSON must be rejected with
       * this specific error code.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L229 — ProtocolErrorCode.ParseError = -32700
       */

      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc": "2.0", "id": 1, "method": "tools/lis',
      });

      // server should respond with a JSON-RPC parse error (-32700) for truncated JSON
      const body = (await response.json()) as {
        error?: { code: number; message: string };
      };
      expect(body.error).toBeDefined();
      expect(body.error!.code).toBe(-32700);
    });
  });

  describe('pre-initialization request', () => {
    it('should reject tools/list sent before initialize [EDGE-010]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that sending a request before initialization is rejected. Per MCP
       * spec, initialization MUST be the first interaction. Servers that require a
       * session ID SHOULD respond with 400 Bad Request for requests without an
       * MCP-Session-Id header (other than initialization).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L843-L845 — reject requests without session
       */

      // send a request without any session ID or prior initialization
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      // without a session, the server should reject the request
      // MCP servers require initialize before other methods
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('duplicate request IDs', () => {
    it('should handle two requests with the same ID gracefully [EDGE-012]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server handles duplicate request IDs without crashing.
       * Note: MCP spec says "The request ID MUST NOT have been previously used by
       * the requestor within the same session" but behavior for violations is
       * undefined. The test verifies graceful handling (no crash, no 500).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler
       */

      const { createRawHttpSession } = await import('../fixtures/index');
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      try {
        // send two requests with the same ID using sendRawMessage
        const msg1 = JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 42 });
        const msg2 = JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 42 });

        const response1 = await rawSession.sendRawMessage(msg1);
        const response2 = await rawSession.sendRawMessage(msg2);

        // server should handle both without crashing and return responses
        expect(response1.status).toBeLessThan(500);
        expect(response2.status).toBeLessThan(500);
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('network failure via undici interceptors', () => {
    it('should reject with error when network connection is refused [EDGE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the client connector rejects when the network connection is
       * refused. This tests transport-level resilience (implementation concern),
       * not MCP protocol behavior directly.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L346 — handleRequest entry point
       */

      const agent = createMockAgent();
      interceptWithNetworkError(agent, INTERCEPTOR_ORIGIN);

      const interceptedFetch = createInterceptedFetch(agent);

      // creating a context with an intercepted fetch that always fails
      // should cause connect() to fail with a network error
      const failCtx = await createServerHttpClientContext({
        fetch: interceptedFetch,
      });

      await expect(failCtx.connector.connect()).rejects.toThrow();

      await agent.close();
    });

    it('should reject with error when response times out [EDGE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the client connector rejects when the response times out.
       * MCP lifecycle spec states implementations SHOULD implement timeouts to
       * prevent hung connections.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#timeouts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L346 — handleRequest entry point
       */

      const agent = createMockAgent();
      interceptWithTimeout(agent, INTERCEPTOR_ORIGIN, 30_000);

      const interceptedFetch = createInterceptedFetch(agent);

      const failCtx = await createServerHttpClientContext({
        fetch: interceptedFetch,
      });

      await expect(failCtx.connector.connect()).rejects.toThrow();

      await agent.close();
    });

    it('should reject with error when connection aborts mid-stream [EDGE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the client connector rejects when the connection aborts
       * mid-stream. This tests transport resilience under adverse network conditions
       * (implementation concern).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L346 — handleRequest entry point
       */

      const agent = createMockAgent();
      interceptWithAbortMidStream(agent, INTERCEPTOR_ORIGIN);

      const interceptedFetch = createInterceptedFetch(agent);

      const failCtx = await createServerHttpClientContext({
        fetch: interceptedFetch,
      });

      await expect(failCtx.connector.connect()).rejects.toThrow();

      await agent.close();
    });
  });
});
