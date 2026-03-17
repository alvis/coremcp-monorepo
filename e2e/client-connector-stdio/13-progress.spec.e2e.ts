/**
 * progress notification tests for StdioConnector against the test server
 *
 * validates our client's ability to handle progress notifications during
 * long-running operations from the test server's slow-operation tool.
 * @see /e2e/interactions/13-progress.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 13-progress', () => {
  const ctx: ServerStdioClientContext = createServerStdioClientContext();

  beforeAll(async () => {
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('progress with known total', () => {
    it('should complete slow-operation that sends progress notifications [PROGRESS-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the connector handles progress notifications during a long-running tool call.
       * per spec, progress notifications may include progressToken, progress, and total.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L859-L893 (ProgressNotification params)
       */
      // the test server's slow-operation sends progress notifications when a progressToken is present.
      // the connector handles these transparently and returns the final result.
      const result = await ctx.connector.callTool('slow-operation', {
        duration: 1,
      });

      expect(result.content).toBeDefined();
      const content = result.content!;
      expect(content).toHaveLength(1);

      const textContent = content[0] as { type: string; text: string };

      expect(textContent.type).toBe('text');
      expect(textContent.text).toBe(
        'Operation completed after 1 second(s)',
      );
    }, 15_000);
  });

  describe('progress with unknown total', () => {
    it.todo(
      'should handle progress notifications without total field [PROGRESS-002]',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing connector handling of progress notifications where total is omitted.
         * per spec, receivers MAY omit total when unknown, but the test server's
         * slow-operation includes a known total derived from PROGRESS_TOTAL_STEPS by default.
         *
         * pseudo-code:
         * 1. connect to a fixture server whose long-running tool emits notifications/progress with progressToken and progress only
         * 2. invoke that tool through the StdioConnector
         * 3. verify progress notifications without total do not cause parse or state errors
         * 4. verify progress values increase monotonically and the final result still resolves
         * 5. verify the connector remains usable for subsequent requests
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L870-L876 (total?: number)
         */
      },
    );
  });

  describe('progress percentage updates', () => {
    it('should receive result after multi-step progress operation [PROGRESS-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the final result is returned after a multi-step progress flow.
       * per spec, progress notifications are advisory and do not replace the final response.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L859-L893 (ProgressNotification params)
       */
      // use a longer duration to generate more progress notifications
      const result = await ctx.connector.callTool('slow-operation', {
        duration: 2,
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
