import type { McpConnectorParams } from '@coremcp/client/connector';

/**
 * Configuration parameters for the stdio connector
 * Extends the base MCP connector parameters with stdio-specific options
 * for spawning and communicating with a child process.
 * @example
 * ```typescript
 * const params: StdioConnectorParams = {
 *   name: 'my-mcp-server',
 *   command: 'node',
 *   args: ['dist/server.js', '--verbose'],
 *   env: { NODE_ENV: 'production' },
 *   clientInfo: { name: 'my-client', version: '1.0.0' },
 *   capabilities: { roots: { listChanged: true } }
 * };
 * ```
 */
export interface StdioConnectorParams extends McpConnectorParams {
  /**
   * Command to spawn as a child process
   * Can be an absolute path or a command available in PATH.
   * Examples: 'node', '/usr/bin/python3', 'npx'
   */
  command: string;

  /**
   * Optional command-line arguments to pass to the spawned process
   * Arguments are passed directly to the spawn function.
   * Each argument should be a separate array element.
   * @example
   * ```typescript
   * args: ['server.js', '--port', '3000', '--verbose']
   * ```
   */
  args?: string[];

  /**
   * Optional environment variables for the spawned process
   * If not provided, the child process inherits the parent's environment (process.env).
   * If provided, only these variables will be available to the child process.
   * @example
   * ```typescript
   * env: {
   *   NODE_ENV: 'production',
   *   PATH: process.env.PATH,
   *   API_KEY: 'secret-key'
   * }
   * ```
   */
  env?: Record<string, string>;
}
