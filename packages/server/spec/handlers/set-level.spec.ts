import { Session } from '@coremcp/core';
import { describe, expect, it } from 'vitest';

import { handleSetLevel } from '#handlers/set-level';

import { abort, sessionContext, sessionData } from '../fixtures';

import type { McpLogLevel } from '@coremcp/protocol';

type Params = Parameters<typeof handleSetLevel>[0];

describe('fn:handleSetLevel', () => {
  it('should resolve without error for any level', async () => {
    const session = new Session(sessionData, sessionContext);
    const params: Params = {
      level: 'info' as const,
    };

    const context = {
      session,
      abort,
    };

    await expect(handleSetLevel(params, context)).resolves.toEqual({});
  });

  it('should set session logLevel to the requested level', async () => {
    const session = new Session(sessionData, sessionContext);
    const params: Params = {
      level: 'warning',
    };

    const context = {
      session,
      abort,
    };

    await handleSetLevel(params, context);

    expect(session.logLevel).toBe('warning');
  });

  it('should handle different log levels', async () => {
    const levels: McpLogLevel[] = ['error', 'warning', 'info', 'debug'];

    for (const level of levels) {
      const session = new Session(sessionData, sessionContext);
      const params: Params = {
        level,
      };

      const context = {
        session,
        abort,
      };

      await handleSetLevel(params, context);

      expect(session.logLevel).toBe(level);
    }
  });
});
