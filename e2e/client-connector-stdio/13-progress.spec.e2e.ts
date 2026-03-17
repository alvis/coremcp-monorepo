/**
 * progress notification tests for StdioConnector against server-everything
 *
 * validates our client's ability to handle progress notifications during
 * long-running operations from server-everything's longRunningOperation tool.
 * @see /e2e/interactions/13-progress.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 13-progress', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('progress with known total', () => {
    it('should complete longRunningOperation that sends progress notifications [PROGRESS-001]', async () => {
      // server-everything's longRunningOperation sends progress notifications.
      // the connector handles these transparently and returns the final result.
      const result = await ctx.connector.callTool('longRunningOperation', {
        duration: 1,
        steps: 3,
      });

      expect(result.content).toBeDefined();
      const content = result.content!;
      expect(content).toHaveLength(1);

      const textContent = content[0] as { type: string; text: string };

      expect(textContent.type).toBe('text');
      expect(textContent.text).toBe(
        'Long running operation completed. Duration: 1 seconds, Steps: 3.',
      );
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
      const progressContent = result.content!;
      expect(progressContent).toHaveLength(1);

      const textContent = progressContent[0] as { type: string; text: string };

      expect(textContent.type).toBe('text');
      expect(textContent.text).toContain('completed');
    }, 15_000);
  });
});
