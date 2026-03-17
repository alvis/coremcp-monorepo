/**
 * E2E tests for error handling via HTTP transport using HttpMcpConnector
 *
 * validates JSON-RPC error codes, method not found, invalid params,
 * internal errors, resource not found, tool not found, and connection
 * recovery after errors against the coremcp HTTP server.
 *
 * raw fetch tests are kept for malformed request and protocol-level validation.
 * connector tests are used for recovery and typed error scenarios.
 * @see /e2e/interactions/16-error-handling.md for interaction specifications
 */

import { JsonRpcError } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import { createServerHttpClientContext } from '../fixtures/index';

import type { ServerHttpClientContext } from '../fixtures/index';

// TYPES //

/** JSON-RPC error response body */
interface JsonRpcErrorBody {
  jsonrpc: string;
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// TEST SUITES //

describe('server-transport-http / 16-error-handling', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('invalid JSON-RPC message', () => {
    it('should return JSON-RPC parse error (-32700) for malformed JSON [ERROR-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that sending malformed (truncated) JSON returns JSON-RPC Parse Error (-32700).
       * JSON-RPC 2.0 mandates -32700 for invalid JSON. The MCP spec inherits this via its
       * JSON-RPC foundation. The SDK defines ProtocolErrorCode.ParseError = -32700.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L229 — ProtocolErrorCode.ParseError = -32700
       */
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params":',
      });

      const body = (await response.json()) as JsonRpcErrorBody;
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32700);
    });

    it('should return error for missing jsonrpc field via raw HTTP [ERROR-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that a request missing the required "jsonrpc" field returns JSON-RPC
       * Invalid Request (-32600). Per JSON-RPC 2.0, the "jsonrpc" field MUST be exactly "2.0".
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L230 — ProtocolErrorCode.InvalidRequest = -32600
       */
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, method: 'tools/list' }),
      });

      const body = (await response.json()) as JsonRpcErrorBody;
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32600);
    });
  });

  describe('method not found', () => {
    it('should return JSON-RPC method not found error (-32601) for unknown method [ERROR-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that an unregistered method returns JSON-RPC Method Not Found (-32601).
       * The SDK returns ProtocolErrorCode.MethodNotFound when no handler is registered
       * for the requested method in _onrequest.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L770-L778 — MethodNotFound when handler undefined
       */
      try {
        await ctx.connector.sendRequest({
          method: 'nonexistent/method',
          params: {},
        });
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(JsonRpcError);
        expect((error as JsonRpcError).code).toBe(-32601);
      }
    });

    it('should return JSON-RPC method not found error (-32601) for typo in method name [ERROR-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that a typo in the method name (e.g. "tool/list" vs "tools/list")
       * returns JSON-RPC Method Not Found (-32601). Same _onrequest path as above.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L770-L778 — MethodNotFound when handler undefined
       */
      try {
        await ctx.connector.sendRequest({
          method: 'tool/list', // missing 's' -- should be 'tools/list'
          params: {},
        });
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(JsonRpcError);
        expect((error as JsonRpcError).code).toBe(-32601);
      }
    });
  });

  describe('invalid params', () => {
    it('should return JSON-RPC invalid params error (-32602) for prompts/get with wrong field [ERROR-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that prompts/get with invalid params (wrong_field instead of required
       * "name") returns JSON-RPC Invalid Params (-32602). The SDK uses
       * ProtocolErrorCode.InvalidParams for schema validation failures.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L232 — ProtocolErrorCode.InvalidParams = -32602
       */
      try {
        await ctx.connector.sendRequest({
          method: 'prompts/get',
          params: { wrong_field: 'simple-prompt' },
        });
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(JsonRpcError);
        expect((error as JsonRpcError).code).toBe(-32602);
      }
    });
  });

  describe('resource not found', () => {
    it('should return error for nonexistent resource URI [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that reading a nonexistent resource returns an error. coremcp uses
       * -32001 (MCP_ERROR_CODES.RESOURCE_NOT_FOUND) while the official SDK uses -32002
       * (ProtocolErrorCode.ResourceNotFound). Both are in the JSON-RPC implementation-
       * defined range [-32000, -32099]. The MCP spec does not mandate a specific code
       * for resource-not-found, so the test correctly asserts coremcp's own code.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L236 — ProtocolErrorCode.ResourceNotFound = -32002 (SDK uses -32002; coremcp uses -32001)
       */
      try {
        await ctx.connector.readResource('test://nonexistent/resource');
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(JsonRpcError);
        expect((error as JsonRpcError).code).toBe(-32001);
      }
    });
  });

  describe('tool not found', () => {
    it('should return error for nonexistent tool [ERROR-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that calling a nonexistent tool returns a protocol error. The SDK's
       * server.ts tools/call handler throws ProtocolErrorCode.InvalidParams (-32602)
       * for invalid tool requests. The test only checks that it throws, not the code.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L209-L215 — tools/call validation with InvalidParams
       */
      await expect(ctx.connector.callTool('nonExistentTool')).rejects.toThrow();
    });

    it('should maintain connection after tool not found error [ERROR-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the connection remains operational after a tool-not-found error.
       * Per MCP lifecycle spec, error responses do not terminate the session. The
       * SDK's _onrequest sends error responses without closing the transport.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L770-L778 — error response without closing connection
       */
      // trigger error
      await expect(ctx.connector.callTool('unknownTool')).rejects.toThrow();

      // verify connection still works
      const tools = await ctx.connector.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('connection recovery after errors', () => {
    it('should handle request to server and recover after errors [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that a successful request can follow an error response on the
       * same connection. The MCP lifecycle spec expects error handling to be
       * graceful without breaking the session.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L770-L778 — error response without closing connection
       */
      // send request that causes error
      await expect(
        ctx.connector.readResource('test://nonexistent/resource'),
      ).rejects.toThrow();

      // verify subsequent requests work
      const result = await ctx.connector.callTool('echo', {
        text: 'after-error',
      });

      const toolResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content[0].text).toBe('after-error');
    });

    it('should handle multiple consecutive errors without degradation [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that multiple consecutive error responses do not degrade server
       * operation. The MCP lifecycle spec expects robust error handling; the SDK's
       * protocol layer sends error responses without side effects on the session.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L770-L778 — error response handling
       */
      // trigger several errors
      await expect(ctx.connector.callTool('badTool1')).rejects.toThrow();
      await expect(ctx.connector.callTool('badTool2')).rejects.toThrow();
      await expect(
        ctx.connector.readResource('test://bad/resource'),
      ).rejects.toThrow();

      // verify server still operational
      const result = await ctx.connector.callTool('echo', {
        text: 'still-working',
      });

      const toolResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content[0].text).toBe('still-working');

      const tools = await ctx.connector.listTools();
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('internal server error', () => {
    it('should return -32603 internal error for trigger-internal-error tool [ERROR-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that an unhandled server-side exception returns JSON-RPC Internal
       * Error (-32603) and the error message does not leak stack traces. Per
       * JSON-RPC 2.0, -32603 indicates internal server errors.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L233 — ProtocolErrorCode.InternalError = -32603
       */
      try {
        await ctx.connector.callTool('trigger-internal-error');
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(JsonRpcError);
        expect((error as JsonRpcError).code).toBe(-32603);

        // the error message should not contain a stack trace
        const errorMessage = (error as JsonRpcError).message;
        expect(errorMessage).not.toContain('at ');
        expect(errorMessage).not.toContain('.ts:');
        expect(errorMessage).not.toContain('.js:');
      }
    });
  });

  describe('bad protocol version', () => {
    it('should reject initialize with unsupported protocol version [ERROR-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies version negotiation: when the client requests an unsupported
       * protocol version, the server responds with a version it supports. The SDK's
       * _oninitialize (server.ts L437-L439) falls back to _supportedProtocolVersions[0]
       * or LATEST_PROTOCOL_VERSION when the requested version is not in the supported list.
       * The test correctly asserts 'result' is present and protocolVersion differs.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 — _oninitialize version fallback
       */
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 999,
          method: 'initialize',
          params: {
            protocolVersion: '1999-01-01',
            capabilities: {},
            clientInfo: { name: 'bad-version-client', version: '1.0.0' },
          },
        }),
      });

      // server should respond, but may negotiate or reject
      const body = (await response.json()) as
        | JsonRpcErrorBody
        | { jsonrpc: string; id: number; result: { protocolVersion: string } };

      // server always negotiates a supported version via negotiateProtocolVersion
      // which falls back to the highest supported version when the requested one is unknown
      expect('result' in body).toBe(true);

      if ('result' in body) {
        expect(body.result.protocolVersion).not.toBe('1999-01-01');
        expect(body.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('server error responses', () => {
    it('should handle raw HTTP error for disconnected / invalid session [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server returns HTTP 404 for requests with an unknown
       * session ID. Per MCP spec (Transports > Session Management), the server
       * MUST respond with 404 Not Found for requests containing an invalid or
       * expired Mcp-Session-Id. The SDK's streamableHttp.ts L855-L857 implements
       * this check.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L855-L857 — reject invalid session with 404
       */
      // send request with invalid session ID
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': 'nonexistent-session-id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      // MCP spec requires 404 for invalid/expired session IDs
      expect(response.status).toBe(404);
    });
  });

  describe('capability mismatch', () => {
    it('should return error when calling trigger-roots-list without roots capability [ERROR-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies capability enforcement: when the server calls roots/list on a
       * client that did not declare roots capability, the call fails. The SDK's
       * assertCapabilityForMethod (server.ts L254-L278) checks _clientCapabilities
       * before sending server-to-client requests.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L254-L278 — assertCapabilityForMethod roots/list check
       */
      // connect a client without roots capability
      const noRootsCtx = await createServerHttpClientContext({
        capabilities: {},
      });

      try {
        await noRootsCtx.connector.connect();

        // the server's trigger-roots-list tool sends a roots/list request
        // to the client, which should fail because client has no roots capability
        await expect(
          noRootsCtx.connector.callTool('trigger-roots-list'),
        ).rejects.toThrow();
      } finally {
        await noRootsCtx.teardown();
      }
    }, 30_000);
  });
});
