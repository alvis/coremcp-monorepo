/**
 * starts a streamable HTTP MCP server in anonymous mode for testing
 *
 * uses the test server fixture and listens on configurable port.
 */

import { HTTPTransport } from '@coremcp/server-fastify';

import { createTestMcpServer } from '../fixtures/test-server';

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
 * starts the HTTP test server
 */
async function startServer(): Promise<void> {
  const port = process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : DEFAULT_HTTP_PORT;
  const mcpServer = createTestMcpServer(log);

  const transport = new HTTPTransport({
    mcpServer,
    port,
    log,
    auth: { mode: 'anonymous' },
  });

  await transport.start();

  log('info', 'E2E HTTP test server ready', { port });
}

// start server immediately
void startServer();
