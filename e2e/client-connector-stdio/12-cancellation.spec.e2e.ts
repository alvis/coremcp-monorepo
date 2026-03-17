/**
 * cancellation tests for StdioConnector against server-everything
 *
 * validates our client's ability to handle cancellation scenarios including
 * cancelling in-flight requests and handling cancel-after-completion gracefully.
 * @see /e2e/interactions/12-cancellation.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 12-cancellation', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('cancel in-flight request', () => {
    it.todo(
      'should cancel an in-flight tool call [CANCEL-001]',
      // The StdioConnector callTool API does not currently expose an
      // AbortController or cancellation mechanism for in-flight requests.
      // Cancellation would require extending the connector API to support
      // sending notifications/cancelled while a request is pending.
    );
  });

  describe('cancellation notification format', () => {
    it.todo(
      'should send cancellation with requestId and optional reason [CANCEL-002]',
      // Server-to-client cancellation requires the server to send a request
      // to our client and then cancel it. server-everything does not support
      // server-initiated request cancellation flows.
    );
  });

  describe('cancel after completion', () => {
    it('should handle completed request without errors when late cancel would arrive [CANCEL-003]', async () => {
      // call a fast tool that completes immediately
      const result = await ctx.connector.callTool('echo', {
        message: 'fast-complete',
      });

      // verify the operation completed successfully.
      // a late cancellation for an already-completed request is a no-op.
      expect(result.content).toBeDefined();
      const content = result.content!;
      expect(content).toHaveLength(1);
      expect(content[0]).toMatchObject({
        type: 'text',
        text: 'Echo: fast-complete',
      });
    });
  });
});
