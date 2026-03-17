import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

import type { ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';

// RE-EXPORTS — server-spawner //

export {
  spawnHttpTestServer,
  spawnAuthHttpTestServer,
  getStdioServerConfig,
  waitForHttpTestServer,
  killTestServer,
} from './server-spawner';

export type { WaitForServerOptions, StdioServerConfig } from './server-spawner';

// RE-EXPORTS — transport-helpers //

export {
  createServerHttpClientContext,
  createServerStdioClientContext,
  createClientHttpContext,
  createClientStdioContext,
} from './transport-helpers';

export type {
  ServerHttpClientContext,
  ServerStdioClientContext,
  ServerHttpClientContextOptions,
  ServerStdioClientContextOptions,
  ClientHttpContext,
  ClientStdioContext,
  ClientContextOptions,
} from './transport-helpers';

// RE-EXPORTS — undici-helpers //

export {
  createMockAgent,
  interceptWithNetworkError,
  interceptWithTimeout,
  interceptWithAbortMidStream,
  createInterceptedFetch,
} from './undici-helpers';

// RE-EXPORTS — raw-http-client //

export { createRawHttpSession } from './raw-http-client';

export type { RawHttpResponse, RawHttpSession } from './raw-http-client';

// RE-EXPORTS — raw-stdio-client //

export { createRawStdioSession } from './raw-stdio-client';

export type { RawStdioResponse, RawStdioSession } from './raw-stdio-client';

// RE-EXPORTS — auth-server //

export {
  AUTH_SERVER_PORT,
  startAuthServer,
  stopAuthServer,
  validateAccessToken,
  tokenHasScope,
} from './auth-server';

// CONSTANTS //

export const CLIENT_INFO = { name: 'e2e-test-client', version: '1.0.0' };

// FUNCTIONS //

/**
 * Wait for HTTP server to be ready
 * @param url server URL to wait for
 * @param options polling configuration options
 * @param options.timeout maximum milliseconds to wait before timing out
 * @param options.interval milliseconds between HTTP status checks
 */
export async function waitForServer(
  url: string,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const { timeout = 30000, interval = 500 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { method: 'GET' });
      // 400 is valid - streamableHttp returns 400 when no session ID provided
      // This proves the server is running and accepting connections
      if (response.ok || response.status === 400 || response.status === 404) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

/**
 * Spawn server-everything with streamable HTTP transport
 * @returns spawned HTTP server process and the dynamically allocated port
 */
export async function spawnHttpServer(): Promise<{
  process: ChildProcess;
  port: number;
}> {
  const port = await getAvailablePort();
  const serverProcess = spawn(
    'npx',
    ['-y', '@modelcontextprotocol/server-everything', 'streamableHttp'],
    {
      stdio: 'pipe',
      env: { ...process.env, PORT: String(port) },
    },
  );

  return { process: serverProcess, port };
}

/**
 * Find a free port by binding to port 0 and reading the assigned port
 * @returns a port number that was available at the time of the check
 */
async function getAvailablePort(): Promise<number> {
  const server = createServer();

  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Kill server process gracefully
 * @param process child process to terminate
 */
export async function killServer(process: ChildProcess): Promise<void> {
  if (!process.killed) {
    process.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      process.once('exit', () => resolve());
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
        resolve();
      }, 5000);
    });
  }
}
