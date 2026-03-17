/**
 * roots tests for the coremcp stdio server transport via StdioConnector
 *
 * validates server-initiated roots/list requests triggered via
 * the trigger-roots-list tool over stdio transport. the StdioConnector
 * acts as the client, responding to roots/list requests.
 * @see /e2e/interactions/10-roots.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('server-transport-stdio / 10-roots', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext({
      capabilities: { roots: { listChanged: true } },
      onRequest: async (request) => {
        if (request.method === 'roots/list') {
          return {
            result: {
              roots: [{ uri: 'file:///home/user/project', name: 'project' }],
            },
          };
        }

        throw new Error(`Unexpected request: ${request.method}`);
      },
    });
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('list roots', () => {
    it('should send roots/list to client and receive roots result [ROOTS-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies server can send roots/list request to client and receive a valid result.
       * per spec, servers can request the list of roots from supporting clients.
       * The server sends roots/list, and the client responds with a ListRootsResult containing roots array.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#listing-roots
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L643-L644
       */
      const result = (await ctx.connector.callTool(
        'trigger-roots-list',
        {},
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content).toBeDefined();
      expect(result.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Roots received'),
        }),
      );
    });

    it('should receive a valid roots structure from client [ROOTS-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the roots/list response contains a valid Root structure with uri and name fields.
       * per spec, each Root has a required uri (must be a file:// URI) and optional name field.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#root
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L643-L644
       */
      const result = (await ctx.connector.callTool(
        'trigger-roots-list',
        {},
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      const responseText = result.content[0].text;

      expect(responseText).toContain('Roots received');

      // extract the JSON payload from the response text
      const jsonMatch = /Roots received: (.+)$/.exec(responseText);
      expect(jsonMatch).not.toBeNull();

      const rootsPayload = JSON.parse(jsonMatch![1]) as {
        roots: Array<{ uri: string; name: string }>;
      };

      expect(rootsPayload).toEqual({
        roots: [{ uri: 'file:///home/user/project', name: 'project' }],
      });
    });
  });

  describe('roots list changed notification', () => {
    it('should send notifications/roots/list_changed to server [ROOTS-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies client can send notifications/roots/list_changed to the server.
       * per spec, when the list of roots changes, the client that supports listChanged
       * SHOULD send a notification to inform the server. This is a fire-and-forget notification.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#root-list-changes
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/client.ts#L1055-L1056
       */
      // the connector can send roots/list_changed notification
      // this should not throw - it's a fire-and-forget notification
      await expect(
        ctx.connector.sendNotification('notifications/roots/list_changed'),
      ).resolves.toBeUndefined();
    });

    it('should complete end-to-end roots flow after list_changed notification [ROOTS-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies end-to-end flow: client sends list_changed notification, then server
       * re-requests roots/list and receives updated roots. per spec, after receiving a
       * list_changed notification, the server can re-request the root list to get updates.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#root-list-changes
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/client.ts#L1055-L1056
       */
      // send notification to inform server that roots have changed
      await ctx.connector.sendNotification('notifications/roots/list_changed');

      // trigger the server to request the updated roots from the client
      const result = (await ctx.connector.callTool(
        'trigger-roots-list',
        {},
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      // verify the server received the roots from the client
      expect(result.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Roots received'),
        }),
      );
    });
  });

  describe('empty roots list', () => {
    let emptyCtx: ServerStdioClientContext;

    beforeAll(async () => {
      emptyCtx = createServerStdioClientContext({
        capabilities: { roots: { listChanged: true } },
        onRequest: async (request) => {
          if (request.method === 'roots/list') {
            return {
              result: {
                roots: [],
              },
            };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
      });
      await emptyCtx.connector.connect();
    }, 30_000);

    afterAll(async () => {
      await emptyCtx.teardown();
    });

    it('should handle empty roots list from client [ROOTS-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies server handles an empty roots array from the client gracefully.
       * per spec, the roots array in ListRootsResult may be empty, indicating
       * the client has no filesystem roots available.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/roots#listing-roots
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L643-L644
       */
      const result = (await emptyCtx.connector.callTool(
        'trigger-roots-list',
        {},
      )) as {
        content: Array<{ type: string; text: string }>;
      };

      expect(result.content).toBeDefined();
      expect(result.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Roots received'),
        }),
      );
    });
  });
});
