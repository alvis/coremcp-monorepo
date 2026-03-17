import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

import { AUTH_SERVER_PORT } from './auth-server';

import type { ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';

// MODULE PATH RESOLUTION //

/** absolute path to the e2e directory */
const E2E_ROOT = resolve(import.meta.dirname, '..');

// CONSTANTS //

/** timeout for waiting for HTTP server to be ready (60 seconds) */
const DEFAULT_WAIT_TIMEOUT = 60_000;

/** interval between health check polls (500ms) */
const DEFAULT_POLL_INTERVAL = 500;

/** timeout for graceful server shutdown (5 seconds) */
const GRACEFUL_SHUTDOWN_TIMEOUT = 5_000;

// TYPES //

/** options for waiting for HTTP server readiness */
export interface WaitForServerOptions {
  /** maximum time to wait in milliseconds */
  timeout?: number;
  /** interval between health check polls in milliseconds */
  interval?: number;
}

/** configuration for spawning STDIO server */
export interface StdioServerConfig {
  /** command to execute */
  command: string;
  /** arguments to pass to the command */
  args: string[];
}

// FUNCTIONS //

/**
 * finds a free port by binding to port 0 and reading the assigned port
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
 * spawns HTTP test server as a child process on a dynamically allocated port
 * @returns child process handle and the allocated port number
 */
export async function spawnHttpTestServer(): Promise<{
  process: ChildProcess;
  port: number;
}> {
  const port = await getAvailablePort();
  const serverPath = resolve(E2E_ROOT, 'bin', 'test-server-http.ts');

  const serverProcess = spawn('npx', ['tsx', serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'], // inherit stderr to surface errors
    env: { ...process.env, PORT: String(port) },
  });

  return { process: serverProcess, port };
}

/**
 * returns command and args configuration for STDIO test server
 *
 * This configuration is intended for use with StdioConnector which manages
 * the process lifecycle internally.
 * @returns configuration object with command and args for STDIO server
 */
export function getStdioServerConfig(): StdioServerConfig {
  const serverPath = resolve(E2E_ROOT, 'bin', 'test-server-stdio.ts');

  return {
    command: 'npx',
    args: ['tsx', serverPath],
  };
}

/**
 * waits for HTTP server to be ready by polling the health endpoint
 *
 * Polls the specified URL until it returns a successful response or the
 * timeout is reached. Considers 2xx, 400, and 404 status codes as valid
 * responses indicating the server is running.
 * @param url URL to poll for server readiness
 * @param options configuration for timeout and polling interval
 * @throws {Error} if server does not respond within the timeout period
 */
export async function waitForHttpTestServer(
  url: string,
  options: WaitForServerOptions = {},
): Promise<void> {
  const { timeout = DEFAULT_WAIT_TIMEOUT, interval = DEFAULT_POLL_INTERVAL } =
    options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url, { method: 'GET' });

      // 400 is valid - streamableHttp returns 400 when no session ID provided
      // 401 is valid - auth-protected server returns 401 for unauthenticated requests
      // 404 is valid - health endpoint might not exist but server is running
      // any of these prove the server is running and accepting connections
      if (response.ok || response.status === 400 || response.status === 401 || response.status === 404) {
        return;
      }
    } catch {
      // Server not ready yet, continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `HTTP test server at ${url} did not start within ${timeout}ms`,
  );
}

/**
 * kills a test server process gracefully
 *
 * First attempts graceful shutdown with SIGTERM, then forces termination
 * with SIGKILL after the grace period if the process is still running.
 * @param process child process to terminate
 */
export async function killTestServer(process: ChildProcess): Promise<void> {
  if (process.killed) {
    return;
  }

  process.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const onExit = (): void => {
      resolve();
    };

    process.once('exit', onExit);

    setTimeout(() => {
      if (!process.killed) {
        process.kill('SIGKILL');
      }
      resolve();
    }, GRACEFUL_SHUTDOWN_TIMEOUT);
  });
}

/**
 * spawns an auth-protected HTTP test server as a child process on a dynamically allocated port
 *
 * uses the same test server binary but with external auth mode enabled.
 * configures AUTH_MODE and AUTH_ISSUER env vars so the server validates
 * tokens via the mock OAuth authorization server's introspection endpoint.
 *
 * the mock auth server must be started separately via auth-server.ts
 * before spawning this server.
 * @returns child process handle and the allocated port number
 */
export async function spawnAuthHttpTestServer(): Promise<{
  process: ChildProcess;
  port: number;
}> {
  const port = await getAvailablePort();
  const serverPath = resolve(E2E_ROOT, 'bin', 'test-server-http.ts');
  const authIssuer = `http://localhost:${AUTH_SERVER_PORT}`;

  const serverProcess = spawn('npx', ['tsx', serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PORT: String(port),
      AUTH_MODE: 'external',
      AUTH_ISSUER: authIssuer,
    },
  });

  return { process: serverProcess, port };
}
