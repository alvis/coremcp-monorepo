/**
 * transport tests for the coremcp stdio server transport via native connector
 *
 * validates stdio-specific transport behavior including stdin/stdout message
 * exchange, rapid sequential messages, connection stability after errors,
 * and concurrent operations using our StdioConnector as the client.
 * @see /e2e/interactions/02-transport.md for interaction specifications
 */

import { spawn } from 'node:child_process';

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import {
  createServerStdioClientContext,
  getStdioServerConfig,
  CLIENT_INFO,
} from '../fixtures/index';

import {
  TEST_TOOLS,
  TEST_PROMPTS,
  TEST_RESOURCES,
} from '../fixtures/test-server';

import type { ChildProcess } from 'node:child_process';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('server-transport-stdio / 02-transport', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('basic message exchange', () => {
    it('should accept JSON-RPC messages on stdin and respond on stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies basic stdio transport: the server reads JSON-RPC from stdin and
       * writes responses to stdout. Per spec, the server reads JSON-RPC messages
       * from its stdin and sends messages to its stdout; messages are delimited
       * by newlines and MUST NOT contain embedded newlines.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L33-L64 (ondata reads chunks, processReadBuffer dispatches messages)
       */
      // the connector writes JSON-RPC to stdin and reads from stdout.
      // a successful tool call proves the bidirectional communication works.
      const result = await ctx.connector.callTool('echo', {
        text: 'stdin-stdout-test',
      });

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual({
        type: 'text',
        text: 'stdin-stdout-test',
      });
    });

    it('should handle tools/list via stdin/stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that tools/list works over stdio transport. Per spec, the server
       * reads JSON-RPC messages from stdin and sends messages to stdout, with
       * messages delimited by newlines.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L56-L64 (processReadBuffer reads and dispatches)
       */
      const tools = await ctx.connector.listTools();

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));
    });

    it('should handle resources/list via stdin/stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that resources/list works over stdio transport. Per spec, the
       * server reads JSON-RPC messages from stdin and sends messages to stdout.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L56-L64 (processReadBuffer reads and dispatches)
       */
      const resources = await ctx.connector.listResources();

      const resourceUris = resources.map((r) => r.uri);

      expect(resourceUris).toEqual(expect.arrayContaining(TEST_RESOURCES));
    });

    it('should handle prompts/list via stdin/stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that prompts/list works over stdio transport. Per spec, the
       * server reads JSON-RPC messages from stdin and sends messages to stdout.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L56-L64 (processReadBuffer reads and dispatches)
       */
      const prompts = await ctx.connector.listPrompts();

      const promptNames = prompts.map((p) => p.name);

      expect(promptNames).toEqual(expect.arrayContaining(TEST_PROMPTS));
    });
  });

  describe('resource reading via stdio', () => {
    it('should read text resource via stdin/stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies reading a text resource over stdio transport. Per spec, the
       * server reads JSON-RPC messages from stdin and sends messages to stdout;
       * messages are delimited by newlines and MUST NOT contain embedded newlines.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (send method serializes and writes to stdout)
       */
      const result = await ctx.connector.readResource('test://text/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe('test://text/1');
      expect(content.mimeType).toBe('text/plain');
      expect('text' in content && content.text).toContain(
        'Text content for resource 1',
      );
    });

    it('should read binary resource via stdin/stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies reading a binary resource (base64-encoded) over stdio transport.
       * Per spec, the server reads JSON-RPC messages from stdin and sends messages
       * to stdout; messages are delimited by newlines and MUST NOT contain embedded
       * newlines. Binary data is base64-encoded within the JSON-RPC message.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (send method serializes and writes to stdout)
       */
      const result = await ctx.connector.readResource('test://binary/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe('test://binary/1');
      expect(content.mimeType).toBe('image/png');
      expect('blob' in content && content.blob).toBeDefined();
    });
  });

  describe('rapid messages', () => {
    it('should handle parallel inspector invocations [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS (implementation-specific behavior, not explicitly specified)
      /**
       * verifies that the stdio transport handles multiple concurrent messages.
       * Per spec, the server reads JSON-RPC messages from stdin and sends
       * messages to stdout. The spec does not explicitly address concurrency
       * over stdio, but JSON-RPC message IDs enable multiplexing over the
       * single stdin/stdout channel.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L56-L64 (processReadBuffer handles messages sequentially)
       */
      const [echoResult1, echoResult2, addResult, tools, prompts] =
        await Promise.all([
          ctx.connector.callTool('echo', { text: 'rapid-1' }),
          ctx.connector.callTool('echo', { text: 'rapid-2' }),
          ctx.connector.callTool('add', { a: 5, b: 7 }),
          ctx.connector.listTools(),
          ctx.connector.listPrompts(),
        ]);

      // verify all requests completed successfully
      expect(tools.length).toBeGreaterThan(0);
      expect(prompts.length).toBeGreaterThan(0);

      // verify echo results
      expect(echoResult1.content).toBeDefined();
      expect(echoResult1.content![0]).toEqual(
        expect.objectContaining({ type: 'text', text: 'rapid-1' }),
      );
      expect(echoResult2.content).toBeDefined();
      expect(echoResult2.content![0]).toEqual(
        expect.objectContaining({ type: 'text', text: 'rapid-2' }),
      );

      // verify add result
      expect(addResult.content).toBeDefined();
      expect(addResult.content![0]).toEqual(
        expect.objectContaining({ type: 'text', text: '12' }),
      );
    });
  });

  describe('connection stability after errors', () => {
    it('should continue functioning after error response [TRANSPORT-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the stdio transport remains functional after an error
       * response. Per spec, the server MUST NOT write anything to its stdout
       * that is not a valid MCP message. JSON-RPC errors are valid MCP messages,
       * so the connection should remain open and functional afterward.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (send writes any JSONRPCMessage including errors)
       */
      // trigger an error by calling unknown tool
      await expect(
        ctx.connector.callTool('nonexistent-tool', {}),
      ).rejects.toThrow();

      // connection should still be active
      expect(ctx.connector.info.isConnected).toBe(true);

      // subsequent request should still succeed
      const result = await ctx.connector.callTool('echo', {
        text: 'after-error',
      });

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual(
        expect.objectContaining({ type: 'text', text: 'after-error' }),
      );
    });
  });

  describe('numeric computation via stdio', () => {
    it('should handle numeric tool arguments correctly [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS (implementation-specific behavior, not explicitly specified)
      /**
       * verifies that numeric arguments are correctly serialized and deserialized
       * over stdio transport. Per spec, MCP uses JSON-RPC (UTF-8 encoded) and
       * messages are newline-delimited JSON on stdin/stdout, so numeric types
       * must be preserved through JSON serialization.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L88-L92 (serializeMessage produces JSON)
       */
      const result = await ctx.connector.callTool('add', { a: 17, b: 25 });

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual({
        type: 'text',
        text: '42',
      });
    });
  });

  describe('invalid JSON handling', () => {
    it('should respond with parse error -32700 for invalid JSON [TRANSPORT-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server responds with JSON-RPC parse error (-32700)
       * when receiving invalid JSON on stdin. Per spec, the client MUST NOT
       * write anything to the server's stdin that is not a valid MCP message.
       * The JSON-RPC 2.0 spec requires error code -32700 for parse errors.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/stdio.ts (ReadBuffer.readMessage throws on invalid JSON)
       */
      const config = getStdioServerConfig();
      const serverProcess: ChildProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      let stdoutBuffer = '';

      // first initialize the server so it is ready
      const initPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for initialize response'));
        }, 15_000);

        serverProcess.stdout?.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
              continue;
            }

            try {
              const parsed = JSON.parse(trimmed) as { id?: number };

              // initialize response has id=1
              if (parsed.id === 1) {
                clearTimeout(timeout);
                stdoutBuffer = '';
                resolve();

                return;
              }
            } catch {
              // not a complete JSON line yet
            }
          }
        });
      });

      serverProcess.stdin?.write(
        `${JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: CLIENT_INFO,
          },
        })}\n`,
      );

      await initPromise;

      // send initialized notification
      serverProcess.stdin?.write(
        `${JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          method: 'notifications/initialized',
        })}\n`,
      );

      // now send invalid JSON
      const parseErrorPromise = new Promise<{
        error?: { code: number; message: string };
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for parse error response'));
        }, 10_000);

        serverProcess.stdout?.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');

          // keep only the last incomplete line
          stdoutBuffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
              continue;
            }

            try {
              const parsed = JSON.parse(trimmed) as {
                error?: { code: number; message: string };
              };

              if (parsed.error) {
                clearTimeout(timeout);
                resolve(parsed);

                return;
              }
            } catch {
              // not a complete JSON line yet
            }
          }
        });
      });

      serverProcess.stdin?.write('this is not valid json\n');

      const errorResponse = await parseErrorPromise;

      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error!.code).toBe(-32700);

      serverProcess.kill('SIGTERM');
    }, 30_000);
  });

  describe('ping via stdio', () => {
    it('should handle ping request via stdin/stdout [TRANSPORT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that ping works over stdio transport. Per spec, the server
       * reads JSON-RPC messages from stdin and sends messages to stdout.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/stdio.ts#L56-L64 (processReadBuffer reads and dispatches messages)
       */
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
