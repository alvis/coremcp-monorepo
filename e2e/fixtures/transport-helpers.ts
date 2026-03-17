/**
 * standard setup helpers for each test directory
 *
 * provides consistent context creation and teardown patterns for
 * server-transport and client-connector test suites.
 */

import { HttpMcpConnector } from '@coremcp/client-http';
import { StdioConnector } from '@coremcp/client-stdio';

import {
  CLIENT_INFO,
  getStdioServerConfig,
  killServer,
  killTestServer,
  spawnHttpServer,
  spawnHttpTestServer,
  waitForHttpTestServer,
  waitForServer,
} from './index';

import type { ChildProcess } from 'node:child_process';

import type { OnNotification, OnRequest } from '@coremcp/client';
import type { ClientCapabilities } from '@coremcp/protocol';

// TYPES //

/** context for client-side HTTP tests using HttpMcpConnector */
export interface ClientHttpContext {
  /** spawned HTTP server process (server-everything) */
  serverProcess: ChildProcess;
  /** configured HttpMcpConnector instance */
  connector: HttpMcpConnector;
  /** base URL of the server */
  baseUrl: string;
  /** tears down the context by disconnecting and killing the server */
  teardown: () => Promise<void>;
}

/** context for client-side stdio tests using StdioConnector */
export interface ClientStdioContext {
  /** configured StdioConnector instance */
  connector: StdioConnector;
  /** tears down the context by disconnecting */
  teardown: () => Promise<void>;
}

/** context for server-side HTTP tests using HttpMcpConnector */
export interface ServerHttpClientContext {
  /** spawned HTTP test server process (undefined when using custom fetch) */
  serverProcess: ChildProcess | undefined;
  /** configured HttpMcpConnector instance */
  connector: HttpMcpConnector;
  /** base URL of the test server */
  baseUrl: string;
  /** MCP endpoint URL */
  mcpEndpoint: string;
  /** health check endpoint URL */
  healthEndpoint: string;
  /** tears down the context by disconnecting and killing the server */
  teardown: () => Promise<void>;
}

/** context for server-side stdio tests using StdioConnector */
export interface ServerStdioClientContext {
  /** configured StdioConnector instance */
  connector: StdioConnector;
  /** tears down the context by disconnecting */
  teardown: () => Promise<void>;
}

/** options for creating a server HTTP client context */
export interface ServerHttpClientContextOptions {
  /** client capabilities to advertise during initialization */
  capabilities?: ClientCapabilities;
  /** handler for server-to-client requests */
  onRequest?: OnRequest;
  /** handler for server notifications */
  onNotification?: OnNotification;
  /** custom fetch function (for undici interceptors) */
  fetch?: typeof globalThis.fetch;
}

/** options for creating a server stdio client context */
export interface ServerStdioClientContextOptions {
  /** client capabilities to advertise during initialization */
  capabilities?: ClientCapabilities;
  /** handler for server-to-client requests */
  onRequest?: OnRequest;
  /** handler for server notifications */
  onNotification?: OnNotification;
}

/** options for creating client HTTP or stdio test contexts */
export interface ClientContextOptions {
  /** unique name for the connector instance */
  name?: string;
  /** client capabilities to advertise during initialization */
  capabilities?: ClientCapabilities;
  /** handler for server-to-client requests */
  onRequest?: OnRequest;
}

/** no-op token store for anonymous HTTP connections */
interface NoOpTokenStore {
  getAccessToken: () => Promise<null>;
  getRefreshToken: () => Promise<null>;
  setTokens: () => Promise<void>;
  getTokenExpiration: () => Promise<null>;
  clearTokens: () => Promise<void>;
}

// HELPERS //

/**
 * creates a no-op token store for anonymous mode testing
 * @returns token store that returns null for all operations
 */
function createNoOpTokenStore(): NoOpTokenStore {
  return {
    getAccessToken: async () => null,
    getRefreshToken: async () => null,
    setTokens: async () => {},
    getTokenExpiration: async () => null,
    clearTokens: async () => {},
  };
}

// CONTEXT FACTORY FUNCTIONS //

/**
 * creates a client HTTP context for testing HttpMcpConnector against server-everything
 *
 * spawns a server-everything HTTP server and creates a configured HttpMcpConnector.
 * the caller must call connector.connect() and is responsible for calling teardown.
 * @param options configuration for the client context
 * @returns client HTTP context with connector, server process, and teardown
 */
export async function createClientHttpContext(
  options: ClientContextOptions = {},
): Promise<ClientHttpContext> {
  const {
    name,
    capabilities = { roots: { listChanged: true } },
    onRequest,
  } = options;

  const { process: serverProcess, port } = await spawnHttpServer();
  const baseUrl = `http://localhost:${port}`;
  const mcpEndpoint = `${baseUrl}/mcp`;

  await waitForServer(mcpEndpoint);

  const connector = new HttpMcpConnector({
    name: name ?? 'everything-server',
    url: mcpEndpoint,
    clientInfo: CLIENT_INFO,
    capabilities,
    onRequest,
    oauth: {
      onAuth: async () => {
        throw new Error('OAuth not expected for anonymous server');
      },
      tokenStore: createNoOpTokenStore(),
      redirectUri: `${baseUrl}/callback`,
    },
  });

  const teardown = async (): Promise<void> => {
    await connector.disconnect();
    await killServer(serverProcess);
  };

  return {
    serverProcess,
    connector,
    baseUrl,
    teardown,
  };
}

/**
 * creates a client stdio context for testing StdioConnector against server-everything
 *
 * provides a configured StdioConnector that spawns the external server-everything
 * via npx in stdio mode. this ensures client-connector-stdio tests exercise the
 * same reference server as client-connector-http tests.
 * the caller must call connector.connect() and is responsible for calling teardown.
 * @param options configuration for the client context
 * @returns client stdio context with connector and teardown
 */
export function createClientStdioContext(
  options: ClientContextOptions = {},
): ClientStdioContext {
  const {
    name,
    capabilities = { roots: { listChanged: true } },
    onRequest,
  } = options;

  const connector = new StdioConnector({
    name: name ?? 'everything-server',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything', 'stdio'],
    clientInfo: CLIENT_INFO,
    capabilities,
    onRequest,
  });

  const teardown = async (): Promise<void> => {
    await connector.disconnect();
  };

  return {
    connector,
    teardown,
  };
}

/**
 * creates a server HTTP client context for testing the coremcp HTTP transport
 *
 * spawns a coremcp test HTTP server and creates a configured HttpMcpConnector.
 * the caller must call connector.connect() and is responsible for calling teardown.
 * @param options configuration for the server HTTP client context
 * @returns server HTTP client context with connector, server process, and teardown
 */
export async function createServerHttpClientContext(
  options: ServerHttpClientContextOptions = {},
): Promise<ServerHttpClientContext> {
  const {
    capabilities = { roots: { listChanged: true } },
    onRequest,
    onNotification,
    fetch: customFetch,
  } = options;

  // when a custom fetch is provided (e.g. undici MockAgent interceptors),
  // skip spawning a real server process -- the fetch layer handles all requests
  const serverInfo = customFetch
    ? { process: undefined, port: 0 }
    : await spawnHttpTestServer();

  const serverProcess = serverInfo.process;
  const baseUrl = customFetch
    ? 'http://mock-server:0'
    : `http://localhost:${serverInfo.port}`;
  const mcpEndpoint = `${baseUrl}/mcp`;
  const healthEndpoint = `${baseUrl}/health`;

  if (!customFetch) {
    await waitForHttpTestServer(healthEndpoint);
  }

  const connector = new HttpMcpConnector({
    name: 'test-server',
    url: mcpEndpoint,
    clientInfo: CLIENT_INFO,
    capabilities,
    onRequest,
    onNotification,
    fetch: customFetch,
    oauth: {
      onAuth: async () => {
        throw new Error('OAuth not expected for anonymous test server');
      },
      tokenStore: createNoOpTokenStore(),
      redirectUri: `${baseUrl}/callback`,
    },
  });

  const teardown = async (): Promise<void> => {
    await connector.disconnect();

    if (serverProcess) {
      await killTestServer(serverProcess);
    }
  };

  return {
    serverProcess,
    connector,
    baseUrl,
    mcpEndpoint,
    healthEndpoint,
    teardown,
  };
}

/**
 * creates a server stdio client context for testing the coremcp stdio transport
 *
 * provides a configured StdioConnector that spawns the coremcp test server via stdio.
 * the caller must call connector.connect() and is responsible for calling teardown.
 * @param options configuration for the server stdio client context
 * @returns server stdio client context with connector and teardown
 */
export function createServerStdioClientContext(
  options: ServerStdioClientContextOptions = {},
): ServerStdioClientContext {
  const {
    capabilities = { roots: { listChanged: true } },
    onRequest,
    onNotification,
  } = options;

  const config = getStdioServerConfig();

  const connector = new StdioConnector({
    name: 'test-server',
    command: config.command,
    args: config.args,
    clientInfo: CLIENT_INFO,
    capabilities,
    onRequest,
    onNotification,
  });

  const teardown = async (): Promise<void> => {
    await connector.disconnect();
  };

  return {
    connector,
    teardown,
  };
}
