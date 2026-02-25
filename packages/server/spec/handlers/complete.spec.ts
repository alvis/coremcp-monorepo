import { describe, expect, it } from 'vitest';

import { handleComplete } from '#handlers/complete';

import {
  abort,
  basicCompletionParams,
  session,
  withoutContextCompletionParams,
} from '../fixtures';

import type {
  PromptReference,
  ResourceTemplateReference,
} from '@coremcp/protocol';

type Params = Parameters<typeof handleComplete>[0];
type Context = Parameters<typeof handleComplete>[1];

describe('fn:handleComplete', () => {
  describe('default implementation', () => {
    it('should return empty completion result by default', async () => {
      const context: Context = {
        session,
        abort,
      };

      const result = await handleComplete(basicCompletionParams, context);

      expect(result).toEqual({
        completion: {
          values: [],
          total: 0,
        },
      });
    });

    it('should handle completion without context', async () => {
      const context: Context = {
        session,
        abort,
      };

      const result = await handleComplete(
        withoutContextCompletionParams,
        context,
      );

      expect(result).toEqual({
        completion: {
          values: [],
          total: 0,
        },
      });
    });

    it('should handle different ref types', async () => {
      const refs: Array<PromptReference | ResourceTemplateReference> = [
        { name: 'prompt-ref' } as PromptReference,
        {
          type: 'ref/resource',
          uri: 'resource://ref',
        } as ResourceTemplateReference,
      ];

      for (const ref of refs) {
        const params: Params = {
          ref,
          argument: { name: 'arg', value: 'value' },
        };

        const context: Context = {
          session,
          abort,
        };

        const result = await handleComplete(params, context);
        expect(result.completion.values).toEqual([]);
        expect(result.completion.total).toBe(0);
      }
    });

    it('should handle different argument types', async () => {
      const args = [
        { name: 'string-arg', value: 'string-value' },
        { name: 'number-arg', value: '42' },
        { name: 'boolean-arg', value: 'true' },
      ];

      for (const argument of args) {
        const params: Params = {
          ref: { name: 'test-ref' } as PromptReference,
          argument,
        };

        const context: Context = {
          session,
          abort,
        };

        const result = await handleComplete(params, context);
        expect(result.completion.values).toEqual([]);
        expect(result.completion.total).toBe(0);
      }
    });
  });

  describe('response structure validation', () => {
    it('should always return completion object with values and total', async () => {
      const params: Params = {
        ref: { name: 'test-ref' } as PromptReference,
        argument: { name: 'test-arg', value: 'test-value' },
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleComplete(params, context);

      expect(result).toHaveProperty('completion');
      expect(result.completion).toHaveProperty('values');
      expect(result.completion).toHaveProperty('total');
      expect(Array.isArray(result.completion.values)).toBe(true);
      expect(typeof result.completion.total).toBe('number');
    });

    it('should handle completion requests with context', async () => {
      const params: Params = {
        ref: { name: 'test-ref' } as PromptReference,
        argument: { name: 'test-arg', value: 'test-value' },
        context: { arguments: { contextParam: 'contextValue' } },
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleComplete(params, context);

      expect(result.completion.values).toEqual([]);
      expect(result.completion.total).toBe(0);
    });

    it('should handle different reference types consistently', async () => {
      const refs: Array<PromptReference | ResourceTemplateReference> = [
        { name: 'prompt-ref' } as PromptReference,
        {
          type: 'ref/resource',
          uri: 'resource://test',
        } as ResourceTemplateReference,
      ];

      for (const ref of refs) {
        const params: Params = {
          ref,
          argument: { name: 'arg', value: 'value' },
        };

        const context: Context = {
          session,
          abort,
        };

        const result = await handleComplete(params, context);
        expect(result).toHaveProperty('completion');
        expect(result.completion).toHaveProperty('values');
        expect(result.completion).toHaveProperty('total');
      }
    });

    it('should handle missing context gracefully', async () => {
      const params: Params = {
        ref: { name: 'test-ref' } as PromptReference,
        argument: { name: 'test-arg', value: 'test-value' },
        // no context provided
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleComplete(params, context);

      expect(result.completion.values).toEqual([]);
      expect(result.completion.total).toBe(0);
    });
  });
});
