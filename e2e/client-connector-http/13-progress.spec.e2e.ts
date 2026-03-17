/**
 * progress notification tests for HttpMcpConnector against server-everything
 *
 * validates our client's ability to handle progress notifications during
 * long-running operations from server-everything's longRunningOperation tool.
 * @see /e2e/interactions/13-progress.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-http / 13-progress', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('progress with known total', () => {
    it('should complete longRunningOperation that sends progress notifications [PROGRESS-001]', async () => {
      // server-everything's longRunningOperation sends progress notifications
      // with progressToken when provided. the connector handles these
      // transparently and returns the final result.
      const result = await ctx.connector.callTool('longRunningOperation', {
        duration: 1,
        steps: 3,
      });

      expect(result.content).toBeDefined();
      const content = result.content!;
      expect(content).toHaveLength(1);
      expect(content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('completed'),
      });
    }, 15_000);
  });

  describe('progress with unknown total', () => {
    it.todo(
      'should handle progress notifications without total field [PROGRESS-002]',
      // server-everything's longRunningOperation always sends progress with
      // a known total (steps parameter). There is no tool available that
      // sends progress without a total value.
    );
  });

  describe('progress percentage updates', () => {
    it('should receive result after multi-step progress operation [PROGRESS-003]', async () => {
      // use a higher step count to generate more progress notifications
      const result = await ctx.connector.callTool('longRunningOperation', {
        duration: 2,
        steps: 5,
      });

      expect(result.content).toBeDefined();
      const content = result.content!;
      expect(content).toHaveLength(1);

      const textContent = content[0] as { type: string; text: string };

      expect(textContent.type).toBe('text');
      expect(textContent.text).toContain('completed');
    }, 15_000);
  });
});
