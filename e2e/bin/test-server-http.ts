/**
 * starts a streamable HTTP MCP server for testing
 *
 * uses the test server fixture and listens on configurable port.
 * supports anonymous mode (default) and external auth mode via AUTH_MODE env var.
 */

import { HTTPTransport } from '@coremcp/server-fastify';

import { createTestMcpServer } from '../fixtures/test-server';

import type { AuthOptions } from '@coremcp/server-fastify';

// CONSTANTS //

const DEFAULT_HTTP_PORT = 3200;

// FUNCTIONS //

/**
 * logs messages to stderr for server diagnostics
 * @param level log severity level
 * @param message log message content
 * @param data optional structured data for context
 */
function log(
  level: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({ timestamp, level, message, ...data });

  process.stderr.write(`${logEntry}\n`);
}

/**
 * resolves auth configuration from environment variables
 *
 * when AUTH_MODE is 'external', configures the server to validate tokens
 * against an external OAuth authorization server via introspection.
 * defaults to anonymous mode for backwards compatibility.
 * @returns auth options for the HTTP transport
 */
function resolveAuthOptions(): AuthOptions {
  const authMode = process.env.AUTH_MODE;

  if (authMode === 'external') {
    const issuer = process.env.AUTH_ISSUER;

    if (!issuer) {
      throw new Error('AUTH_ISSUER is required when AUTH_MODE=external');
    }

    return {
      mode: 'external',
      config: {
        issuer,
        endpoints: { introspection: `${issuer}/introspect` },
        clientCredentials: {
          clientId: 'mcp-server',
          clientSecret: 'mcp-secret',
        },
      },
      requiredScopes: ['mcp'],
    };
  }

  return { mode: 'anonymous' };
}

/**
 * starts the HTTP test server
 */
async function startServer(): Promise<void> {
  const port = process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : DEFAULT_HTTP_PORT;
  const mcpServer = createTestMcpServer(log);
  const auth = resolveAuthOptions();

  const transport = new HTTPTransport({
    mcpServer,
    port,
    log,
    auth,
  });

  await transport.start();

  log('info', 'E2E HTTP test server ready', { port, authMode: auth.mode });
}

// start server immediately
void startServer();
