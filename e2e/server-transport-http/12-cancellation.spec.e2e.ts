/**
 * cancellation tests for the coremcp HTTP server transport via raw HTTP session
 *
 * validates client-initiated cancellation of in-flight requests, graceful
 * handling of cancel-after-completion scenarios, and race condition behaviour
 * using the raw HTTP session against our coremcp HTTP server.
 * @see /e2e/interactions/12-cancellation.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createRawHttpSession,
  createServerHttpClientContext,
} from '../fixtures/index';

import type { RawHttpSession, ServerHttpClientContext } from '../fixtures/index';
import type { RequestId } from '@coremcp/protocol';

// TYPES //

/** tool call result containing text content */
interface ToolCallResult {
  /** list of content items returned by the tool */
  content: Array<{ type: string; text: string }>;
}

// CONSTANTS //

/** milliseconds to wait after sending a request before cancelling, balancing reliability vs flakiness */
const CANCEL_DELAY_MS = 300;

/** slow-operation duration in seconds used across cancellation tests */
const SLOW_DURATION_S = 10;

/** maximum elapsed time in milliseconds that confirms cancellation shortened the operation */
const CANCELLATION_CUTOFF_MS = 5_000;

// TEST SUITES //

describe('server-transport-http / 12-cancellation', () => {
  let ctx: ServerHttpClientContext;
  let rawSession: RawHttpSession;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    rawSession = await createRawHttpSession(ctx.mcpEndpoint);
  }, 60_000);

  afterAll(async () => {
    if (rawSession) {
      await rawSession.close();
    }

    if (ctx) {
      await ctx.teardown();
    }
  });

  describe('client cancels in-flight request', () => {
    it('should complete faster than full duration when cancelled mid-flight [CANCEL-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies client-initiated cancellation of an in-flight request via notifications/cancelled.
       * Per spec, either side can send a cancellation notification to indicate a previously-issued
       * request should be terminated. The server SHOULD stop processing and free resources.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation#cancellation-flow
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L313-L338 (CancelledNotificationParamsSchema & CancelledNotificationSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L635-L642 (_oncancel: aborts request via AbortController)
       */

      // measure start time before firing the long-running operation
      const startMs = performance.now();

      // fire the slow operation without awaiting so it stays in-flight
      const slowPromise = rawSession.send('tools/call', {
        name: 'slow-operation',
        arguments: { duration: SLOW_DURATION_S },
      });

      // allow the request to reach the server before sending cancellation
      await new Promise<void>((resolve) => setTimeout(resolve, CANCEL_DELAY_MS));

      const capturedId = rawSession.lastRequestId as RequestId;

      await rawSession.sendNotification('notifications/cancelled', {
        requestId: capturedId,
        reason: 'User cancelled the operation',
      });

      // the server SHOULD cancel early; if it errors that is also acceptable
      await slowPromise.catch((error: unknown) => error);

      const elapsedMs = performance.now() - startMs;

      // cancellation must have shortened the operation — elapsed time must be
      // well below the full 10-second duration to prove it actually cancelled
      expect(elapsedMs).toBeLessThan(CANCELLATION_CUTOFF_MS);
    }, 15_000);
  });

  describe('server cancels client request', () => {
    // SPEC ALIGNMENT: PASS (skipped -- no test infrastructure, but the skip reason is correct)
    /**
     * Server-to-client cancellation: per spec, either side can send notifications/cancelled.
     * This test is correctly skipped because the test server lacks a mechanism to cancel
     * its own in-flight request mid-flight. The spec requirement is acknowledged.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation#cancellation-flow
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L445-L447 (notifications/cancelled handler registered for both sides)
     */
    it.skip(
      'should handle server-to-client cancellation via notifications/cancelled [CANCEL-002]' +
        ' -- Server-to-client cancellation requires the server to (1) send a request' +
        ' to the client (e.g. sampling/createMessage), then (2) send notifications/cancelled' +
        ' for that same request before the client responds. The test server has tools like' +
        ' trigger-sampling that invoke sendServerRequest, but this function blocks until' +
        ' the client responds or times out. There is no tool or mechanism to make the server' +
        ' cancel its own in-flight request mid-flight. Implementing this test would require' +
        ' adding a new tool to test-server.ts (e.g. trigger-sampling-then-cancel) that sends' +
        ' a sampling request and then immediately sends notifications/cancelled, which is' +
        ' outside the ownership scope of this test file.',
    );
  });

  describe('cancel already-completed request', () => {
    it('should ignore cancellation notification for a completed request without errors [CANCEL-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that cancellation of an already-completed request is silently ignored.
       * Per spec, the receiver MAY ignore the cancellation if processing has already completed.
       * The SDK's _oncancel uses optional chaining on the AbortController lookup (controller?.abort),
       * so an unknown/completed requestId is a no-op. The session must remain healthy.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation#behavior-requirements
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L635-L642 (_oncancel: no-op if controller not found)
       */

      // send a fast request and await its completion
      const echoResult = (await rawSession.send('tools/call', {
        name: 'echo',
        arguments: { text: 'fast-request' },
      })) as ToolCallResult;

      // verify the request completed successfully
      expect(echoResult.content[0]?.text).toBe('fast-request');

      // capture the ID of the now-completed request
      const completedId = rawSession.lastRequestId as RequestId;

      // send cancellation AFTER the result has already arrived
      await rawSession.sendNotification('notifications/cancelled', {
        requestId: completedId,
        reason: 'Took too long',
      });

      // verify the session remains healthy by sending another request
      const followUpResult = (await rawSession.send('tools/call', {
        name: 'echo',
        arguments: { text: 'session-still-healthy' },
      })) as ToolCallResult;

      expect(followUpResult.content[0]?.text).toBe('session-still-healthy');
    }, 15_000);
  });

  describe('race condition: response after cancel', () => {
    it('should handle cancel near completion without crashing [CANCEL-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the session handles a cancellation racing with response completion gracefully.
       * Per spec, due to network latency, cancellation notifications may arrive after request
       * processing has completed. Both parties MUST handle these race conditions gracefully.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation#timing-considerations
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L635-L642 (_oncancel: graceful no-op if controller already cleaned up)
       */

      // use a short duration so the cancel may arrive before or after completion
      const raceDurationS = 1;
      const raceDurationMs = raceDurationS * 1000;

      const slowPromise = rawSession.send('tools/call', {
        name: 'slow-operation',
        arguments: { duration: raceDurationS },
      });

      // send cancellation at approximately half the operation's lifetime,
      // creating a genuine race between the response and the cancel notification
      await new Promise<void>((resolve) =>
        setTimeout(resolve, raceDurationMs / 2),
      );

      const capturedId = rawSession.lastRequestId as RequestId;

      await rawSession.sendNotification('notifications/cancelled', {
        requestId: capturedId,
        reason: 'Timeout exceeded',
      });

      // regardless of which side wins the race, neither a result nor an error
      // should cause the session to become unusable
      await slowPromise.catch((error: unknown) => error);

      // verify the session is still operational after the race
      const healthCheckResult = (await rawSession.send('tools/call', {
        name: 'echo',
        arguments: { text: 'post-race-health-check' },
      })) as ToolCallResult;

      expect(healthCheckResult.content[0]?.text).toBe('post-race-health-check');
    }, 15_000);
  });
});
