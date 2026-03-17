/**
 * lifecycle tests for the coremcp HTTP client connector
 *
 * validates initialization handshake, protocol version negotiation,
 * capability exchange, server info, and graceful shutdown using our
 * HttpMcpConnector against the server-everything reference server.
 * @see /e2e/interactions/01-lifecycle.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-http / 01-lifecycle', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('initialization handshake', () => {
    it('should complete initialize/initialized handshake [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector completes the MCP initialize/initialized handshake
       * and transitions to a connected state.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L195-L232 (connect performs initialize then stores server state)
       */
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should have received server info after initialization [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the initialize response surfaces serverInfo after a successful
       * connection handshake.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L168-L185 (InitializeResult.serverInfo)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L223-L227 (connect caches serverInfo)
       */
      const { serverInfo } = ctx.connector.info;

      expect(serverInfo).not.toBeNull();
      expect(serverInfo?.name).toBe('mcp-servers/everything');
    });
  });

  describe('protocol version negotiation', () => {
    it('should negotiate a valid protocol version [LIFECYCLE-002]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector exposes the negotiated protocol version returned
       * by initialize.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L171-L177 (InitializeResult.protocolVersion)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L222-L227 (connect stores protocolVersion)
       */
      const { protocolVersion } = ctx.connector.info;

      expect(protocolVersion).toBeDefined();
      expect(protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('capability negotiation', () => {
    it('should receive server capabilities [LIFECYCLE-004]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies initialize returns server capabilities and the connector caches
       * them on the active connection.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L171-L177 (InitializeResult.capabilities)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L224-L227 (connect caches capabilities)
       */
      const { capabilities } = ctx.connector.info;

      expect(capabilities).not.toBeNull();
      expect(capabilities?.tools).toBeDefined();
      expect(capabilities?.prompts).toBeDefined();
      expect(capabilities?.resources).toBeDefined();
    });

    it('should declare tools capability with expected structure [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies listTools is available after initialization and returns the
       * connected server's tool catalog.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#listing-tools
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L701-L710 (ListToolsRequest/ListToolsResult)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L365-L369 (listTools)
       */
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get-sum');
    });

    it('should declare prompts capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies listPrompts is available after initialization and returns the
       * connected server's prompt catalog.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#listing-prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L573-L580 (ListPromptsRequest/ListPromptsResult)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L332-L337 (listPrompts)
       */
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should declare resources capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies listResources is available after initialization and returns the
       * connected server's resource catalog.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#listing-resources
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L358-L366 (ListResourcesRequest/ListResourcesResult)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L349-L354 (listResources)
       */
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('server info', () => {
    it('should include server name in info [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connected server's implementation metadata includes a
       * stable name in the initialize result.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L171-L177 (InitializeResult.serverInfo)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L223-L227 (connect caches serverInfo.name)
       */
      expect(ctx.connector.info.serverInfo?.name).toBeDefined();
      expect(typeof ctx.connector.info.serverInfo?.name).toBe('string');
    });
  });

  describe('graceful shutdown', () => {
    it('should disconnect cleanly [LIFECYCLE-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies disconnect tears down the active session and clears connector
       * state cleanly.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#operation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L244-L271 (disconnect resets session state)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connection.ts#L101-L121 (disconnect removes the server connection)
       */
      const freshCtx = await createClientHttpContext({ name: 'shutdown-test' });
      await freshCtx.connector.connect();

      expect(freshCtx.connector.info.isConnected).toBe(true);

      await freshCtx.connector.disconnect();

      expect(freshCtx.connector.info.isConnected).toBe(false);

      await freshCtx.teardown();
    });

    it('should reconnect after disconnect [LIFECYCLE-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector can disconnect and then establish a fresh
       * connection again without losing normal request handling.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#operation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L244-L271 (disconnect then reconnect resets session state)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connection.ts#L101-L121 (connection manager disconnect/reconnect flow)
       */
      const freshCtx = await createClientHttpContext({
        name: 'reconnect-test',
      });
      await freshCtx.connector.connect();

      expect(freshCtx.connector.info.isConnected).toBe(true);

      await freshCtx.connector.disconnect();

      expect(freshCtx.connector.info.isConnected).toBe(false);

      await freshCtx.connector.connect();

      expect(freshCtx.connector.info.isConnected).toBe(true);

      const tools = await freshCtx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      await freshCtx.teardown();
    });
  });

  describe('ping', () => {
    it('should respond to ping after initialization [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector can issue a ping after initialization and receive
       * the expected empty response.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L457-L460 (ping)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L297-L303 (PingRequest)
       */
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
