/**
 * E2E tests for ping via HttpMcpConnector against server-everything
 *
 * validates client-initiated ping response handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('e2e:client-connector-http/ping', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should respond to client-initiated ping [PING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies the connector can send ping and receive the expected empty
     * response after initialization.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping#behavior-requirements
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L297-L303 (PingRequest)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L457-L460 (ping)
     */
    await expect(ctx.connector.ping()).resolves.toBeUndefined();
  });
});
