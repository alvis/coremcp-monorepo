import type { McpServer } from '@coremcp/server';

import type { HTTPTransport, HTTPTransportOptions } from '#http';

/**
 * configuration options for test server instances
 */
export interface TestServerOptions {
  /** port number for the test server */
  port?: number;
  /** host address for the test server */
  host?: string;
  /** authentication mode to test */
  authMode?: 'anonymous' | 'proxy' | 'external-as';
  /** custom http transport options */
  transportOptions?: Partial<HTTPTransportOptions>;
}

/**
 * test server instance with cleanup function
 */
export interface TestServerInstance {
  /** http transport instance */
  transport: HTTPTransport;
  /** mcp server instance */
  mcpServer: McpServer;
  /** server base url */
  baseUrl: string;
  /** cleanup function to stop server and release resources */
  cleanup: () => Promise<void>;
}

/**
 * starts a test server with http transport for integration testing
 * @param options - configuration options for the test server
 * @returns test server instance with cleanup function
 */
export async function startTestServer(
  options: TestServerOptions = {},
): Promise<TestServerInstance> {
  const { McpServer } = await import('@coremcp/server');
  const { HTTPTransport } = await import('#http');

  const mcpServer = new McpServer({
    serverInfo: { name: 'test-server', version: '1.0.0' },
    tools: [],
    prompts: [],
    resources: [],
  });

  const authMode = options.authMode ?? 'anonymous';
  const port = options.port ?? Math.floor(Math.random() * 50000) + 10000;
  const host = options.host ?? 'localhost';

  const transportOptions: Partial<HTTPTransportOptions> = {
    ...options.transportOptions,
    port,
    host,
    mcpServer,
  };

  if (authMode === 'proxy') {
    transportOptions.auth = {
      mode: 'proxy',
      config: {
        issuer: 'https://auth.example.com',
        proxyCredentials: {
          clientId: 'proxy-client',
          clientSecret: 'proxy-secret',
          redirectUri: `http://${host}:${port}/oauth/callback`,
        },
        stateJwt: {
          secret: 'a-very-long-secret-key-for-jwt-signing-minimum-32-chars',
        },
      },
      requiredScopes: ['mcp'],
    };
  } else if (authMode === 'external-as') {
    transportOptions.auth = {
      mode: 'external',
      config: {
        issuer: 'https://auth.example.com',
        endpoints: {
          introspection: 'https://auth.example.com/oauth/introspect',
        },
        clientCredentials: {
          clientId: 'test-client',
          clientSecret: 'test-secret',
        },
      },
      requiredScopes: ['mcp'],
    };
  }

  const transport = new HTTPTransport(transportOptions as HTTPTransportOptions);

  await transport.start();

  const baseUrl = `http://${host}:${port}`;

  return {
    transport,
    mcpServer,
    baseUrl,
    cleanup: async () => {
      await transport.stop();
    },
  };
}
