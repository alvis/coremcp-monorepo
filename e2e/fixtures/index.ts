import type { ChildProcess } from 'node:child_process';

import { spawn } from 'node:child_process';

// RE-EXPORTS //

export {
  runInspectorList,
  runInspectorToolCall,
  runInspectorResourceRead,
  runInspectorPromptGet,
} from './inspector';

export {
  HTTP_TEST_PORT,
  spawnHttpTestServer,
  getStdioServerConfig,
  waitForHttpTestServer,
  killTestServer,
} from './server-spawner';

export type {
  InspectorTransport,
  InspectorListMethod,
  InspectorOptions,
  InspectorResult,
} from './inspector';

export type {
  WaitForServerOptions,
  StdioServerConfig,
} from './server-spawner';

// CONSTANTS //

export const CLIENT_INFO = { name: 'e2e-test-client', version: '1.0.0' };
export const HTTP_PORT = 3100;

// FUNCTIONS //

/**
 * Wait for HTTP server to be ready
 * @param url
 * @param options
 * @param options.timeout
 * @param options.interval
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
 */
export function spawnHttpServer(): ChildProcess {
  return spawn(
    'npx',
    ['-y', '@modelcontextprotocol/server-everything', 'streamableHttp'],
    {
      stdio: 'pipe',
      env: { ...process.env, PORT: String(HTTP_PORT) },
    },
  );
}

/**
 * Kill server process gracefully
 * @param process
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
