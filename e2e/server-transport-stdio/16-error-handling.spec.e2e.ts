/**
 * E2E tests for error handling via stdio transport using StdioConnector
 *
 * validates JSON-RPC error codes, method not found, invalid params,
 * resource not found, tool not found, and connection stability after
 * errors against the coremcp stdio server.
 * @see /e2e/interactions/16-error-handling.md for interaction specifications
 */

import { JsonRpcError } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import { createServerStdioClientContext } from '../fixtures/index';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('server-transport-stdio / 16-error-handling', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
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
        await ctx.connector.sendRequest({ method: 'tool/list', params: {} });
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(JsonRpcError);
        expect((error as JsonRpcError).code).toBe(-32601);
      }
    });
  });

  describe('invalid params', () => {
    it('should return JSON-RPC invalid params error (-32602) for prompts/get with missing name field [ERROR-003]', async () => {
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
    it('should return error for nonexistent resource [ERROR-004]', async () => {
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
  });

  describe('malformed JSON via stdio', () => {
    it('should return -32700 parse error for malformed JSON [ERROR-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that sending malformed (truncated) JSON via stdio returns JSON-RPC
       * Parse Error (-32700). JSON-RPC 2.0 mandates -32700 for invalid JSON.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L229 — ProtocolErrorCode.ParseError = -32700
       */
      // use a raw stdio session to send malformed JSON via sendRawMessage
      const { createRawStdioSession } = await import('../fixtures/index');
      const rawSession = await createRawStdioSession();

      try {
        // send actually malformed JSON (truncated body)
        const malformedJSON =
          '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params":';

        const response = await rawSession.sendRawMessage(malformedJSON);

        expect(response.parsed).not.toBeNull();
        expect(response.parsed!.error).toBeDefined();
        expect(response.parsed!.error!.code).toBe(-32700);
      } finally {
        await rawSession.close();
      }
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
    it('should reject or negotiate unsupported protocol version [ERROR-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies version negotiation: when the client requests an unsupported
       * protocol version, the server either negotiates to a supported version or
       * rejects. The SDK's _oninitialize (server.ts L437-L439) falls back to
       * _supportedProtocolVersions[0] or LATEST_PROTOCOL_VERSION. The test
       * correctly handles both the negotiation and rejection paths.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 — _oninitialize version fallback
       */
      const { spawn: spawnProcess } = await import('node:child_process');
      const { getStdioServerConfig } = await import('../fixtures/index');

      const config = getStdioServerConfig();

      // spawn a fresh server process to send an initialize with a bad version
      // as the very first message (no prior initialization)
      const serverProcess = spawnProcess(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      try {
        const badInitialize = JSON.stringify({
          jsonrpc: '2.0',
          id: 999,
          method: 'initialize',
          params: {
            protocolVersion: '1999-01-01',
            capabilities: {},
            clientInfo: { name: 'bad-version-client', version: '1.0.0' },
          },
        });

        serverProcess.stdin.write(`${badInitialize}\n`);

        // read response from stdout
        const rawResponse = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve('');
          }, 15_000);

          let buffer = '';
          serverProcess.stdout.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) {continue;}

              try {
                JSON.parse(trimmed);
                clearTimeout(timeout);
                resolve(trimmed);

                return;
              } catch {
                // not complete JSON yet
              }
            }
          });

          serverProcess.once('error', reject);
        });

        expect(rawResponse).not.toBe('');

        const body = JSON.parse(rawResponse) as {
          result?: { protocolVersion: string };
          error?: { code: number; message: string };
        };

        if (body.error) {
          // server rejected the unsupported version outright
          expect(body.error.code).toBe(-32602);
        } else {
          // server negotiated a different (supported) version
          expect(body.result).toBeDefined();
          expect(body.result!.protocolVersion).not.toBe('1999-01-01');
        }
      } finally {
        serverProcess.kill('SIGTERM');

        await new Promise<void>((resolve) => {
          serverProcess.once('exit', () => resolve());
          setTimeout(() => {
            if (!serverProcess.killed) {serverProcess.kill('SIGKILL');}
            resolve();
          }, 5000);
        });
      }
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
      const noRootsCtx = createServerStdioClientContext({
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

  describe('connection stability after errors', () => {
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

      const callResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(callResult.content[0].text).toBe('still-working');
    });

    it('should handle error then successful request in sequence [ERROR-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that a successful request can follow an error response on the
       * same connection. The MCP lifecycle spec expects error handling to be
       * graceful without breaking the session.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L770-L778 — error response without closing connection
       */
      // error request
      await expect(
        ctx.connector.readResource('test://nonexistent/resource'),
      ).rejects.toThrow();

      // successful request
      const result = await ctx.connector.callTool('echo', {
        text: 'after-error-recovery',
      });

      const callResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(callResult.content[0].text).toBe('after-error-recovery');
    });
  });
});
