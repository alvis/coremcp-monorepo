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
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts debug on a connected client.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L372-L377 (setLogLevel)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L93-L106 (logging/setLevel request)
     */
    await expect(ctx.connector.setLogLevel('debug')).resolves.toBeUndefined();
  });

  it('should set log level to info [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts info on a connected client.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L372-L377 (setLogLevel)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L93-L106 (logging/setLevel request)
     */
    await expect(ctx.connector.setLogLevel('info')).resolves.toBeUndefined();
  });

  it('should set log level to warning [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts warning on a connected client.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L372-L377 (setLogLevel)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L93-L106 (logging/setLevel request)
     */
    await expect(ctx.connector.setLogLevel('warning')).resolves.toBeUndefined();
  });

  it('should set log level to error [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies logging/setLevel accepts error on a connected client.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L372-L377 (setLogLevel)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L93-L106 (logging/setLevel request)
     */
    await expect(ctx.connector.setLogLevel('error')).resolves.toBeUndefined();
  });
});
