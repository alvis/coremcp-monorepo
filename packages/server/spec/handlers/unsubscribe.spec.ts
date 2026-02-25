import { describe, expect, it } from 'vitest';

import { handleUnsubscribe } from '#handlers/unsubscribe';

import { abort, session } from '../fixtures';

type Params = Parameters<typeof handleUnsubscribe>[0];

describe('fn:handleUnsubscribe', () => {
  describe('default implementation', () => {
    it('should resolve without error for any URI', async () => {
      const params: Params = {
        uri: 'test://resource',
      };

      const context = {
        session,
        abort,
      };

      await expect(handleUnsubscribe(params, context)).resolves.toEqual({});
    });

    it('should handle different URI schemes', async () => {
      const uris = ['http://example.com', 'file:///test', 'memory://data'];

      for (const uri of uris) {
        const params: Params = {
          uri,
        };

        const context = {
          session,
          abort,
        };

        await expect(handleUnsubscribe(params, context)).resolves.toEqual({});
      }
    });

    it('should handle empty URI', async () => {
      const params: Params = {
        uri: '',
      };

      const context = {
        session,
        abort,
      };

      await expect(handleUnsubscribe(params, context)).resolves.toEqual({});
    });
  });
});
