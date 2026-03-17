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
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts debug and resolves cleanly.
     * per spec, clients MAY configure a minimum log level.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler)
     */
    await expect(ctx.connector.setLogLevel('debug')).resolves.toBeUndefined();
  });

  it('should set log level to info [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts info and resolves cleanly.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler)
     */
    await expect(ctx.connector.setLogLevel('info')).resolves.toBeUndefined();
  });

  it('should set log level to error [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts error and resolves cleanly.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler)
     */
    await expect(ctx.connector.setLogLevel('error')).resolves.toBeUndefined();
  });
});
