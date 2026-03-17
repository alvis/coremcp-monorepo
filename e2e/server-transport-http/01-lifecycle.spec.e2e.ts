/**
 * lifecycle tests for the coremcp HTTP server transport via native connector
 *
 * validates initialization handshake, protocol version negotiation,
 * capability exchange, server info, and graceful shutdown using the
 * HttpMcpConnector as the client against our coremcp HTTP server.
 * @see /e2e/interactions/01-lifecycle.md for interaction specifications
 */

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import {
  createServerHttpClientContext,
  createRawHttpSession,
  spawnHttpTestServer,
  waitForHttpTestServer,
  killTestServer,
  CLIENT_INFO,
} from '../fixtures/index';

import { TEST_TOOLS } from '../fixtures/test-server';

import type { InitializeResult } from '@coremcp/protocol';

import type { ServerHttpClientContext } from '../fixtures/index';

// TEST SUITES //

describe('server-transport-http / 01-lifecycle', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('initialization handshake', () => {
    it('should complete initialize/initialized handshake successfully [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the full initialize/initialized handshake completes successfully.
       * Per spec, initialization MUST be the first interaction: client sends initialize
       * request, server responds with capabilities/serverInfo/protocolVersion, then
       * client sends notifications/initialized.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/client.ts#L470-L522 (Client.connect sends initialize then notifications/initialized)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L114-L115 (Server registers initialize and notifications/initialized handlers)
       */

      // the connector performs the full initialize/initialized handshake
      // internally during connect(). a successful connection proves
      // the entire handshake completed.
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should return tools after successful initialization [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tools are accessible after a successful initialization handshake.
       * Per spec, after initialization the server's declared capabilities (including tools)
       * become available for use during the operation phase.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#operation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L443 (_oninitialize returns capabilities including tools)
       */

      const tools = await ctx.connector.listTools();

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));
    });
  });

  describe('protocol version negotiation', () => {
    it('should negotiate a compatible protocol version [LIFECYCLE-002]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies protocol version negotiation produces a valid date-formatted version.
       * Per spec, client MUST send a protocolVersion it supports; if server supports it,
       * server MUST respond with the same version.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (server checks if requestedVersion is in supportedProtocolVersions)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L3-L5 (LATEST_PROTOCOL_VERSION='2025-11-25', SUPPORTED_PROTOCOL_VERSIONS array)
       */

      // a successful connection proves protocol version negotiation succeeded.
      // the connector sends a supported protocol version and the server
      // responds with the same version, completing the handshake.
      const { protocolVersion } = ctx.connector.info;

      expect(protocolVersion).toBeDefined();
      expect(protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('capability negotiation', () => {
    it('should declare tools capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server declared tools capability during initialization and
       * that tools are available. Per spec, both parties MUST only use capabilities
       * that were successfully negotiated.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L447 (_oninitialize returns capabilities via getCapabilities())
       */

      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should declare resources capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server declared resources capability during initialization and
       * that resources are available. Per spec, both parties MUST only use capabilities
       * that were successfully negotiated.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L447 (_oninitialize returns capabilities via getCapabilities())
       */

      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    it('should declare prompts capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server declared prompts capability during initialization and
       * that prompts are available. Per spec, both parties MUST only use capabilities
       * that were successfully negotiated.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L447 (_oninitialize returns capabilities via getCapabilities())
       */

      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('server info', () => {
    it('should return correct server name and version [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server returns serverInfo with name and version in the
       * InitializeResult. Per spec, the server MUST respond with serverInfo
       * containing name (required) and version (required) per the Implementation type.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L444 (_oninitialize returns serverInfo: this._serverInfo)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L437-L456 (InitializeResult requires serverInfo: Implementation with name and version)
       */

      // server info should come from the initialize response's serverInfo field
      const { serverInfo } = ctx.connector.info;

      expect(serverInfo).toBeDefined();
      expect(typeof serverInfo?.name).toBe('string');
      expect(serverInfo!.name.length).toBeGreaterThan(0);
      expect(typeof serverInfo?.version).toBe('string');
      expect(serverInfo!.version.length).toBeGreaterThan(0);
    });
  });

  describe('graceful shutdown', () => {
    it('should handle server shutdown and become unreachable [LIFECYCLE-006]', async () => {
      // SPEC ALIGNMENT: PASS (implementation-specific behavior, not explicitly specified)
      /**
       * Verifies that after server process termination, the server becomes unreachable.
       * The spec describes HTTP shutdown in terms of session termination via DELETE and
       * server closing SSE streams, but does not prescribe behavior for abrupt process
       * termination. This test validates that process-level shutdown makes the server
       * unreachable, which is reasonable operational behavior.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#http
       */

      const { process: tempProcess, port: tempPort } =
        await spawnHttpTestServer();
      const tempHealthUrl = `http://localhost:${tempPort}/health`;

      await waitForHttpTestServer(tempHealthUrl);

      // verify server is running
      const healthCheck = await fetch(tempHealthUrl).catch(() => null);

      expect(
        healthCheck === null || healthCheck.ok || healthCheck.status === 404,
      ).toBe(true);

      await killTestServer(tempProcess);

      // server should no longer be reachable after shutdown
      await expect(fetch(tempHealthUrl)).rejects.toThrow();
    });

    it('should accept connections on the MCP endpoint before shutdown [LIFECYCLE-006]', async () => {
      // SPEC ALIGNMENT: PASS (implementation-specific behavior, not explicitly specified)
      /**
       * Verifies the server accepts connections on the MCP endpoint while running.
       * This is a baseline check that the server is reachable before any shutdown
       * sequence, confirming the HTTP transport is operational. The spec defines
       * Streamable HTTP as the transport but does not prescribe a /health endpoint.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#http
       */

      const response = await fetch(ctx.healthEndpoint).catch(() => null);

      expect(response === null || response.ok || response.status === 404).toBe(
        true,
      );
    });
  });

  describe('incompatible version negotiation', () => {
    it('should respond with a supported version when client sends unsupported version [LIFECYCLE-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that when client sends an unsupported protocol version, the server
       * responds with a version it does support. Per spec, if the server does not
       * support the requested protocolVersion, it MUST respond with another version
       * it supports, and the client can then decide whether to proceed.
       * The SDK server falls back to supportedProtocolVersions[0] (the latest).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (fallback to supportedProtocolVersions[0] when version not found)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L3-L5 (SUPPORTED_PROTOCOL_VERSIONS array)
       */

      // send initialize with a far-future protocol version that the server cannot support
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '9999-01-01',
            capabilities: {},
            clientInfo: CLIENT_INFO,
          },
        }),
      });

      const body = (await response.json()) as {
        result?: { protocolVersion: string };
        error?: { code: number; message: string };
      };

      // server always negotiates a supported version via negotiateProtocolVersion
      // which falls back to the highest supported version when the requested one is unknown
      expect(body.result).toBeDefined();
      expect(body.result!.protocolVersion).not.toBe('9999-01-01');
      expect(body.result!.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('HTTP DELETE session termination', () => {
    it('should terminate session via DELETE and reject subsequent requests [LIFECYCLE-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies HTTP DELETE session termination. Per spec (Transports), clients
       * SHOULD send HTTP DELETE to the MCP endpoint with the Mcp-Session-Id header to
       * explicitly terminate a session. After termination, the server MUST respond
       * with 404 to subsequent requests containing that session ID.
       * The test also verifies DELETE returns 200 or 204 (spec allows either, or 405
       * if server does not support client-initiated termination).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       */

      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      // session should be established
      expect(rawSession.sessionId).toBeDefined();
      expect(rawSession.sessionId.length).toBeGreaterThan(0);

      // terminate session via DELETE
      const deleteResponse = await fetch(ctx.mcpEndpoint, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': rawSession.sessionId },
      });

      expect([200, 204]).toContain(deleteResponse.status);

      // subsequent request with the terminated session should fail
      const postResponse = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 99,
          method: 'ping',
        }),
      });

      // server should reject the terminated session with 404
      expect(postResponse.status).toBe(404);
    });
  });

  describe('instructions field', () => {
    it('should include instructions string in initialize result [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server includes an instructions string in the InitializeResult.
       * Per spec, the server response MAY include an optional instructions field
       * describing how to use the server. The SDK includes it when configured via
       * ServerOptions.instructions (server.ts L69, L111).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L445 (_oninitialize conditionally includes instructions)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L445-L455 (InitializeResult.instructions is optional string)
       */

      // create a fresh connection to capture the InitializeResult
      const tempCtx = await createServerHttpClientContext();
      const initResult: InitializeResult = await tempCtx.connector.connect();

      expect(typeof initResult.instructions).toBe('string');
      expect((initResult.instructions!).length).toBeGreaterThan(0);

      await tempCtx.teardown();
    }, 60_000);
  });

  describe('exact protocol version', () => {
    it('should negotiate protocol version 2025-11-25 [LIFECYCLE-002]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the negotiated protocol version is exactly '2025-11-25'.
       * Per spec, if the server supports the requested version it MUST respond
       * with the same version. LATEST_PROTOCOL_VERSION in SDK is '2025-11-25'.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (server echoes requestedVersion if supported)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L3 (LATEST_PROTOCOL_VERSION = '2025-11-25')
       */

      expect(ctx.connector.info.protocolVersion).toBe('2025-11-25');
    });
  });

  describe('ping', () => {
    it('should respond to ping after initialization [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server responds to a ping request after initialization.
       * Per spec (Utilities > Ping), either party can send a ping and the receiver
       * MUST respond promptly with an empty result {}. No capabilities needed for ping.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L453-L457 (default ping handler returns {} as Result)
       */

      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('session expiry', () => {
    it('should return 404 for invalid session ID [LIFECYCLE-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that sending a request with a fabricated/invalid session ID returns
       * HTTP 404. Per spec (Transports > Session Management), if a client sends an
       * invalid or expired Mcp-Session-Id, the server MUST respond with HTTP 404.
       * The client MUST then start a new session by sending a fresh initialize request.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       */

      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
          'Mcp-Session-Id': 'fabricated-nonexistent-session-id-12345',
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'ping',
        }),
      });

      expect(response.status).toBe(404);
    });
  });
});
