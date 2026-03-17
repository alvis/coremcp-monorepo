/**
 * E2E tests for stdio client connector prompt flows
 *
 * validates prompts/list, prompts/get without arguments, prompts/get with
 * required arguments, prompts/get with optional arguments, and prompt
 * argument definitions using StdioConnector against the coremcp test server
 * over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';

import { TEST_PROMPTS } from '../fixtures/test-server';

import type { Prompt, TextContent } from '@coremcp/protocol';

import type { ServerStdioClientContext } from '../fixtures/transport-helpers';

// TEST SUITE //

describe('client-connector-stdio / prompts', () => {
  const ctx: ServerStdioClientContext = createServerStdioClientContext();

  beforeAll(async () => {
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('prompts/list', () => {
    it('should list all prompts [PROMPT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies prompts/list returns the expected prompt set.
       * per spec, clients use prompts/list to discover available prompts.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#listing-prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/list handler)
       */
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBe(TEST_PROMPTS.length);

      const promptNames = prompts.map((prompt: Prompt) => prompt.name);
      expect(promptNames).toEqual(
        expect.arrayContaining(TEST_PROMPTS),
      );
    });

    it('should include prompt argument definitions [PROMPT-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies prompt listings include argument metadata for required fields.
       * per spec, prompts may expose argument definitions with required flags.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#listing-prompts
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/list handler)
       */
      const prompts = await ctx.connector.listPrompts();

      // find greeting-prompt and verify its arguments
      const greetingPrompt = prompts.find(
        (prompt: Prompt) => prompt.name === 'greeting-prompt',
      );
      expect(greetingPrompt).toBeDefined();
      expect(greetingPrompt!.arguments).toBeDefined();

      // name should be required
      const nameArg = greetingPrompt!.arguments!.find(
        (arg) => arg.name === 'name',
      );
      expect(nameArg).toEqual(
        expect.objectContaining({
          name: 'name',
          required: true,
        }),
      );
    });
  });

  describe('prompts/get', () => {
    it('should get simple-prompt without arguments [PROMPT-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies prompts/get returns messages for a prompt with no arguments.
       * per spec, prompt responses contain a messages array with typed content.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/get handler)
       */
      const result = await ctx.connector.getPrompt('simple-prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();
    });

    it('should get complex_prompt with required temperature argument [PROMPT-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies prompts/get interpolates required arguments into the response.
       * per spec, prompt arguments are supplied via params.arguments and consumed
       * by the server when rendering the prompt.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/get handler)
       */
      const result = await ctx.connector.getPrompt('complex_prompt', {
        temperature: 'hot',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');

      // the prompt should include the temperature value
      const content = firstMessage.content as TextContent;
      expect(content.text).toContain('hot');
    });

    it('should get complex_prompt with optional style argument [PROMPT-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies prompts/get accepts optional arguments and renders them into content.
       * per spec, prompt arguments may be optional and are applied when present.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/get handler)
       */
      const result = await ctx.connector.getPrompt('complex_prompt', {
        temperature: 'cold',
        style: 'formal',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.text).toContain('cold');
      expect(content.text).toContain('formal');
    });

    it('should get greeting-prompt with name argument [PROMPT-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies prompts/get applies the supplied name argument.
       * per spec, the response should reflect provided prompt arguments.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/prompts#getting-a-prompt
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (prompts/get handler)
       */
      const result = await ctx.connector.getPrompt('greeting-prompt', {
        name: 'Alice',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.text).toContain('Alice');
    });
  });
});
