import { describe, expect, it } from 'vitest';

import { handleListResources } from '#handlers/list-resources';

import {
  abort,
  session,
  sessionWithCommonResources,
  sessionWithDifferentVersion,
  sessionWithUser,
} from '../fixtures';

type Params = Parameters<typeof handleListResources>[0];
type Context = Parameters<typeof handleListResources>[1];

describe('fn:handleListResources', () => {
  describe('default implementation', () => {
    it('should return empty resources list', async () => {
      const params: Params = {
        cursor: 'test-cursor',
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListResources(params, context);

      expect(result).toEqual({
        resources: [],
      });
    });

    it('should return sliced resources when cursor matches', async () => {
      // use resources from fixtures
      const sessionWithResources = sessionWithCommonResources;

      const params: Params = {
        cursor: 'resource1',
      };

      const context: Context = {
        session: sessionWithResources,
        abort,
      };

      const expected = {
        resources: [
          {
            name: 'resource2',
            description: 'Second resource',
            uri: 'test://resource2',
            mimeType: 'application/json',
          },
          {
            name: 'resource3',
            description: 'Third resource',
            uri: 'test://resource3',
            mimeType: 'text/html',
          },
        ],
      };

      const result = await handleListResources(params, context);

      expect(result).toEqual(expected);
    });

    it('should handle request without cursor', async () => {
      const params: Params = {};

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListResources(params, context);

      expect(result).toEqual({
        resources: [],
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

        const result = await handleListResources(params, context);
        expect(result.resources).toEqual([]);
      }
    });
  });

  describe('response structure validation', () => {
    it('should always return an object with resources array', async () => {
      const params: Params = {
        cursor: 'test-cursor',
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListResources(params, context);

      expect(result).toHaveProperty('resources');
      expect(Array.isArray(result.resources)).toBe(true);
    });

    it('should handle optional cursor parameter', async () => {
      const paramsWithCursor: Params = {
        cursor: 'test-cursor',
      };

      const paramsWithoutCursor: Params = {};

      const context: Context = {
        session,
        abort,
      };

      const resultWithCursor = await handleListResources(
        paramsWithCursor,
        context,
      );
      const resultWithoutCursor = await handleListResources(
        paramsWithoutCursor,
        context,
      );

      expect(resultWithCursor).toHaveProperty('resources');
      expect(resultWithoutCursor).toHaveProperty('resources');
      expect(Array.isArray(resultWithCursor.resources)).toBe(true);
      expect(Array.isArray(resultWithoutCursor.resources)).toBe(true);
    });

    it('should maintain consistent response structure across sessions', async () => {
      const sessions = [session, sessionWithUser, sessionWithDifferentVersion];

      const results = await Promise.all(
        sessions.map(async (s) =>
          handleListResources({}, { session: s, abort }),
        ),
      );

      results.forEach((result) => {
        expect(result).toHaveProperty('resources');
        expect(Array.isArray(result.resources)).toBe(true);
      });
    });
  });
});
