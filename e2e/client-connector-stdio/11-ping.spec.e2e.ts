/**
 * E2E tests for ping via StdioConnector against server-everything
 *
 * validates client-initiated ping response handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('e2e:client-connector-stdio/ping', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should respond to client-initiated ping [PING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies the client-initiated ping utility succeeds over the connector.
     * per spec, either party can send ping and the receiver MUST reply promptly.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping#behavior-requirements
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L453-L457 (auto pong handler)
     */
    await expect(ctx.connector.ping()).resolves.toBeUndefined();
  });
});
