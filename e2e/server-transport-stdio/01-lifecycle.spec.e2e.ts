/**
 * lifecycle tests for the coremcp stdio server transport via native connector
 *
 * validates initialization handshake, protocol version negotiation,
 * capability exchange, server info, and graceful shutdown using our
 * StdioConnector as the client against our coremcp stdio server.
 * @see /e2e/interactions/01-lifecycle.md for interaction specifications
 */

import { spawn } from 'node:child_process';

import { JSONRPC_VERSION } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import {
  createServerStdioClientContext,
  CLIENT_INFO,
  getStdioServerConfig,
} from '../fixtures/index';

import { TEST_TOOLS } from '../fixtures/test-server';

import type { ChildProcess } from 'node:child_process';

import type { InitializeResult } from '@coremcp/protocol';

import type { ServerStdioClientContext } from '../fixtures/index';

// TEST SUITES //

describe('server-transport-stdio / 01-lifecycle', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('initialization handshake', () => {
    it('should complete initialize/initialized handshake via stdin/stdout [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the full initialize/initialized handshake completes over stdio.
       * Per spec, initialization MUST be the first interaction: client sends initialize
       * request, server responds with capabilities/serverInfo/protocolVersion, then
       * client sends notifications/initialized.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/client.ts#L470-L522 (Client.connect sends initialize then notifications/initialized)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L114-L115 (Server registers initialize and notifications/initialized handlers)
       */

      // the connector performs the full initialize/initialized handshake
      // internally during connect(). a successful connection proves the entire
      // handshake completed over stdio transport.
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should return tools after successful initialization [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tools are accessible after a successful initialization handshake.
       * Per spec, after initialization the server's declared capabilities (including tools)
       * become available for use during the operation phase.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#operation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L443 (_oninitialize returns capabilities including tools)
       */

      const tools = await ctx.connector.listTools();

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));
    });
  });

  describe('protocol version negotiation', () => {
    it('should negotiate a compatible protocol version [LIFECYCLE-002]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies protocol version negotiation produces a valid version string.
       * Per spec, client MUST send a protocolVersion it supports; if server supports it,
       * server MUST respond with the same version.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (server checks if requestedVersion is in supportedProtocolVersions)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L3-L5 (LATEST_PROTOCOL_VERSION='2025-11-25', SUPPORTED_PROTOCOL_VERSIONS array)
       */

      // a successful connection proves protocol version negotiation succeeded
      const { protocolVersion } = ctx.connector.info;

      expect(protocolVersion).toBeDefined();
      expect(typeof protocolVersion).toBe('string');
    });
  });

  describe('capability negotiation', () => {
    it('should declare tools capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server declared tools capability during initialization and
       * that tools are available. Per spec, both parties MUST only use capabilities
       * that were successfully negotiated.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L447 (_oninitialize returns capabilities via getCapabilities())
       */

      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should declare resources capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server declared resources capability during initialization and
       * that resources are available. Per spec, both parties MUST only use capabilities
       * that were successfully negotiated.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L447 (_oninitialize returns capabilities via getCapabilities())
       */

      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    it('should declare prompts capability [LIFECYCLE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server declared prompts capability during initialization and
       * that prompts are available. Per spec, both parties MUST only use capabilities
       * that were successfully negotiated.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#capability-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L441-L447 (_oninitialize returns capabilities via getCapabilities())
       */

      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('server info', () => {
    it('should return correct server name and version [LIFECYCLE-001]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server returns serverInfo with name and version in the
       * InitializeResult. Per spec, the server MUST respond with serverInfo
       * containing name (required) and version (required) per the Implementation type.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L444 (_oninitialize returns serverInfo: this._serverInfo)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L437-L456 (InitializeResult requires serverInfo: Implementation with name and version)
       */

      // server info should come from the initialize response's serverInfo field
      const { serverInfo } = ctx.connector.info;

      expect(serverInfo).toBeDefined();
      expect(typeof serverInfo?.name).toBe('string');
      expect(serverInfo!.name.length).toBeGreaterThan(0);
      expect(typeof serverInfo?.version).toBe('string');
      expect(serverInfo!.version.length).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should handle graceful shutdown via stdin close [LIFECYCLE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies graceful shutdown over stdio by disconnecting and confirming the
       * connection is closed. Per spec, for stdio transport the client SHOULD close
       * the input stream to the child process's stdin. If the server does not exit,
       * client SHOULD send SIGTERM (and SIGKILL if needed).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#stdio
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/client/stdio.ts (StdioClientTransport close() kills child process)
       */

      // create a separate context to test disconnect without affecting the main suite
      const testCtx = createServerStdioClientContext();
      await testCtx.connector.connect();

      expect(testCtx.connector.info.isConnected).toBe(true);

      await testCtx.connector.disconnect();

      expect(testCtx.connector.info.isConnected).toBe(false);
    }, 30_000);
  });

  describe('incompatible version negotiation', () => {
    it('should respond with a supported version when client sends unsupported version [LIFECYCLE-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that when client sends an unsupported protocol version, the server
       * responds with a version it does support. Per spec, if the server does not
       * support the requested protocolVersion, it MUST respond with another version
       * it supports, and the client can then decide whether to proceed.
       * The SDK server falls back to supportedProtocolVersions[0] (the latest).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (fallback to supportedProtocolVersions[0] when version not found)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L3-L5 (SUPPORTED_PROTOCOL_VERSIONS array)
       */

      const config = getStdioServerConfig();
      const serverProcess: ChildProcess = spawn(config.command, config.args, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      let stdoutBuffer = '';

      const responsePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for server response'));
        }, 15_000);

        serverProcess.stdout?.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
              continue;
            }

            try {
              JSON.parse(trimmed);
              clearTimeout(timeout);
              resolve(trimmed);

              return;
            } catch {
              // not a complete JSON line yet
            }
          }
        });
      });

      // send initialize with unsupported far-future protocol version
      serverProcess.stdin?.write(
        `${JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '9999-01-01',
            capabilities: {},
            clientInfo: CLIENT_INFO,
          },
        })}\n`,
      );

      const rawResponse = await responsePromise;
      const body = JSON.parse(rawResponse) as {
        result?: { protocolVersion: string };
        error?: { code: number; message: string };
      };

      // server always negotiates a supported version via negotiateProtocolVersion
      // which falls back to the highest supported version when the requested one is unknown
      expect(body.result).toBeDefined();
      expect(body.result!.protocolVersion).not.toBe('9999-01-01');
      expect(body.result!.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      serverProcess.kill('SIGTERM');
    }, 30_000);
  });

  describe('instructions field', () => {
    it('should include instructions string in initialize result [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the server includes an instructions string in the InitializeResult.
       * Per spec, the server response MAY include an optional instructions field
       * describing how to use the server. The SDK includes it when configured via
       * ServerOptions.instructions (server.ts L69, L111).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L445 (_oninitialize conditionally includes instructions)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L445-L455 (InitializeResult.instructions is optional string)
       */

      // create a fresh connection to capture the InitializeResult
      const testCtx = createServerStdioClientContext();
      const initResult: InitializeResult = await testCtx.connector.connect();

      expect(typeof initResult.instructions).toBe('string');
      expect((initResult.instructions!).length).toBeGreaterThan(0);

      await testCtx.teardown();
    }, 30_000);
  });

  describe('exact protocol version', () => {
    it('should negotiate protocol version 2025-11-25 [LIFECYCLE-002]', () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the negotiated protocol version is exactly '2025-11-25'.
       * Per spec, if the server supports the requested version it MUST respond
       * with the same version. LATEST_PROTOCOL_VERSION in SDK is '2025-11-25'.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#version-negotiation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L437-L439 (server echoes requestedVersion if supported)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L3 (LATEST_PROTOCOL_VERSION = '2025-11-25')
       */

      expect(ctx.connector.info.protocolVersion).toBe('2025-11-25');
    });
  });

  describe('ping', () => {
    it('should respond to ping after initialization [LIFECYCLE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server responds to a ping request after initialization.
       * Per spec (Utilities > Ping), either party can send a ping and the receiver
       * MUST respond promptly with an empty result {}. No capabilities needed for ping.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/ping
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/shared/protocol.ts#L453-L457 (default ping handler returns {} as Result)
       */

      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
