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
      // the connector created by createClientStdioContext does not advertise
      // elicitation capability, but connection should still succeed
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should have completed initialization handshake [ELICITATION-001]', () => {
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
    );
  });

  describe('elicitation complete notification', () => {
    it.todo(
      'should handle notifications/elicitation/complete [ELICITATION-003] - requires URL mode elicitation flow to be initiated first',
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
    );
  });
});
