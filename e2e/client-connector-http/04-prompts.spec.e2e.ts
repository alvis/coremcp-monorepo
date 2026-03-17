/**
 * E2E tests for HTTP client connector prompt flows
 *
 * validates prompts/list, prompts/get without arguments, prompts/get with
 * required arguments, prompts/get with optional arguments, and prompt
 * argument definitions using HttpMcpConnector against server-everything
 * over HTTP.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { Prompt, TextContent } from '@coremcp/protocol';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITE //

describe('client-connector-http / prompts', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('prompts/list', () => {
    it('should list available prompts [PROMPT-001]', async () => {
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);

      const promptNames = prompts.map((p) => p.name);
      expect(promptNames).toContain('simple_prompt');
      expect(promptNames).toContain('complex_prompt');
    });

    it('should include prompt descriptions and arguments [PROMPT-001]', async () => {
      const prompts = await ctx.connector.listPrompts();
      const complexPrompt = prompts.find(
        (p: Prompt) => p.name === 'complex_prompt',
      );

      expect(complexPrompt).toBeDefined();
      expect(complexPrompt?.description).toBeDefined();
      expect(complexPrompt?.arguments).toBeDefined();
      expect(complexPrompt?.arguments?.length).toBeGreaterThan(0);

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
    });
  });

  describe('prompts/get', () => {
    it('should get simple prompt without arguments [PROMPT-002]', async () => {
      const result = await ctx.connector.getPrompt('simple_prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should get complex prompt with temperature argument [PROMPT-003]', async () => {
      const result = await ctx.connector.getPrompt('complex_prompt', {
        temperature: '0.7',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should get complex prompt with optional style argument [PROMPT-003]', async () => {
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

    it('should get resource prompt with embedded resource [PROMPT-003]', async () => {
      const prompts = await ctx.connector.listPrompts();
      const resourcePrompt = prompts.find((p) => p.name === 'resource_prompt');

      if (resourcePrompt) {
        const result = await ctx.connector.getPrompt('resource_prompt', {
          resourceId: '1',
        });

        expect(result.messages).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      }
    });
  });
});
