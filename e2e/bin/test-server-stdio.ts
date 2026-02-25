/**
 * starts a STDIO MCP server for testing
 *
 * communicates via stdin/stdout with logging to stderr.
 */

import { McpStdioServerTransport } from '@coremcp/server-stdio';

import { createTestMcpServer } from '../fixtures/test-server';

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
 * starts the STDIO test server
 */
async function startServer(): Promise<void> {
  const mcpServer = createTestMcpServer(log);

  const transport = new McpStdioServerTransport({
    mcpServer,
    log,
  });

  await transport.start();
}

// start server immediately
void startServer();
