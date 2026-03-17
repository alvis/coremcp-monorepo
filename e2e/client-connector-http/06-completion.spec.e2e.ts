/**
 * E2E tests for HTTP client connector completion flows
 *
 * validates completion/complete for prompt arguments and resource template
 * arguments using HttpMcpConnector against server-everything over HTTP.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITE //

describe('client-connector-http / completion', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('completion/complete', () => {
    it('should complete prompt argument [COMPLETION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that completion/complete returns filtered values for a prompt argument.
       * Per spec, clients send ref (type ref/prompt) + argument (name, value) and receive
       * a completion object with values (string[]), optional total, and optional hasMore.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#requesting-completions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2576-L2613 (CompleteRequestParams: ref, argument)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2627-L2655 (CompleteResult: completion.values, total, hasMore)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L361-L407 (completion/complete handler for ref/prompt)
       */
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'completable-prompt' },
        { name: 'department', value: 'E' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);

      // should suggest completions starting with 'E'
      expect(result.completion.values.length).toBeGreaterThanOrEqual(1);
      expect(
        result.completion.values.every((v: string) => v.startsWith('E')),
      ).toBe(true);
    });

    it('should return completion values array [COMPLETION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that completion/complete returns a values array for a prompt argument.
       * Per spec, the completion object always contains values (string[]) which may
       * be empty or populated based on the argument prefix.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#completion-results
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2627-L2655 (CompleteResult: values string[])
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L1291-L1307 (createCompletionResult + EMPTY_COMPLETION_RESULT)
       */
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'completable-prompt' },
        { name: 'department', value: 'S' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);
    });

    it('should include hasMore flag when applicable [COMPLETION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the hasMore field in CompleteResult, when present, is a boolean.
       * Per spec, hasMore is optional and indicates whether additional completion
       * options exist beyond the current response. SDK caps values at 100 and sets
       * hasMore = suggestions.length > 100.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#completion-results
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2627-L2655 (CompleteResult.completion.hasMore?: boolean)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L1291-L1300 (createCompletionResult: values capped at 100, hasMore = length > 100)
       */
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'completable-prompt' },
        { name: 'department', value: '' },
      );

      expect(result.completion).toBeDefined();
      // hasMore is optional but should be a boolean if present
      if (result.completion.hasMore !== undefined) {
        expect(typeof result.completion.hasMore).toBe('boolean');
      }
    });

    it('should complete resource template argument [COMPLETION-002]', async () => {
      const templates = await ctx.connector.listResourceTemplates();

      if (templates.length > 0) {
        const template = templates[0];

        const result = await ctx.connector.complete(
          { type: 'ref/resource', uri: template.uriTemplate },
          { name: 'id', value: '1' },
        );

        expect(result.completion).toBeDefined();
        expect(result.completion.values).toBeDefined();
        expect(Array.isArray(result.completion.values)).toBe(true);
      }
    });
  });
});
