import { describe, expect, it } from 'vitest';

import { handleSetLevel } from '#handlers/set-level';

import { abort, session } from '../fixtures';

import type { McpLogLevel } from '@coremcp/protocol';

type Params = Parameters<typeof handleSetLevel>[0];

describe('fn:handleSetLevel', () => {
  describe('default implementation', () => {
    it('should resolve without error for any level', async () => {
      const params: Params = {
        level: 'info' as const,
      };

      const context = {
        session,
        abort,
      };

      await expect(handleSetLevel(params, context)).resolves.toEqual({});
    });

    it('should handle different log levels', async () => {
      const levels: McpLogLevel[] = ['error', 'warning', 'info', 'debug'];

      for (const level of levels) {
        const params: Params = {
          level,
        };

        const context = {
          session,
          abort,
        };

        await expect(handleSetLevel(params, context)).resolves.toEqual({});
      }
    });
  });
});
