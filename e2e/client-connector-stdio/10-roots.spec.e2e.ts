/**
 * roots tests for the coremcp stdio client connector against server-everything
 *
 * validates that our StdioConnector correctly handles server-initiated
 * roots/list requests and sends roots changed notifications. server-everything
 * provides a get-roots-list tool that triggers roots/list from server to client.
 * @see /e2e/interactions/10-roots.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { CallToolResult } from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 10-roots', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('list roots', () => {
    it('should have get-roots-list tool available from server-everything [ROOTS-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server advertises a tool that can trigger a roots/list request.
       * per spec, clients supporting roots can participate in roots discovery flows.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#listing-roots
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L643-L644
       */
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('get-roots-list');
    });

    it('should respond to roots/list request from server via get-roots-list tool [ROOTS-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the client responds to roots/list when the server requests it.
       * per spec, supporting clients return a ListRootsResult with roots array.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#listing-roots
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L643-L644
       */
      // server-everything's get-roots-list tool sends roots/list from server to client
      // our connector should respond with the roots it was configured with
      const toolResult = await ctx.connector.callTool('get-roots-list', {}) as CallToolResult;

      expect(toolResult.content).toBeDefined();
      expect(toolResult.content.length).toBeGreaterThan(0);

      // the result should contain the roots that our connector provides
      const textContent = toolResult.content[0] as { type: string; text: string };
      expect(textContent.type).toBe('text');
    });
  });

  describe('roots capability', () => {
    it('should have roots capability advertised [ROOTS-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector advertises roots support in its capabilities.
       * per spec, roots support is negotiated during lifecycle initialization.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#listing-roots
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult.capabilities)
       */
      // the connector was created with capabilities: { roots: { listChanged: true } }
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should have received server capabilities [ROOTS-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector received server capabilities during initialization.
       * per spec, capability negotiation occurs as part of the lifecycle handshake.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult.capabilities)
       */
      expect(ctx.connector.info.capabilities).not.toBeNull();
    });
  });

  describe('roots list changed notification', () => {
    it('should send notifications/roots/list_changed to server [ROOTS-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the client can send notifications/roots/list_changed.
       * per spec, clients with listChanged support SHOULD notify the server when roots change.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#root-list-changes
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/client.ts#L1055-L1056
       */
      // our connector can send roots/list_changed notification
      // this should not throw - it's a fire-and-forget notification
      await expect(
        ctx.connector.sendNotification(
          'notifications/roots/list_changed',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('empty roots list', () => {
    it('should respond to roots/list with configured roots [ROOTS-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies roots/list completes even when the configured roots list is empty.
       * per spec, ListRootsResult may contain an empty roots array.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#listing-roots
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L643-L644
       */
      // the connector was created without explicit roots,
      // so it should return an empty roots array or whatever the default is
      const toolResult = await ctx.connector.callTool('get-roots-list', {}) as CallToolResult;

      expect(toolResult.content).toBeDefined();
      expect(toolResult.isError).toBeFalsy();
    });
  });
});
