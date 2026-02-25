import { describe, expect, it } from 'vitest';

import { handleReadResource } from '#handlers/read-resource';

import { abort, session } from '../fixtures';

type Params = Parameters<typeof handleReadResource>[0];
type Context = Parameters<typeof handleReadResource>[1];

describe('fn:handleReadResource', () => {
  describe('default implementation', () => {
    it('should throw error for any resource URI', async () => {
      const params: Params = {
        uri: 'test://resource',
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleReadResource(params, context)).rejects.toThrow(
        'Resource not found: test://resource',
      );
    });

    it('should throw error with resource URI in message', async () => {
      const params: Params = {
        uri: 'file:///path/to/resource',
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleReadResource(params, context)).rejects.toThrow(
        'Resource not found: file:///path/to/resource',
      );
    });

    it('should handle empty URI', async () => {
      const params: Params = {
        uri: '',
      };

      const context: Context = {
        session,
        abort,
      };

      await expect(handleReadResource(params, context)).rejects.toThrow(
        'Resource not found: ',
      );
    });

    it('should handle different URI schemes', async () => {
      const uris = ['http://example.com', 'file:///test', 'memory://data'];

      for (const uri of uris) {
        const params: Params = {
          uri,
        };

        const context: Context = {
          session,
          abort,
        };

        await expect(handleReadResource(params, context)).rejects.toThrow(
          `Resource not found: ${uri}`,
        );
      }
    });
  });
});
