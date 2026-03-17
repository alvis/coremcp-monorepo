/**
 * E2E tests for ping via stdio transport using StdioConnector
 *
 * validates client-initiated ping and server-initiated ping (via trigger-ping tool)
 * against the coremcp test server.
 */

import { spawn } from 'node:child_process';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';

import { createServerStdioClientContext, getStdioServerConfig, CLIENT_INFO } from '../fixtures/index';

import type { ServerStdioClientContext } from '../fixtures/index';

// TYPES //

/** text content item from tool result */
interface TextContentItem {
  type: 'text';
  text: string;
}

/** tool call result shape */
interface ToolCallResult {
  content: TextContentItem[];
}

// TEST SUITES //

describe('server-transport-stdio / ping', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should respond to client-initiated ping [PING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies the server responds to a client-initiated ping with an empty result.
     * Per spec, either party can send a ping and the receiver MUST respond promptly
     * with an empty response {}.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping#behavior-requirements
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L670-L677 (PingRequestSchema)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L453-L457 (auto pong handler)
     */

    await expect(ctx.connector.ping()).resolves.toBeUndefined();
  });

  it('should handle server-initiated ping via trigger-ping [PING-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies server-initiated ping works (server pings client via trigger-ping tool).
     * Per spec, either party (client or server) can initiate a ping. The receiver
     * MUST respond promptly with an empty response {}.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping#overview
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L470-L471 (Server.ping() sends ping to client)
     */

    const result = (await ctx.connector.callTool(
      'trigger-ping',
    )) as ToolCallResult;

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Ping sent and response received',
    });
  });

  it('should respond to ping before notifications/initialized is sent [PING-001]', async () => {
    // NOTE: labeled PING-001 edge case ("ping during initialization") — PING-003 in the interaction
    // spec covers "Ping Timeout" (MAY level, no coverage required). This test validates the
    // PING-001 edge case: "Ping during initialization (before notifications/initialized) — server MUST still respond".
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies the server responds to ping even before notifications/initialized is sent.
     * Per lifecycle spec, the client SHOULD NOT send requests other than pings before
     * the server responds to initialize; the server SHOULD NOT send requests other than
     * pings and logging before receiving initialized. Ping is explicitly exempted.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L453-L457 (auto pong handler, registered unconditionally)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L280-L282 (no capability required for ping)
     */

    const config = getStdioServerConfig();

    // spawn a fresh server to control the handshake manually
    const serverProcess = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    try {
      // helper to read a single JSON-RPC response from stdout
      const readResponse = (): Promise<{ id: number; result?: unknown; error?: unknown }> =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            serverProcess.stdout!.removeListener('data', onData);
            reject(new Error('Timed out waiting for response'));
          }, 15_000);

          let buffer = '';
          const onData = (chunk: Buffer): void => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();

              if (!trimmed) {
                continue;
              }

              try {
                const parsed = JSON.parse(trimmed) as { id: number; result?: unknown; error?: unknown };
                clearTimeout(timeout);
                serverProcess.stdout!.removeListener('data', onData);
                resolve(parsed);

                return;
              } catch {
                // not complete JSON yet
              }
            }
          };

          serverProcess.stdout!.on('data', onData);
        });

      // send initialize (but do NOT send notifications/initialized)
      serverProcess.stdin!.write(
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

      const initResult = await readResponse();

      expect(initResult.id).toBe(1);
      expect(initResult.result).toBeDefined();

      // send ping WITHOUT having sent notifications/initialized
      serverProcess.stdin!.write(
        `${JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 2,
          method: 'ping',
        })}\n`,
      );

      const pingResult = await readResponse();

      expect(pingResult.id).toBe(2);
      expect(pingResult.result).toEqual({});
    } finally {
      serverProcess.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const fallback = setTimeout(() => {
          if (!serverProcess.killed) {
            serverProcess.kill('SIGKILL');
          }

          resolve();
        }, 5000);

        serverProcess.once('exit', () => {
          clearTimeout(fallback);
          resolve();
        });
      });
    }
  }, 30_000);
});
