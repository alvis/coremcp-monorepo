/**
 * E2E tests for ping via HTTP transport using HttpMcpConnector
 *
 * validates client-initiated ping and server-initiated ping (via trigger-ping tool)
 * against the coremcp test server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';

import { createServerHttpClientContext, CLIENT_INFO } from '../fixtures/index';

import type { ServerHttpClientContext } from '../fixtures/index';

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

describe('e2e:server-transport-http/ping', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

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

    const result = await ctx.connector.callTool(
      'trigger-ping',
    );

    const toolResult = result as ToolCallResult;
    expect(toolResult.content).toHaveLength(1);
    expect(toolResult.content[0]).toEqual({
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

    // perform only the initialize request without sending notifications/initialized
    const initResponse = await fetch(ctx.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
      },
      body: JSON.stringify({
        jsonrpc: JSONRPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        },
      }),
    });

    const sessionId = initResponse.headers.get('Mcp-Session-Id');

    expect(sessionId).toBeDefined();

    // send ping without having sent notifications/initialized
    const pingResponse = await fetch(ctx.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        'Mcp-Session-Id': sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: JSONRPC_VERSION,
        id: 2,
        method: 'ping',
      }),
    });

    // the spec says the server SHOULD respond to ping even before full initialization
    expect(pingResponse.status).toBe(200);

    const pingBody = (await pingResponse.json()) as { id: number; result: Record<string, never> };

    expect(pingBody.id).toBe(2);
    expect(pingBody.result).toEqual({});
  });
});
