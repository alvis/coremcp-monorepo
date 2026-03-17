/**
 * vitest test fixtures for HTTP e2e tests
 *
 * provides pre-configured test instances that automatically create and tear
 * down HTTP client contexts, connecting to the shared servers started by
 * global-setup.ts. tests import the appropriate fixture instead of manually
 * managing server lifecycle.
 */

import { test as base, inject } from 'vitest';

import {
  createClientHttpContext,
  createServerHttpClientContext,
} from './transport-helpers';

import type {
  ClientContextOptions,
  ClientHttpContext,
  ServerHttpClientContext,
  ServerHttpClientContextOptions,
} from './transport-helpers';

// SERVER-TRANSPORT-HTTP FIXTURES //

/**
 * test fixture for server-transport-http tests with default capabilities
 *
 * automatically creates a ServerHttpClientContext connected to the shared
 * coremcp test server, connects the connector, and tears down after each test.
 * provides flattened properties (baseUrl, mcpEndpoint, healthEndpoint, connector)
 * directly in the test destructuring pattern.
 */
export const serverHttpTest = base.extend<
  Omit<ServerHttpClientContext, 'teardown' | 'serverProcess'>
>({
  // eslint-disable-next-line @typescript-eslint/no-empty-pattern -- vitest fixtures require object destructuring ({}) instead of _
  baseUrl: async ({}, use) => {
    const port = inject('coreMcpPort');
    await use(`http://localhost:${port}`);
  },
  mcpEndpoint: async ({ baseUrl }, use) => {
    await use(`${baseUrl}/mcp`);
  },
  healthEndpoint: async ({ baseUrl }, use) => {
    await use(`${baseUrl}/health`);
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-pattern -- vitest fixtures require object destructuring ({}) instead of _
  connector: async ({}, use) => {
    const port = inject('coreMcpPort');
    const context = await createServerHttpClientContext({ port });
    await context.connector.connect();
    await use(context.connector);
    await context.teardown();
  },
});

/**
 * factory test fixture for server-transport-http tests needing custom options
 *
 * provides a createContext factory function that accepts custom capabilities,
 * handlers, or fetch overrides. all contexts are automatically torn down
 * after each test.
 */
export const serverHttpTestWithFactory = base.extend<{
  createContext: (
    options?: Omit<ServerHttpClientContextOptions, 'port'>,
  ) => Promise<ServerHttpClientContext>;
}>({
  // eslint-disable-next-line @typescript-eslint/no-empty-pattern -- vitest fixtures require object destructuring ({}) instead of _
  createContext: async ({}, use) => {
    const port = inject('coreMcpPort');
    const contexts: ServerHttpClientContext[] = [];

    await use(
      async (
        options: Omit<ServerHttpClientContextOptions, 'port'> = {},
      ): Promise<ServerHttpClientContext> => {
        const context = await createServerHttpClientContext({
          ...options,
          port,
        });

        await context.connector.connect();
        contexts.push(context);

        return context;
      },
    );

    for (const context of contexts) {
      await context.teardown();
    }
  },
});

// CLIENT-CONNECTOR-HTTP FIXTURES //

/**
 * test fixture for client-connector-http tests with default capabilities
 *
 * automatically creates a ClientHttpContext connected to the shared
 * server-everything instance, connects the connector, and tears down
 * after each test. provides flattened properties (baseUrl, connector)
 * directly in the test destructuring pattern.
 */
export const clientHttpTest = base.extend<
  Omit<ClientHttpContext, 'teardown' | 'serverProcess'>
>({
  // eslint-disable-next-line @typescript-eslint/no-empty-pattern -- vitest fixtures require object destructuring ({}) instead of _
  baseUrl: async ({}, use) => {
    const port = inject('serverEverythingPort');
    await use(`http://localhost:${port}`);
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-pattern -- vitest fixtures require object destructuring ({}) instead of _
  connector: async ({}, use) => {
    const port = inject('serverEverythingPort');
    const context = await createClientHttpContext({ port });
    await context.connector.connect();
    await use(context.connector);
    await context.teardown();
  },
});

/**
 * factory test fixture for client-connector-http tests needing custom options
 *
 * provides a createContext factory function that accepts custom name,
 * capabilities, or request handlers. all contexts are automatically torn
 * down after each test.
 */
export const clientHttpTestWithFactory = base.extend<{
  createContext: (
    options?: Omit<ClientContextOptions, 'port'>,
  ) => Promise<ClientHttpContext>;
}>({
  // eslint-disable-next-line @typescript-eslint/no-empty-pattern -- vitest fixtures require object destructuring ({}) instead of _
  createContext: async ({}, use) => {
    const port = inject('serverEverythingPort');
    const contexts: ClientHttpContext[] = [];

    await use(
      async (
        options: Omit<ClientContextOptions, 'port'> = {},
      ): Promise<ClientHttpContext> => {
        const context = await createClientHttpContext({ ...options, port });

        await context.connector.connect();
        contexts.push(context);

        return context;
      },
    );

    for (const context of contexts) {
      await context.teardown();
    }
  },
});
