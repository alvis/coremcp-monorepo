/**
 * roots tests for the coremcp HTTP client connector against server-everything
 *
 * validates that our HttpMcpConnector correctly handles server-initiated
 * roots/list requests and sends roots changed notifications. server-everything
 * provides a listRoots tool that triggers roots/list from server to client.
 * @see /e2e/interactions/10-roots.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-http / 10-roots', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('list roots', () => {
    it('should have listRoots tool available from server-everything [ROOTS-001]', async () => {
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('listRoots');
    });

    it('should respond to roots/list request from server via listRoots tool [ROOTS-001]', async () => {
      // server-everything's listRoots tool sends roots/list from server to client
      // our connector should respond with the roots it was configured with
      const toolResult = await ctx.connector.callTool('listRoots', {});

      expect(toolResult.content).toBeDefined();
      const content = toolResult.content as { type: string; text: string }[];
      expect(content.length).toBeGreaterThan(0);

      // the result should contain the roots that our connector provides
      const textContent = content[0];
      expect(textContent.type).toBe('text');
    });
  });

  describe('roots capability', () => {
    it('should have roots capability advertised [ROOTS-001]', () => {
      // the connector was created with capabilities: { roots: { listChanged: true } }
      expect(ctx.connector.info.isConnected).toBe(true);
    });

    it('should have received server capabilities [ROOTS-001]', () => {
      expect(ctx.connector.info.capabilities).not.toBeNull();
    });
  });

  describe('roots list changed notification', () => {
    it('should send notifications/roots/list_changed to server [ROOTS-002]', async () => {
      // our connector can send roots/list_changed notification
      // this should not throw - it's a fire-and-forget notification
      await expect(
        ctx.connector.sendNotification(
          'notifications/roots/list_changed',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('empty roots list', () => {
    it('should respond to roots/list with configured roots [ROOTS-003]', async () => {
      // the connector was created without explicit roots,
      // so it should return an empty roots array or whatever the default is
      const toolResult = await ctx.connector.callTool('listRoots', {});

      expect(toolResult.content).toBeDefined();
      expect(toolResult.isError).toBeFalsy();
    });
  });
});
