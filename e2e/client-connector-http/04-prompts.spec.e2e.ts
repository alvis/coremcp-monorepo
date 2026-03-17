/**
 * E2E tests for HTTP client connector prompt flows
 *
 * validates prompts/list, prompts/get without arguments, prompts/get with
 * required arguments, prompts/get with optional arguments, and prompt
 * argument definitions using HttpMcpConnector against server-everything
 * over HTTP.
 */

import { describe, expect } from 'vitest';

import { clientHttpTest } from '../fixtures/http-test-fixtures';

import type { Prompt, TextContent } from '@coremcp/protocol';

// CONSTANTS //

/** prompt names provided by server-everything */
const SERVER_EVERYTHING_PROMPTS = [
  'simple-prompt',
  'args-prompt',
  'completable-prompt',
  'resource-prompt',
];

// TEST SUITE //

describe('client-connector-http / prompts', () => {
  describe('prompts/list', () => {
    clientHttpTest('should list all prompts [PROMPT-001]', async ({ connector }) => {
      const prompts = await connector.listPrompts();

      expect(prompts.length).toBe(SERVER_EVERYTHING_PROMPTS.length);

      const promptNames = prompts.map((prompt: Prompt) => prompt.name);
      expect(promptNames).toEqual(
        expect.arrayContaining(SERVER_EVERYTHING_PROMPTS),
      );
    });

    clientHttpTest('should include prompt argument definitions [PROMPT-001]', async ({ connector }) => {
      const prompts = await connector.listPrompts();

      // find args-prompt and verify its arguments
      const argsPrompt = prompts.find(
        (prompt: Prompt) => prompt.name === 'args-prompt',
      );
      expect(argsPrompt).toBeDefined();
      expect(argsPrompt!.arguments).toBeDefined();

      // city should be required
      const cityArg = argsPrompt!.arguments!.find(
        (arg) => arg.name === 'city',
      );
      expect(cityArg).toEqual(
        expect.objectContaining({
          name: 'city',
          required: true,
        }),
      );
    });
  });

  describe('prompts/get', () => {
    clientHttpTest('should get simple-prompt without arguments [PROMPT-002]', async ({ connector }) => {
      const result = await connector.getPrompt('simple-prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();
    });

    clientHttpTest('should get args-prompt with required city argument [PROMPT-003]', async ({ connector }) => {
      const result = await connector.getPrompt('args-prompt', {
        city: 'Portland',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');

      // the prompt should include the city value
      const content = firstMessage.content as TextContent;
      expect(content.text).toContain('Portland');
    });

    clientHttpTest('should get args-prompt with optional state argument [PROMPT-003]', async ({ connector }) => {
      const result = await connector.getPrompt('args-prompt', {
        city: 'Portland',
        state: 'Oregon',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.text).toContain('Portland');
      expect(content.text).toContain('Oregon');
    });

    clientHttpTest('should get completable-prompt with department and name [PROMPT-003]', async ({ connector }) => {
      const result = await connector.getPrompt('completable-prompt', {
        department: 'Engineering',
        name: 'Alice',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.text).toContain('Alice');
      expect(content.text).toContain('Engineering');
    });
  });
});
