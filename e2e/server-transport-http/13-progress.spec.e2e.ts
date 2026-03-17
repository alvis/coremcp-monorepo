/**
 * progress notification tests for the coremcp HTTP server transport via HttpMcpConnector
 *
 * validates progress reporting during long-running operations, progress with
 * known total, and progress without total using the HttpMcpConnector against
 * our coremcp HTTP server.
 * @see /e2e/interactions/13-progress.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerHttpClientContext } from '../fixtures/index';

import type { McpServerNotification } from '@coremcp/protocol';

import type { ServerHttpClientContext } from '../fixtures/index';

// TYPES //

/** progress notification params from the server */
interface ProgressNotificationParams {
  /** token linking this notification to the original request */
  progressToken: string | number;
  /** current progress value */
  progress: number;
  /** total number of steps (if known) */
  total?: number;
}

// TEST SUITES //

describe('server-transport-http / 13-progress', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('progress with known total', () => {
    it('should send progress notifications during long operations [PROGRESS-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies server sends progress notifications with progressToken, progress, and total fields
       * during a long-running operation when the client supplies _meta.progressToken in the request.
       * Per spec, progress values MUST increase with each notification, total is optional but when
       * present indicates the expected final progress value, and progressToken links notifications
       * to the request. ProgressToken is an opaque string | number.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L81 (ProgressToken = string | number)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L859-L893 (ProgressNotificationParams and ProgressNotification)
       */
      const progressNotifications: ProgressNotificationParams[] = [];

      // create a new context with onNotification handler to capture progress
      const progressCtx = await createServerHttpClientContext({
        onNotification: async (notification: McpServerNotification) => {
          if (notification.method === 'notifications/progress') {
            progressNotifications.push(
              notification.params as ProgressNotificationParams,
            );
          }
        },
      });
      await progressCtx.connector.connect();

      try {
        // the connector's request manager automatically adds
        // _meta.progressToken to every request. slow-operation reads this
        // token and emits progress notifications when it is present.
        const result = await progressCtx.connector.callTool('slow-operation', {
          duration: 2,
        });

        const callResult = result as {
          content: Array<{ type: string; text: string }>;
        };

        expect(callResult.content[0].text).toContain('Operation completed');

        // verify progress notifications were received
        expect(progressNotifications.length).toBeGreaterThan(0);

        // verify token is present on all notifications and is the request ID (a number)
        for (const notification of progressNotifications) {
          expect(notification.progressToken).toBeDefined();
          expect(typeof notification.progressToken).toBe('number');
        }

        // verify all notifications carry the same token (they belong to one request)
        const firstToken = progressNotifications[0].progressToken;
        for (const notification of progressNotifications) {
          expect(notification.progressToken).toBe(firstToken);
        }

        // verify progress strictly monotonically increases (spec: "MUST increase")
        for (let i = 1; i < progressNotifications.length; i++) {
          expect(progressNotifications[i].progress).toBeGreaterThan(
            progressNotifications[i - 1].progress,
          );
        }

        // verify total is present (server sends total = 5)
        const lastNotification =
          progressNotifications[progressNotifications.length - 1];
        expect(lastNotification.total).toBeDefined();
        expect(lastNotification.total).toBe(5);
      } finally {
        await progressCtx.teardown();
      }
    }, 30_000);
  });

  describe('progress with unknown total', () => {
    it('should handle progress notifications without total field [PROGRESS-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies progress notifications work correctly when the total field is omitted.
       * Per spec, receivers MAY omit the total value if unknown. Progress values MUST still
       * increase with each notification. The test correctly checks total is undefined and
       * progress monotonically increases.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L870-L876 (total?: number)
       */
      const progressNotifications: ProgressNotificationParams[] = [];

      const progressCtx = await createServerHttpClientContext({
        onNotification: async (notification: McpServerNotification) => {
          if (notification.method === 'notifications/progress') {
            progressNotifications.push(
              notification.params as ProgressNotificationParams,
            );
          }
        },
      });
      await progressCtx.connector.connect();

      try {
        const result = await progressCtx.connector.callTool('slow-operation', {
          duration: 2,
          noTotal: true,
        });

        const callResult = result as {
          content: Array<{ type: string; text: string }>;
        };

        expect(callResult.content[0].text).toContain('Operation completed');

        // verify progress notifications were received
        expect(progressNotifications.length).toBeGreaterThan(0);

        // verify no notification carries a total field
        for (const notification of progressNotifications) {
          expect(notification.total).toBeUndefined();
        }

        // verify progress values are present and monotonically increasing
        for (const notification of progressNotifications) {
          expect(notification.progress).toBeDefined();
          expect(typeof notification.progress).toBe('number');
        }
        for (let i = 1; i < progressNotifications.length; i++) {
          expect(progressNotifications[i].progress).toBeGreaterThan(
            progressNotifications[i - 1].progress,
          );
        }
      } finally {
        await progressCtx.teardown();
      }
    }, 30_000);
  });

  describe('progress resets timeout', () => {
    it.todo(
      'should reset client-side timeout on progress notifications [PROGRESS-003]' +
        ' — requires per-request timeout configuration in HttpMcpConnector' +
        ' (e.g., 3s timeout with a 6s operation; progress keeps it alive)',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * The spec states senders and receivers SHOULD track active progress tokens and
         * recommends implementation of timeout management. This is a client-side behavior
         * not directly testable at the protocol level without per-request timeout config.
         *
         * pseudo-code:
         * 1. Create an HttpMcpConnector with a short per-request timeout (e.g., 3s)
         * 2. Call slow-operation tool that takes 6s but sends progress notifications every 1s
         * 3. Verify the request completes successfully (timeout was reset by each progress notification)
         * 4. Verify that without progress notifications, the same timeout causes the request to fail
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/progress
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L859-L893
         */
      },
    );
  });
});
