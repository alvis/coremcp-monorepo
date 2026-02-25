import { describe, expect, it } from 'vitest';

import { handleListPrompts } from '#handlers/list-prompts';

import { abort, session, sessionWithPrompts } from '../fixtures';

type Params = Parameters<typeof handleListPrompts>[0];
type Context = Parameters<typeof handleListPrompts>[1];

describe('fn:handleListPrompts', () => {
  describe('default implementation', () => {
    it('should return empty prompts list', async () => {
      const params: Params = {
        cursor: 'test-cursor',
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListPrompts(params, context);

      expect(result).toEqual({
        prompts: [],
      });
    });

    it('should handle request without cursor', async () => {
      const params: Params = {};

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListPrompts(params, context);

      expect(result).toEqual({
        prompts: [],
      });
    });

    it('should handle different cursor values', async () => {
      const cursors = ['cursor1', 'cursor2', undefined];

      for (const cursor of cursors) {
        const params: Params = {
          cursor,
        };

        const context: Context = {
          session,
          abort,
        };

        const result = await handleListPrompts(params, context);
        expect(result.prompts).toEqual([]);
      }
    });
  });

  describe('with prompts in session', () => {
    it('should handle cursor that exists in prompts list', async () => {
      const params: Params = {
        cursor: 'prompt1',
      };

      const context: Context = {
        session: sessionWithPrompts,
        abort,
      };

      const result = await handleListPrompts(params, context);

      // should return prompts after the cursor
      expect(result).toEqual({
        prompts: [
          { name: 'prompt2', description: 'Second prompt' },
          { name: 'prompt3', description: 'Third prompt' },
        ],
      });
    });

    it('should handle cursor that does not exist in prompts list', async () => {
      const params: Params = {
        cursor: 'nonexistent',
      };

      const context: Context = {
        session: sessionWithPrompts,
        abort,
      };

      const result = await handleListPrompts(params, context);

      // should return empty array when cursor not found
      expect(result).toEqual({
        prompts: [],
      });
    });
  });
});
