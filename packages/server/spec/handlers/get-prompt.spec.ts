import { describe, expect, it } from 'vitest';

import { handleGetPrompt } from '#handlers/get-prompt';

import { abort, session } from '../fixtures';

type Params = Parameters<typeof handleGetPrompt>[0];
type Context = Parameters<typeof handleGetPrompt>[1];

describe('fn:handleGetPrompt', () => {
  describe('default implementation', () => {
    it('should throw error for any prompt name', async () => {
      const params: Params = {
        name: 'test-prompt',
        arguments: { input: 'test-value' },
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleGetPrompt(params, context)).rejects.toThrow(
        'Prompt not found: test-prompt',
      );
    });

    it('should throw error with prompt name in message', async () => {
      const params: Params = {
        name: 'my-custom-prompt',
        arguments: { param1: 'value1' },
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleGetPrompt(params, context)).rejects.toThrow(
        'Prompt not found: my-custom-prompt',
      );
    });

    it('should handle prompt without arguments', async () => {
      const params: Params = {
        name: 'no-args-prompt',
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleGetPrompt(params, context)).rejects.toThrow(
        'Prompt not found: no-args-prompt',
      );
    });

    it('should handle empty prompt name', async () => {
      const params: Params = {
        name: '',
        arguments: { input: 'test' },
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleGetPrompt(params, context)).rejects.toThrow(
        'Prompt not found: ',
      );
    });
  });
});
