/**
 * lifecycle tests for the coremcp HTTP client connector
 *
 * validates initialization handshake, protocol version negotiation,
 * capability exchange, server info, and graceful shutdown using our
 * HttpMcpConnector against the server-everything reference server.
 * @see /e2e/interactions/01-lifecycle.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createClientHttpContext,
} from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-http / 01-lifecycle', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('initialization handshake', () => {
    it('should complete initialize/initialized handshake [LIFECYCLE-001]', () => {
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should have received server info after initialization [LIFECYCLE-001]', () => {
      const { serverInfo } = ctx.connector.info;

      expect(serverInfo).not.toBeNull();
      expect(serverInfo?.name).toBe('mcp-servers/everything');
    });
  });

  describe('protocol version negotiation', () => {
    it('should negotiate a valid protocol version [LIFECYCLE-002]', () => {
      const { protocolVersion } = ctx.connector.info;

      expect(protocolVersion).toBeDefined();
      expect(protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('capability negotiation', () => {
    it('should receive server capabilities [LIFECYCLE-004]', () => {
      const { capabilities } = ctx.connector.info;

      expect(capabilities).not.toBeNull();
      expect(capabilities?.tools).toBeDefined();
      expect(capabilities?.prompts).toBeDefined();
      expect(capabilities?.resources).toBeDefined();
    });

    it('should declare tools capability with expected structure [LIFECYCLE-004]', async () => {
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get-sum');
    });

    it('should declare prompts capability [LIFECYCLE-004]', async () => {
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should declare resources capability [LIFECYCLE-004]', async () => {
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('server info', () => {
    it('should include server name in info [LIFECYCLE-001]', () => {
      expect(ctx.connector.info.serverInfo?.name).toBeDefined();
      expect(typeof ctx.connector.info.serverInfo?.name).toBe('string');
    });
  });

  describe('graceful shutdown', () => {
    it('should disconnect cleanly [LIFECYCLE-006]', async () => {
      const freshCtx = await createClientHttpContext({ name: 'shutdown-test' });
      await freshCtx.connector.connect();

      expect(freshCtx.connector.info.isConnected).toBe(true);

      await freshCtx.connector.disconnect();

      expect(freshCtx.connector.info.isConnected).toBe(false);

      await freshCtx.teardown();
    });

    it('should reconnect after disconnect [LIFECYCLE-006]', async () => {
      const freshCtx = await createClientHttpContext({ name: 'reconnect-test' });
      await freshCtx.connector.connect();

      expect(freshCtx.connector.info.isConnected).toBe(true);

      await freshCtx.connector.disconnect();

      expect(freshCtx.connector.info.isConnected).toBe(false);

      await freshCtx.connector.connect();

      expect(freshCtx.connector.info.isConnected).toBe(true);

      const tools = await freshCtx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      await freshCtx.teardown();
    });
  });

  describe('ping', () => {
    it('should respond to ping after initialization [LIFECYCLE-001]', async () => {
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
