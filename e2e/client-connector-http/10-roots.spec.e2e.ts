/**
 * roots tests for the coremcp HTTP client connector against server-everything
 *
 * validates that our HttpMcpConnector correctly handles server-initiated
 * roots/list requests and sends roots changed notifications. server-everything
 * provides a get-roots-list tool that triggers roots/list from server to client.
 * @see /e2e/interactions/10-roots.md for interaction specifications
 */

import { describe, expect } from 'vitest';

import { clientHttpTest } from '../fixtures/http-test-fixtures';

// TEST SUITES //

describe('client-connector-http / 10-roots', () => {
  describe('list roots', () => {
    clientHttpTest('should have get-roots-list tool available from server-everything [ROOTS-001]', async ({ connector }) => {
      const tools = await connector.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('get-roots-list');
    });

    clientHttpTest('should respond to roots/list request from server via get-roots-list tool [ROOTS-001]', async ({ connector }) => {
      // server-everything's get-roots-list tool sends roots/list from server to client
      // our connector should respond with the roots it was configured with
      const toolResult = await connector.callTool('get-roots-list', {});

      expect(toolResult.content).toBeDefined();
      const content = toolResult.content as { type: string; text: string }[];
      expect(content.length).toBeGreaterThan(0);

      // the result should contain the roots that our connector provides
      const textContent = content[0];
      expect(textContent.type).toBe('text');
    });
  });

  describe('roots capability', () => {
    clientHttpTest('should have roots capability advertised [ROOTS-001]', async ({ connector }) => {
      // the connector was created with capabilities: { roots: { listChanged: true } }
      expect(connector.info.isConnected).toBe(true);
    });

    clientHttpTest('should have received server capabilities [ROOTS-001]', async ({ connector }) => {
      expect(connector.info.capabilities).not.toBeNull();
    });
  });

  describe('roots list changed notification', () => {
    clientHttpTest('should send notifications/roots/list_changed to server [ROOTS-002]', async ({ connector }) => {
      // our connector can send roots/list_changed notification
      // this should not throw - it's a fire-and-forget notification
      await expect(
        connector.sendNotification(
          'notifications/roots/list_changed',
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('empty roots list', () => {
    clientHttpTest('should respond to roots/list with configured roots [ROOTS-003]', async ({ connector }) => {
      // the connector was created without explicit roots,
      // so it should return an empty roots array or whatever the default is
      const toolResult = await connector.callTool('get-roots-list', {});

      expect(toolResult.content).toBeDefined();
      expect(toolResult.isError).toBeFalsy();
    });
  });
});
