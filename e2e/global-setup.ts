/**
 * global setup for e2e tests
 *
 * spins up a single shared server-everything instance and a single shared
 * coremcp test server instance, both on dynamic ports.
 * all test files that need a server use inject('serverEverythingPort') or
 * inject('coreMcpPort') instead of spawning their own, eliminating process
 * contention from concurrent spawns.
 */

import {
  killServer,
  killTestServer,
  spawnHttpServer,
  spawnHttpTestServer,
  waitForHttpTestServer,
  waitForServer,
} from './fixtures/index';

import type { TestProject } from 'vitest/node';

/**
 * sets up the shared servers and provides their ports to test workers
 * @param project
 */
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const [serverEverything, coreMcpServer] = await Promise.all([
    spawnHttpServer(),
    spawnHttpTestServer(),
  ]);

  const mcpEndpoint = `http://localhost:${serverEverything.port}/mcp`;
  const healthEndpoint = `http://localhost:${coreMcpServer.port}/health`;

  await Promise.all([
    waitForServer(mcpEndpoint),
    waitForHttpTestServer(healthEndpoint),
  ]);

  project.provide('serverEverythingPort', serverEverything.port);
  project.provide('coreMcpPort', coreMcpServer.port);

  return async () => {
    await Promise.all([
      killServer(serverEverything.process),
      killTestServer(coreMcpServer.process),
    ]);
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    serverEverythingPort: number;
    coreMcpPort: number;
  }
}
