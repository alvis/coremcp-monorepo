/**
 * elicitation tests for the coremcp stdio client connector against server-everything
 *
 * validates that our StdioConnector correctly handles server-initiated
 * elicitation/create requests. uses onRequest handler with elicitation
 * capability to control client responses per test scenario.
 * @see /e2e/interactions/09-elicitation.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type {
  CallToolResult,
  ElicitResult,
  TextContent,
} from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/index';

// CONSTANTS //

const TOOL_NAME = 'startElicitation';

// TEST SUITES //

describe('client-connector-stdio / 09-elicitation', () => {
  describe('elicitation capability', () => {
    let ctx: ClientStdioContext;

    beforeAll(async () => {
      ctx = createClientStdioContext();
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should connect successfully without elicitation capability [ELICITATION-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector can still connect when elicitation is not advertised.
       * per spec, elicitation is an optional capability and must not block session setup.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L567-L613 (elicitation request handling path)
       */
      // the connector created by createClientStdioContext does not advertise
      // elicitation capability, but connection should still succeed
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should have completed initialization handshake [ELICITATION-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the initialization handshake completed before elicitation tests run.
       * per spec, lifecycle initialization precedes optional client capabilities.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts (InitializeResult)
       */
      expect(ctx.connector.info.serverInfo).not.toBeNull();
      expect(ctx.connector.info.protocolVersion).not.toBeNull();
    });
  });

  describe('form mode elicitation', () => {
    // NOTE: Using onRequest handler with elicitation capability because
    // server-everything requires client to declare elicitation support
    // for startElicitation tool
    let ctx: ClientStdioContext;
    let elicitationResponse: ElicitResult;

    beforeAll(async () => {
      elicitationResponse = {
        action: 'accept',
        content: { name: 'test', email: 'test@example.com' },
      };

      ctx = createClientStdioContext({
        capabilities: { roots: { listChanged: true }, elicitation: {} },
        onRequest: async (request) => {
          if (request.method === 'elicitation/create') {
            return { result: { ...elicitationResponse } };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
      });
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should accept elicitation with form data [ELICITATION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies form-mode elicitation returns an accept response with form data.
       * per spec, clients respond to elicitation/create with accept, decline, or cancel.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#form-mode-elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L567-L613 (elicitInput request/response handling)
       */
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      if (!toolNames.includes(TOOL_NAME)) {
        return;
      }

      elicitationResponse = {
        action: 'accept',
        content: { name: 'test', email: 'test@example.com' },
      };

      const result = (await ctx.connector.callTool(
        TOOL_NAME,
        {},
      )) as CallToolResult;

      expect(result.content).toBeDefined();

      const textBlocks = result.content.filter(
        (c): c is TextContent => c.type === 'text',
      );
      const fullText = textBlocks.map((b) => b.text).join('\n');

      expect(fullText).toContain('accept');
    });
  });

  describe('URL mode elicitation', () => {
    it.todo(
      'should handle URL mode elicitation/create request [ELICITATION-002] - server-everything does not support URL mode elicitation',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing URL-mode elicitation once a fixture can emit elicitation/create
         * with mode:"url". per spec, clients must declare capabilities.elicitation.url and
         * handle url + elicitationId fields in the request payload.
         *
         * pseudo-code:
         * 1. create a stdio client context that declares elicitation.url capability
         * 2. configure onRequest to capture incoming elicitation/create params
         * 3. invoke a fixture tool that sends URL-mode elicitation with mode, url, and elicitationId
         * 4. verify captured params include mode:'url', a valid url, and a unique elicitationId
         * 5. return accept/cancel and verify the originating tool call completes cleanly
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#url-mode-elicitation-requests
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L567-L573 (URL mode branch in elicitInput)
         */
      },
    );
  });

  describe('elicitation complete notification', () => {
    it.todo(
      'should handle notifications/elicitation/complete [ELICITATION-003] - requires URL mode elicitation flow to be initiated first',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing notifications/elicitation/complete after a URL-mode flow.
         * per spec, the notification must carry the original elicitationId from the URL-mode
         * elicitation/create request and clients should ignore unknown or duplicate ids.
         *
         * pseudo-code:
         * 1. create a stdio client context with elicitation.url support and an onNotification capture hook
         * 2. start a URL-mode elicitation flow against a fixture that supports it
         * 3. wait for notifications/elicitation/complete after the out-of-band flow finishes
         * 4. verify the notification includes the expected elicitationId
         * 5. verify duplicate or unknown completion notifications are ignored gracefully
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#completion-notifications-for-url-mode-elicitation
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L623-L640
         */
      },
    );
  });

  describe('user decline/cancel', () => {
    // NOTE: Using onRequest handler with elicitation capability because
    // server-everything requires client to declare elicitation support
    // for startElicitation tool
    let ctx: ClientStdioContext;
    let elicitationResponse: ElicitResult;

    beforeAll(async () => {
      elicitationResponse = { action: 'decline' };

      ctx = createClientStdioContext({
        capabilities: { roots: { listChanged: true }, elicitation: {} },
        onRequest: async (request) => {
          if (request.method === 'elicitation/create') {
            return { result: { ...elicitationResponse } };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
      });
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should send decline action for elicitation [ELICITATION-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the client can return a decline action for elicitation/create.
       * per spec, decline is a valid elicitation outcome.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L567-L613 (elicitInput request/response handling)
       */
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      if (!toolNames.includes(TOOL_NAME)) {
        return;
      }

      elicitationResponse = { action: 'decline' };

      const result = (await ctx.connector.callTool(
        TOOL_NAME,
        {},
      )) as CallToolResult;

      expect(result.content).toBeDefined();

      const textBlocks = result.content.filter(
        (c): c is TextContent => c.type === 'text',
      );
      const fullText = textBlocks.map((b) => b.text).join('\n');

      expect(fullText).toContain('decline');
    });

    it('should send cancel action for elicitation [ELICITATION-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the client can return a cancel action for elicitation/create.
       * per spec, cancel is a valid elicitation outcome.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L567-L613 (elicitInput request/response handling)
       */
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      if (!toolNames.includes(TOOL_NAME)) {
        return;
      }

      elicitationResponse = { action: 'cancel' };

      const result = (await ctx.connector.callTool(
        TOOL_NAME,
        {},
      )) as CallToolResult;

      expect(result.content).toBeDefined();

      const textBlocks = result.content.filter(
        (c): c is TextContent => c.type === 'text',
      );
      const fullText = textBlocks.map((b) => b.text).join('\n');

      expect(fullText).toContain('cancel');
    });
  });

  describe('task-augmented elicitation', () => {
    it.todo(
      'should handle task-augmented elicitation [ELICITATION-005] - requires task support in elicitation handler',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing client-side async elicitation where the client returns a
         * CreateTaskResult instead of an immediate ElicitResult. per spec, the client must
         * declare both elicitation support and capabilities.tasks.requests.elicitation.create.
         *
         * pseudo-code:
         * 1. create a stdio client context with elicitation plus tasks.requests.elicitation.create
         * 2. configure onRequest to return CreateTaskResult with input_required or working status
         * 3. trigger elicitation/create from a task-capable fixture server
         * 4. verify the server receives task metadata instead of an immediate accept/decline/cancel payload
         * 5. verify tasks/get or tasks/result can later resolve the final elicitation outcome
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
         * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1819-L1867 (Task and CreateTaskResult)
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
         */
      },
    );
  });
});
