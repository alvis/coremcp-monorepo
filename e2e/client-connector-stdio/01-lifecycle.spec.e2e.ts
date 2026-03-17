/**
 * lifecycle tests for the coremcp stdio client connector
 *
 * validates initialization handshake, protocol version negotiation,
 * capability exchange, server info, and graceful shutdown using our
 * StdioConnector against the server-everything reference server.
 * @see /e2e/interactions/01-lifecycle.md — interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createClientStdioContext,
} from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 01-lifecycle', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('initialization handshake', () => {
    it('should complete initialize/initialized handshake [LIFECYCLE-001]', () => {
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should receive server info after initialization [LIFECYCLE-001]', () => {
      expect(ctx.connector.info.serverInfo).toEqual({
        name: 'mcp-servers/everything',
        title: 'Everything Example Server',
        version: '1.0.0',
      });
    });
  });

  describe('protocol version negotiation', () => {
    it('should negotiate a valid protocol version [LIFECYCLE-002]', () => {
      const { protocolVersion } = ctx.connector.info;

      expect(protocolVersion).toBeDefined();
      expect(typeof protocolVersion).toBe('string');
    });
  });

  describe('capability negotiation', () => {
    it('should receive server capabilities [LIFECYCLE-004]', () => {
      const { capabilities } = ctx.connector.info;

      expect(capabilities).toEqual(
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        }),
      );
    });

    it('should declare tools capability with expected tools [LIFECYCLE-004]', async () => {
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get-sum');
    });

    it('should declare prompts capability [LIFECYCLE-004]', async () => {
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);

      const promptNames = prompts.map((p) => p.name);

      expect(promptNames).toContain('simple_prompt');
      expect(promptNames).toContain('complex_prompt');
    });

    it('should declare resources capability [LIFECYCLE-004]', async () => {
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('server info', () => {
    it('should include server name in info [LIFECYCLE-001]', () => {
      expect(ctx.connector.info.serverInfo?.name).toBe(
        'mcp-servers/everything',
      );
    });

    it('should include server version in info [LIFECYCLE-001]', () => {
      expect(ctx.connector.info.serverInfo?.version).toBe('1.0.0');
    });
  });

  describe('shutdown', () => {
    it('should disconnect gracefully [LIFECYCLE-005]', async () => {
      const testCtx = createClientStdioContext({ name: 'shutdown-test' });
      await testCtx.connector.connect();

      expect(testCtx.connector.info.isConnected).toBe(true);

      await testCtx.connector.disconnect();

      expect(testCtx.connector.info.isConnected).toBe(false);
    }, 60_000);

    it('should handle multiple disconnect calls idempotently [LIFECYCLE-005]', async () => {
      const testCtx = createClientStdioContext({ name: 'multi-disconnect' });
      await testCtx.connector.connect();
      await testCtx.connector.disconnect();

      // second disconnect should not throw
      await expect(testCtx.connector.disconnect()).resolves.toBeUndefined();
    }, 60_000);
  });

  describe('ping', () => {
    it('should respond to ping after initialization [LIFECYCLE-001]', async () => {
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
