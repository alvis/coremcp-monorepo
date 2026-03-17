/**
 * E2E tests for logging via HttpMcpConnector against server-everything
 *
 * validates setting log levels at multiple severity levels.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('e2e:client-connector-http/logging', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
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

  it('should set log level to warning [LOGGING-001]', async () => {
    await expect(ctx.connector.setLogLevel('warning')).resolves.toBeUndefined();
  });

  it('should set log level to error [LOGGING-001]', async () => {
    await expect(ctx.connector.setLogLevel('error')).resolves.toBeUndefined();
  });
});
