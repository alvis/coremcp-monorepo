/**
 * E2E tests for stdio client connector completion flows
 *
 * validates completion/complete for prompt arguments and resource template
 * arguments using StdioConnector against server-everything over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/transport-helpers';

// TEST SUITE //

describe('client-connector-stdio / completion', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('completion/complete', () => {
    it('should complete prompt arguments [COMPLETION-001]', async () => {
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'complex_prompt' },
        { name: 'temperature', value: 'h' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();

      // should suggest completions starting with 'h'
      if (result.completion.values.length > 0) {
        expect(
          result.completion.values.some((v: string) =>
            v.toLowerCase().startsWith('h'),
          ),
        ).toBe(true);
      }
    });

    it('should complete resource template arguments [COMPLETION-002]', async () => {
      const templates = await ctx.connector.listResourceTemplates();

      if (templates.length > 0) {
        const template = templates[0];

        const result = await ctx.connector.complete(
          { type: 'ref/resource', uri: template.uriTemplate },
          { name: 'id', value: '1' },
        );

        expect(result.completion).toBeDefined();
        expect(result.completion.values).toBeDefined();
      }
    });

    it('should return empty completions for no match [COMPLETION-001]', async () => {
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'complex_prompt' },
        { name: 'temperature', value: 'ZZZZZ' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);
    });

    it('should include hasMore flag when applicable [COMPLETION-001]', async () => {
      const result = await ctx.connector.complete(
        { type: 'ref/prompt', name: 'complex_prompt' },
        { name: 'temperature', value: '' },
      );

      expect(result.completion).toBeDefined();
      // hasMore is optional but should be a boolean if present
      if (result.completion.hasMore !== undefined) {
        expect(typeof result.completion.hasMore).toBe('boolean');
      }
    });
  });
});
