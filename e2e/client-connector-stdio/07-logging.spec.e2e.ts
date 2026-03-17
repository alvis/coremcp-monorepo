/**
 * E2E tests for logging via StdioConnector against server-everything
 *
 * validates setting log levels at multiple severity levels.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('e2e:client-connector-stdio/logging', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should set log level to debug [LOGGING-001]', async () => {
    await expect(ctx.connector.setLogLevel('debug')).resolves.toBeUndefined();
  });

  it('should set log level to info [LOGGING-001]', async () => {
    await expect(ctx.connector.setLogLevel('info')).resolves.toBeUndefined();
  });

  it('should set log level to error [LOGGING-001]', async () => {
    await expect(ctx.connector.setLogLevel('error')).resolves.toBeUndefined();
  });
});
