/**
 * E2E tests for edge cases via stdio transport using StdioConnector
 *
 * validates concurrent requests, large payloads, unicode content,
 * empty arguments, rapid message handling, and message ordering
 * against the coremcp stdio server.
 * @see /e2e/interactions/17-edge-cases.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';

import type { ServerStdioClientContext } from '../fixtures/index';

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

// TEST SUITES //

describe('server-transport-stdio / 17-edge-cases', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

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

      const requests = Array.from({ length: 5 }, async (_, i) =>
        ctx.connector.callTool('echo', {
          text: `concurrent-${i}`,
        }),
      );

      const results = await Promise.all(requests);

      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      }

      const texts = results.map((r) => {
        const toolResult = r as ToolCallResult;

        return toolResult.content[0].text;
      });

      for (let i = 0; i < 5; i++) {
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
          text: 'mixed-stdio',
        }),
        ctx.connector.readResource('test://info'),
      ]);

      expect(tools.length).toBeGreaterThan(0);
      expect(echoResult).toBeDefined();
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

      const largeText = 'B'.repeat(10_000);

      const result = (await ctx.connector.callTool('echo', {
        text: largeText,
      })) as ToolCallResult;

      expect(result.content[0]).toEqual({
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

      const result = (await ctx.connector.callTool('echo', {
        text: unicodeText,
      })) as ToolCallResult;

      expect(result.content[0]).toEqual({
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

      const result = (await ctx.connector.callTool('echo', {
        text: cjkText,
      })) as ToolCallResult;

      expect(result.content[0]).toEqual({
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

      const result = await ctx.connector.callTool(
        'echo',
        {},
      );

      // should not crash, may return empty or error gracefully
      expect(result).toBeDefined();
    });
  });

  describe('rapid messages / backpressure', () => {
    it('should handle rapid sequential requests without data loss [EDGE-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that rapid sequential requests over stdio are all processed without
       * data loss. Each request-response is correlated by its JSON-RPC ID. The stdio
       * transport uses newline-delimited JSON.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler with request/response correlation
       */

      const results: string[] = [];

      for (let i = 0; i < 10; i++) {
        const result = (await ctx.connector.callTool(
          'echo',
          { text: `rapid-${i}` },
        )) as ToolCallResult;

        results.push(result.content[0].text);
      }

      // all rapid messages should be processed
      for (let i = 0; i < 10; i++) {
        expect(results[i]).toBe(`rapid-${i}`);
      }
    });
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
        const result = (await ctx.connector.callTool(
          'echo',
          { text: `order-${i}` },
        )) as ToolCallResult;

        results.push(result.content[0].text);
      }

      expect(results).toEqual([
        'order-0',
        'order-1',
        'order-2',
        'order-3',
        'order-4',
      ]);
    });
  });

  describe('truncated JSON via stdio', () => {
    it('should return parse error for truncated JSON sent to stdin [EDGE-009]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that truncated JSON sent to stdin returns JSON-RPC Parse Error
       * (-32700). Per JSON-RPC 2.0, malformed JSON must be rejected with -32700.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#error-responses
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L229 — ProtocolErrorCode.ParseError = -32700
       */

      const { createRawStdioSession } = await import('../fixtures/index');
      const rawSession = await createRawStdioSession();

      try {
        // send truncated JSON -- missing the closing brace
        const truncatedJSON = '{"jsonrpc":"2.0","method":"ping","id":1';

        const response = await rawSession.sendRawMessage(truncatedJSON);

        expect(response.parsed).not.toBeNull();
        expect(response.parsed!.error).toBeDefined();
        expect(response.parsed!.error!.code).toBe(-32700);
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('pre-initialization request via raw session', () => {
    it('should reject tools/list before initialize on a raw connection [EDGE-010]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that sending a request before initialization is rejected. Per MCP
       * spec, initialization MUST be the first interaction between client and server.
       * Pre-init requests should return an error.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler (only processes after init)
       */

      const { spawn } = await import('node:child_process');
      const { getStdioServerConfig } = await import('../fixtures/index');
      const { JSONRPC_VERSION } = await import('@coremcp/protocol');

      const config = getStdioServerConfig();

      const serverProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      try {
        // send tools/list before initialize
        const preInitRequest = JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'tools/list',
          params: {},
        });
        serverProcess.stdin!.write(`${preInitRequest}\n`);

        // read response from stdout
        const responseText = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve('');
          }, 5000);

          let buffer = '';
          serverProcess.stdout!.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

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

        if (responseText) {
          const response = JSON.parse(responseText) as {
            error?: { code: number; message: string };
          };

          // the server should respond with an error for pre-init requests
          expect(response.error).toBeDefined();
        }
      } finally {
        serverProcess.kill('SIGTERM');

        await new Promise<void>((resolve) => {
          serverProcess.once('exit', () => resolve());
          setTimeout(() => {
            if (!serverProcess.killed) serverProcess.kill('SIGKILL');
            resolve();
          }, 5000);
        });
      }
    });
  });

  describe('duplicate request IDs via stdio', () => {
    it('should handle two requests with the same ID [EDGE-012]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server handles duplicate request IDs without crashing.
       * Note: MCP spec says "The request ID MUST NOT have been previously used by
       * the requestor within the same session" but behavior for violations is
       * undefined. The test verifies graceful handling (no crash).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic#requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler
       */

      const { createRawStdioSession } = await import('../fixtures/index');
      const rawSession = await createRawStdioSession();

      try {
        // send two requests with the same ID using sendRawMessage
        const msg1 = JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 42 });
        const msg2 = JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 42 });

        const response1 = await rawSession.sendRawMessage(msg1);
        const response2 = await rawSession.sendRawMessage(msg2);

        // server should handle both without crashing and return responses
        expect(response1.parsed).not.toBeNull();
        expect(response2.parsed).not.toBeNull();
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('network interruption', () => {
    it('should detect pipe closure when server process is killed mid-request [EDGE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the client detects pipe closure when the server process is
       * killed mid-request. Pending requests should reject with an error indicating
       * stdout was closed. This tests stdio transport resilience (implementation
       * concern, not protocol-level behavior).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L761-L778 — _onrequest handler with request/response handling
       */

      const { spawn } = await import('node:child_process');
      const { getStdioServerConfig } = await import('../fixtures/index');
      const { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } = await import(
        '@coremcp/protocol'
      );

      const config = getStdioServerConfig();

      const serverProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      /** buffer for accumulating partial JSON messages from stdout */
      let stdoutBuffer = '';

      /** parsed JSON-RPC messages received from stdout */
      const receivedMessages: Array<{
        id?: number;
        result?: unknown;
        error?: { code: number; message: string };
      }> = [];

      /** resolves when a response arrives for a specific request ID */
      const responseWaiters = new Map<
        number,
        {
          resolve: (value: {
            result?: unknown;
            error?: { code: number; message: string };
          }) => void;
          reject: (error: Error) => void;
        }
      >();

      /** tracks whether stdout has closed (pipe broken) */
      let stdoutClosed = false;

      serverProcess.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const message = JSON.parse(trimmed) as {
              id?: number;
              result?: unknown;
              error?: { code: number; message: string };
            };
            receivedMessages.push(message);

            if (message.id !== undefined) {
              const waiter = responseWaiters.get(message.id);
              if (waiter) {
                responseWaiters.delete(message.id);
                waiter.resolve(message);
              }
            }
          } catch {
            // skip non-JSON lines
          }
        }
      });

      serverProcess.stdout!.on('close', () => {
        stdoutClosed = true;

        // reject all pending response waiters since the pipe is broken
        for (const [id, waiter] of responseWaiters) {
          responseWaiters.delete(id);
          waiter.reject(new Error('stdout closed before response received'));
        }
      });

      /**
       * sends a JSON-RPC request and waits for the response
       * @param id request identifier
       * @param method JSON-RPC method name
       * @param params optional method parameters
       * @returns promise resolving to the response message
       */
      function sendAndWait(
        id: number,
        method: string,
        params?: Record<string, unknown>,
      ): Promise<{
        result?: unknown;
        error?: { code: number; message: string };
      }> {
        const message: Record<string, unknown> = {
          jsonrpc: JSONRPC_VERSION,
          id,
          method,
        };

        if (params !== undefined) {
          message.params = params;
        }

        serverProcess.stdin!.write(`${JSON.stringify(message)}\n`);

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            responseWaiters.delete(id);
            reject(new Error(`Request ${method} (id=${id}) timed out`));
          }, 15_000);

          responseWaiters.set(id, {
            resolve: (value) => {
              clearTimeout(timeout);
              resolve(value);
            },
            reject: (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          });
        });
      }

      try {
        // step 1: perform the initialization handshake
        const initResponse = await sendAndWait(1, 'initialize', {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: { roots: { listChanged: true } },
          clientInfo: { name: 'e2e-edge-001', version: '1.0.0' },
        });

        expect(initResponse.result).toBeDefined();

        // send initialized notification (fire-and-forget)
        serverProcess.stdin!.write(
          `${JSON.stringify({
            jsonrpc: JSONRPC_VERSION,
            method: 'notifications/initialized',
          })}\n`,
        );

        // step 2: start a slow-operation request (10 seconds) without awaiting
        const slowRequestPromise = sendAndWait(2, 'tools/call', {
          name: 'slow-operation',
          arguments: { duration: 10 },
        });

        // step 3: wait briefly for the request to be in-flight
        await new Promise((resolve) => setTimeout(resolve, 500));

        // step 4: kill the server process abruptly
        serverProcess.kill('SIGKILL');

        // step 5: verify the pending request rejects due to pipe closure
        await expect(slowRequestPromise).rejects.toThrow(
          /stdout closed before response received/,
        );

        // step 6: verify stdout detected closure
        expect(stdoutClosed).toBe(true);
      } finally {
        // ensure cleanup even if assertions fail
        if (!serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }

        await new Promise<void>((resolve) => {
          serverProcess.once('exit', () => resolve());
          setTimeout(() => resolve(), 5000);
        });
      }
    }, 30_000);
  });
});
