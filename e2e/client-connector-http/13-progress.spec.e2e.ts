/**
 * progress notification tests for HttpMcpConnector against server-everything
 *
 * validates our client's ability to handle progress notifications during
 * long-running operations from server-everything's trigger-long-running-operation tool.
 * @see /e2e/interactions/13-progress.md for interaction specifications
 */

import { describe, expect } from 'vitest';

import { clientHttpTest } from '../fixtures/http-test-fixtures';

// TEST SUITES //

describe('client-connector-http / 13-progress', () => {
  describe('progress with known total', () => {
    clientHttpTest(
      'should complete trigger-long-running-operation that sends progress notifications [PROGRESS-001]',
      async ({ connector }) => {
        // server-everything's trigger-long-running-operation sends progress notifications
        // with progressToken when provided. the connector handles these
        // transparently and returns the final result.
        const result = await connector.callTool(
          'trigger-long-running-operation',
          {
            duration: 1,
            steps: 3,
          },
        );

        expect(result.content).toBeDefined();
        const content = result.content!;
        expect(content).toHaveLength(1);
        expect(content[0]).toMatchObject({
          type: 'text',
          text: expect.stringContaining('completed'),
        });
      },
      15_000,
    );
  });

  describe('progress with unknown total', () => {
    clientHttpTest.todo(
      'should handle progress notifications without total field [PROGRESS-002]',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing connector handling of progress notifications where total is omitted.
         * per spec, receivers MAY omit total when unknown, but server-everything's
         * trigger-long-running-operation always includes a known total derived from steps.
         * pseudo-code:
         * 1. connect to a fixture server whose long-running tool emits notifications/progress with progressToken and progress only
         * 2. invoke that tool through the HttpMcpConnector
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
    clientHttpTest(
      'should receive result after multi-step progress operation [PROGRESS-003]',
      async ({ connector }) => {
        // use a higher step count to generate more progress notifications
        const result = await connector.callTool(
          'trigger-long-running-operation',
          {
            duration: 2,
            steps: 5,
          },
        );

        expect(result.content).toBeDefined();
        const content = result.content!;
        expect(content).toHaveLength(1);

        const textContent = content[0] as { type: string; text: string };

        expect(textContent.type).toBe('text');
        expect(textContent.text).toContain('completed');
      },
      15_000,
    );
  });
});
