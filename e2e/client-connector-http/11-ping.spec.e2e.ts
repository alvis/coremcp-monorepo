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
    await expect(ctx.connector.ping()).resolves.toBeUndefined();
  });
});
