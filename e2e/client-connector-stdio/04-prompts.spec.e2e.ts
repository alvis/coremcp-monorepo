/**
 * E2E tests for stdio client connector prompt flows
 *
 * validates prompts/list, prompts/get without arguments, prompts/get with
 * required arguments, prompts/get with optional arguments, and prompt
 * argument definitions using StdioConnector against server-everything
 * over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { Prompt, TextContent } from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/transport-helpers';

// TEST SUITE //

describe('client-connector-stdio / prompts', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('prompts/list', () => {
    it('should list all 3 prompts [PROMPT-001]', async () => {
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBe(3);

      const promptNames = prompts.map((prompt: Prompt) => prompt.name);
      expect(promptNames).toEqual(
        expect.arrayContaining([
          'simple_prompt',
          'complex_prompt',
          'resource_prompt',
        ]),
      );
    });

    it('should include prompt argument definitions [PROMPT-001]', async () => {
      const prompts = await ctx.connector.listPrompts();

      // find complex_prompt and verify its arguments
      const complexPrompt = prompts.find(
        (prompt: Prompt) => prompt.name === 'complex_prompt',
      );
      expect(complexPrompt).toBeDefined();
      expect(complexPrompt!.arguments).toBeDefined();

      // temperature should be required
      const temperatureArg = complexPrompt!.arguments!.find(
        (arg) => arg.name === 'temperature',
      );
      expect(temperatureArg).toEqual(
        expect.objectContaining({
          name: 'temperature',
          required: true,
        }),
      );

      // style should be optional
      const styleArg = complexPrompt!.arguments!.find(
        (arg) => arg.name === 'style',
      );
      expect(styleArg).toEqual(
        expect.objectContaining({
          name: 'style',
        }),
      );
    });
  });

  describe('prompts/get', () => {
    it('should get simple_prompt without arguments [PROMPT-002]', async () => {
      const result = await ctx.connector.getPrompt('simple_prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();
    });

    it('should get complex_prompt with required temperature argument [PROMPT-003]', async () => {
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

    it('should get resource_prompt with resourceId argument [PROMPT-003]', async () => {
      const result = await ctx.connector.getPrompt('resource_prompt', {
        resourceId: '50',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });
  });
});
