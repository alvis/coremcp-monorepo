/**
 * lifecycle tests for the coremcp stdio client connector
 *
 * validates initialization handshake, protocol version negotiation,
 * capability exchange, server info, and graceful shutdown using our
 * StdioConnector against the server-everything reference server.
 * @see /e2e/interactions/01-lifecycle.md — interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerStdioClientContext,
} from '../fixtures/index';
import { TEST_PROMPTS, TEST_SERVER_INFO, TEST_TOOLS } from '../fixtures/test-server';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 01-lifecycle', () => {
  const ctx: ServerStdioClientContext = createServerStdioClientContext();

  beforeAll(async () => {
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('initialization handshake', () => {
    it('should complete initialize/initialized handshake [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the initialize/initialized handshake completes successfully.
       * per spec, initialization is the first lifecycle exchange and the client
       * must finish the handshake before issuing normal requests.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult / initialization handshake)
       */
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should receive server info after initialization [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the serverInfo payload is available after initialization.
       * per spec, initialize results include server metadata exposed to the client.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult.serverInfo)
       */
      expect(ctx.connector.info.serverInfo).toEqual(expect.objectContaining(TEST_SERVER_INFO));
    });
  });

  describe('protocol version negotiation', () => {
    it('should negotiate a valid protocol version [LIFECYCLE-002]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the negotiated protocol version is present after initialization.
       * per spec, the client and server must agree on a compatible protocol version.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (version fallback during initialize)
       */
      const { protocolVersion } = ctx.connector.info;

      expect(protocolVersion).toBeDefined();
      expect(typeof protocolVersion).toBe('string');
    });
  });

  describe('capability negotiation', () => {
    it('should receive server capabilities [LIFECYCLE-004]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server capabilities object is present after initialization.
       * per spec, capability negotiation happens during lifecycle initialization.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult.capabilities)
       */
      const { capabilities } = ctx.connector.info;

      expect(capabilities).toEqual(
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        }),
      );
    });

    it('should declare tools capability with expected tools [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the tools capability is negotiated and tool listing works.
       * per spec, capability negotiation allows the client to discover tools
       * only after the server advertises support for them.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (tools/list handler)
       */
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));
    });

    it('should declare prompts capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the prompts capability is negotiated and prompt listing works.
       * per spec, capability negotiation gates access to prompts/list.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/list handler)
       */
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);

      const promptNames = prompts.map((p) => p.name);

      expect(promptNames).toEqual(expect.arrayContaining(TEST_PROMPTS));
    });

    it('should declare resources capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the resources capability is negotiated and resource listing works.
       * per spec, capability negotiation gates access to resources/list.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (resources/list handler)
       */
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('server info', () => {
    it('should include server name in info [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the negotiated serverInfo.name matches the expected server name.
       * per spec, initialize results include server identity metadata.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult.serverInfo.name)
       */
      expect(ctx.connector.info.serverInfo?.name).toBe(TEST_SERVER_INFO.name);
    });

    it('should include server version in info [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the negotiated serverInfo.version matches the expected server version.
       * per spec, initialize results include server identity metadata.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult.serverInfo.version)
       */
      expect(ctx.connector.info.serverInfo?.version).toBe(TEST_SERVER_INFO.version);
    });
  });

  describe('shutdown', () => {
    it('should disconnect gracefully [LIFECYCLE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the stdio connector disconnects cleanly after initialization.
       * per spec, stdio lifecycle cleanup closes the transport without requiring
       * any additional MCP protocol exchange.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/stdio.ts (StdioClientTransport close/disconnect path)
       */
      const testCtx = createServerStdioClientContext();
      await testCtx.connector.connect();

      expect(testCtx.connector.info.isConnected).toBe(true);

      await testCtx.connector.disconnect();

      expect(testCtx.connector.info.isConnected).toBe(false);
    }, 60_000);

    it('should handle multiple disconnect calls idempotently [LIFECYCLE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies disconnect remains idempotent when called more than once.
       * per spec, stdio transport shutdown is a cleanup operation and should not
       * require additional protocol traffic on repeated calls.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/stdio.ts (StdioClientTransport close/disconnect path)
       */
      const testCtx = createServerStdioClientContext();
      await testCtx.connector.connect();
      await testCtx.connector.disconnect();

      // second disconnect should not throw
      await expect(testCtx.connector.disconnect()).resolves.toBeUndefined();
    }, 60_000);
  });

  describe('ping', () => {
    it('should respond to ping after initialization [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies client-initiated ping succeeds after the session is initialized.
       * per spec, ping is allowed as a basic utility once the connection exists.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L453-L457 (auto pong handler)
       */
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
