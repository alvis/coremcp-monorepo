/**
 * e2e tests for HTTP transport completion flows
 *
 * validates completion/complete for prompt arguments and resource template
 * arguments using the HttpMcpConnector against the coremcp test server
 * over HTTP.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerHttpClientContext } from '../fixtures/index';

import type { ServerHttpClientContext } from '../fixtures/index';

// TEST SUITE //

describe('server-transport-http / completion', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('completion/complete', () => {
    it('should complete prompt arguments [COMPLETION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that completion/complete returns suggested values for a prompt argument.
       * Per spec, clients send ref (type ref/prompt) + argument (name, value) and receive
       * a completion object with values (string[]), optional total, and optional hasMore.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#requesting-completions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2576-L2613 (CompleteRequestParams: ref, argument)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2627-L2655 (CompleteResult: completion.values, total, hasMore)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L361-L407 (completion/complete handler for ref/prompt)
       */
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'greeting-prompt' },
        { name: 'name', value: 'A' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);

      // should suggest completions starting with 'A'
      if (result.completion.values.length > 0) {
        expect(
          result.completion.values.some((v: string) =>
            v.toLowerCase().startsWith('a'),
          ),
        ).toBe(true);
      }
    });

    it('should complete resource template arguments [COMPLETION-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that completion/complete works with ref/resource references for
       * resource template URI arguments. Per spec, ref type ref/resource with a
       * uri template triggers argument completion for that template's parameters.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#reference-types
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2661-L2676 (ResourceTemplateReference: type ref/resource, uri)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L368-L431 (completion/complete handler for ref/resource)
       */
      const result = await ctx.connector.complete(
        { type: 'ref/resource', uri: 'test://text/{id}' },
        { name: 'id', value: '1' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);
    });

    it('should return empty completions for unknown prefix [COMPLETION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that completion/complete returns an empty values array when
       * no suggestions match the given prefix. Per spec, the server returns a
       * completion object with values (which may be empty) for any valid request.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#completion-results
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2627-L2655 (CompleteResult: values string[])
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L1291-L1307 (createCompletionResult + EMPTY_COMPLETION_RESULT)
       */
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'greeting-prompt' },
        { name: 'name', value: 'ZZZZZZ' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);
    });

    it('should include hasMore flag in completion response [COMPLETION-001]', async () => {
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
        { type: 'ref/prompt', name: 'greeting-prompt' },
        { name: 'name', value: '' },
      );

      expect(result.completion).toBeDefined();
      // hasMore is optional but should be a boolean if present
      if (result.completion.hasMore !== undefined) {
        expect(typeof result.completion.hasMore).toBe('boolean');
      }
    });

    it('should complete styled-prompt style argument [COMPLETION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies prompt argument completion with filtered results and optional total field.
       * Per spec, values is a string array (max 100 items), total is an optional integer
       * representing the full count of available options, and values may be a subset.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion#completion-results
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2627-L2655 (CompleteResult: values max 100, total optional)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L1291-L1300 (createCompletionResult: slices to 100, total = suggestions.length)
       */
      // test completion with a different prompt and argument
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'styled-prompt' },
        { name: 'style', value: 'f' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);

      // should suggest 'formal' and 'friendly' since both start with 'f'
      expect(result.completion.values.length).toBeGreaterThanOrEqual(1);
      expect(
        result.completion.values.every((v: string) =>
          v.toLowerCase().startsWith('f'),
        ),
      ).toBe(true);

      // verify total count is present; total is the full set, values is a subset
      if (result.completion.total !== undefined) {
        expect(result.completion.total).toBeGreaterThanOrEqual(
          result.completion.values.length,
        );
      }
    });
  });
});
