import { Session } from '@coremcp/core';
import { describe, expect, it } from 'vitest';

import { handleListResourceTemplates } from '#handlers/list-resource-templates';

import { abort, session, sessionContext, sessionData } from '../fixtures';

type Params = Parameters<typeof handleListResourceTemplates>[0];
type Context = Parameters<typeof handleListResourceTemplates>[1];

describe('fn:handleListResourceTemplates', () => {
  describe('default implementation', () => {
    it('should return empty resource templates list', async () => {
      const params: Params = {
        cursor: 'test-cursor',
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListResourceTemplates(params, context);

      expect(result).toEqual({
        resourceTemplates: [],
      });
    });

    it('should return sliced resource templates when cursor matches', async () => {
      const mockResourceTemplates = {
        template1: {
          name: 'template1',
          description: 'First template',
          uriTemplate: 'test://template1/{id}',
        },
        template2: {
          name: 'template2',
          description: 'Second template',
          uriTemplate: 'test://template2/{id}',
        },
        template3: {
          name: 'template3',
          description: 'Third template',
          uriTemplate: 'test://template3/{id}',
        },
      };

      // create a new session with resourceTemplates
      const sessionWithTemplates = new Session(
        {
          ...sessionData,
          resourceTemplates: Object.values(mockResourceTemplates),
        },
        sessionContext,
      );

      // set the resourceTemplates using the setter
      sessionWithTemplates.resourceTemplates = mockResourceTemplates;

      const params: Params = {
        cursor: 'template1',
      };

      const context: Context = {
        session: sessionWithTemplates,
        abort,
      };

      const expected = {
        resourceTemplates: [
          {
            name: 'template2',
            description: 'Second template',
            uriTemplate: 'test://template2/{id}',
          },
          {
            name: 'template3',
            description: 'Third template',
            uriTemplate: 'test://template3/{id}',
          },
        ],
      };

      const result = await handleListResourceTemplates(params, context);

      expect(result).toEqual(expected);
    });

    it('should handle request without cursor', async () => {
      const params: Params = {};

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListResourceTemplates(params, context);

      expect(result).toEqual({
        resourceTemplates: [],
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

        const result = await handleListResourceTemplates(params, context);
        expect(result.resourceTemplates).toEqual([]);
      }
    });
  });
});
