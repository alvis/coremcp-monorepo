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
    await expect(ctx.connector.ping()).resolves.toBeUndefined();
  });
});
