/**
 * E2E tests for HTTP transport prompt flows
 *
 * validates prompts/list, prompts/get without arguments, prompts/get with
 * required arguments, prompts/get with optional arguments, cursor-based
 * pagination, and list_changed notification using the HttpMcpConnector
 * against the coremcp test server over HTTP.
 */

import { describe, expect, inject } from 'vitest';

import { serverHttpTest } from '../fixtures/http-test-fixtures';
import { createServerHttpClientContext } from '../fixtures/index';
import { TEST_PROMPTS } from '../fixtures/test-server';

import type { McpServerNotification, TextContent } from '@coremcp/protocol';

// TEST SUITE //

describe('prompts/list', () => {
  serverHttpTest(
    'should list all prompts [PROMPT-001]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that prompts/list returns all registered prompts with their names.
       * per spec, clients send a prompts/list request to retrieve available prompts;
       * server responds with an array of Prompt objects containing name, optional title,
       * optional description, optional arguments, and optional icons fields.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#listing-prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L532-L545 (prompts/list handler returns name, title, description, arguments)
       */
      const prompts = await connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);

      const names = prompts.map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining(TEST_PROMPTS));
    },
  );

  serverHttpTest(
    'should include prompt argument definitions [PROMPT-001]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that prompt listings include argument definitions with name, required fields.
       * per spec, prompts may include an arguments array where each argument has name,
       * optional description, and optional required boolean.
       * The test correctly checks a specific prompt has description and arguments with required flag.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#listing-prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L532-L545 (prompts/list handler derives arguments from schema via promptArgumentsFromSchema)
       */
      const prompts = await connector.listPrompts();

      const greetingPrompt = prompts.find((p) => p.name === 'greeting-prompt');

      expect(greetingPrompt).toBeDefined();
      expect(greetingPrompt!.description).toEqual(expect.any(String));
      expect(greetingPrompt!.arguments).toBeDefined();

      const nameArg = greetingPrompt!.arguments!.find((a) => a.name === 'name');
      expect(nameArg).toEqual(
        expect.objectContaining({
          name: 'name',
          required: true,
        }),
      );
    },
  );
});

describe('prompts/get', () => {
  serverHttpTest(
    'should get prompt without arguments [PROMPT-002]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that prompts/get returns messages for a prompt that takes no arguments.
       * per spec, prompts/get returns a result with optional description and messages array
       * containing PromptMessage objects with role (user/assistant) and content fields.
       * The test correctly checks role, content.type, and content.text.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L547-L559 (prompts/get handler resolves prompt and calls handler)
       */
      const result = await connector.getPrompt('simple-prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();

      const content = firstMessage.content as TextContent;
      expect(content.type).toBe('text');
      expect(content.text).toContain('simple prompt');
    },
  );

  serverHttpTest(
    'should get prompt with required arguments [PROMPT-003]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that prompts/get correctly interpolates required arguments into messages.
       * per spec, prompts/get accepts a params.arguments object and the server uses those
       * values to populate the prompt template. The test passes { name: 'Alice' } and
       * verifies 'Alice' appears in the response text.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L547-L559 (prompts/get handler parses args and calls prompt callback)
       */
      const result = await connector.getPrompt('greeting-prompt', {
        name: 'Alice',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.type).toBe('text');
      expect(content.text).toContain('Alice');
    },
  );

  serverHttpTest(
    'should get prompt with optional arguments [PROMPT-003]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that prompts/get handles optional arguments correctly.
       * per spec, prompt arguments may be optional (required: false or omitted);
       * the server uses provided optional arguments to customize the response.
       * The test passes style and format arguments and verifies the response length.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L547-L559 (prompts/get handler parses args and calls prompt callback)
       */
      const result = await connector.getPrompt('styled-prompt', {
        style: 'formal',
        format: 'long',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.type).toBe('text');
      // formal long message should be more verbose
      expect(content.text.length).toBeGreaterThan(20);
    },
  );
});

describe('prompts/list pagination', () => {
  serverHttpTest(
    'should return all prompts in a single page when count equals PAGE_SIZE [PROMPT-001]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies pagination behavior when all prompts fit on a single page.
       * per spec, prompts/list supports pagination with cursor/nextCursor;
       * when all items fit in one page, nextCursor should be absent (undefined).
       * The test correctly validates that all prompts are returned and nextCursor is absent.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#listing-prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L532-L545 (prompts/list handler)
       */
      // server has exactly 3 prompts and PAGE_SIZE=3, so everything fits on one page
      const firstPage = await connector.sendRequest<{
        prompts: Array<{ name: string; description?: string }>;
        nextCursor?: string;
      }>({ method: 'prompts/list', params: {} });

      expect(firstPage.prompts.length).toBe(TEST_PROMPTS.length);
      expect(firstPage.nextCursor).toBeUndefined();

      const names = firstPage.prompts.map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining(TEST_PROMPTS));
    },
  );
});

describe('prompts/list_changed notification', () => {
  serverHttpTest(
    'should receive list_changed notification when triggered [PROMPT-004]',
    async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server sends notifications/prompts/list_changed when
       * the list of available prompts changes.
       * per spec, servers that declare capabilities.prompts.listChanged emit this notification
       * with no params. The test correctly verifies the notification is received after triggering.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#list-changed-notification
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L677-L678 (sendPromptListChanged sends notifications/prompts/list_changed)
       */
      const notifications: McpServerNotification[] = [];

      const notifyContext = await createServerHttpClientContext({
        port: inject('coreMcpPort'),
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyContext.connector.connect();

        await notifyContext.connector.callTool('trigger-list-changed', {
          target: 'prompts',
        });

        // allow time for the notification to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        const listChangedNotifications = notifications.filter(
          (n) => n.method === 'notifications/prompts/list_changed',
        );
        expect(listChangedNotifications.length).toBeGreaterThanOrEqual(1);
      } finally {
        await notifyContext.teardown();
      }
    },
    30_000,
  );
});
