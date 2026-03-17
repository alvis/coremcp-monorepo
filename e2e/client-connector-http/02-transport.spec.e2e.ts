/**
 * transport tests for the coremcp HTTP client connector
 *
 * validates HTTP-specific transport behavior including session management,
 * concurrent request handling, reconnection behavior, and POST with JSON
 * responses using our HttpMcpConnector against server-everything.
 * @see /e2e/interactions/02-transport.md for interaction specifications
 */

import { describe, expect, inject } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';
import { clientHttpTest } from '../fixtures/http-test-fixtures';

import type { TextContent } from '@coremcp/protocol';

// TEST SUITES //

describe('client-connector-http / 02-transport', () => {
  describe('POST with JSON response', () => {
    clientHttpTest('should receive tool call response via POST [TRANSPORT-005]', async ({ connector }) => {
      const result = await connector.callTool('echo', {
        message: 'http-transport',
      });

      expect(result.content).toBeDefined();
      const content = result.content!;
      expect(content).toHaveLength(1);
      expect(content[0]).toMatchObject({
        type: 'text',
        text: 'Echo: http-transport',
      });
    });

    clientHttpTest('should receive tools/list response via POST [TRANSPORT-005]', async ({ connector }) => {
      const tools = await connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('echo');
    });

    clientHttpTest('should receive resources/list response via POST [TRANSPORT-005]', async ({ connector }) => {
      const resources = await connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    clientHttpTest('should receive prompts/list response via POST [TRANSPORT-005]', async ({ connector }) => {
      const prompts = await connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
    });

    clientHttpTest('should respond to ping via POST [TRANSPORT-005]', async ({ connector }) => {
      await expect(connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('concurrent requests', () => {
    clientHttpTest('should handle multiple concurrent tool calls [TRANSPORT-008]', async ({ connector }) => {
      const requests = [
        connector.callTool('echo', { message: 'first' }),
        connector.callTool('echo', { message: 'second' }),
        connector.callTool('get-sum', { a: 1, b: 2 }),
      ];

      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);

      expect(results[0].content).toBeDefined();
      expect(results[0].content![0]).toMatchObject({
        type: 'text',
        text: 'Echo: first',
      });

      expect(results[1].content).toBeDefined();
      expect(results[1].content![0]).toMatchObject({
        type: 'text',
        text: 'Echo: second',
      });

      expect(results[2].content).toBeDefined();
      expect(results[2].content![0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('3'),
      });
    });

    clientHttpTest('should handle concurrent resource reads [TRANSPORT-008]', async ({ connector }) => {
      const resources = await connector.listResources();
      const testResources = resources.slice(0, 3);

      const requests = testResources.map(async (r) =>
        connector.readResource(r.uri),
      );
      const results = await Promise.all(requests);

      expect(results).toHaveLength(testResources.length);

      results.forEach((result, index) => {
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe(testResources[index].uri);
      });
    });

    clientHttpTest('should handle mixed concurrent operations [TRANSPORT-008]', async ({ connector }) => {
      const operations = [
        connector.callTool('echo', { message: 'mixed-1' }),
        connector.listTools(),
        connector.listResources(),
        connector.listPrompts(),
        connector.ping(),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(5);

      // verify echo result
      const echoResult = results[0] as { content: TextContent[] };

      expect(echoResult.content[0].text).toBe('Echo: mixed-1');

      // verify list results are arrays
      expect(Array.isArray(results[1])).toBe(true);
      expect(Array.isArray(results[2])).toBe(true);
      expect(Array.isArray(results[3])).toBe(true);
    });
  });

  describe('reconnection', () => {
    clientHttpTest('should disconnect and reconnect successfully [TRANSPORT-009]', async () => {
      const port = inject('serverEverythingPort');
      const freshContext = await createClientHttpContext({ name: 'reconnect-transport', port });
      await freshContext.connector.connect();

      expect(freshContext.connector.info.isConnected).toBe(true);

      await freshContext.connector.disconnect();

      expect(freshContext.connector.info.isConnected).toBe(false);

      await freshContext.connector.connect();

      expect(freshContext.connector.info.isConnected).toBe(true);

      const tools = await freshContext.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      await freshContext.teardown();
    });

    clientHttpTest('should function normally after reconnection [TRANSPORT-009]', async () => {
      const port = inject('serverEverythingPort');
      const freshContext = await createClientHttpContext({ name: 'reconnect-verify', port });
      await freshContext.connector.connect();
      await freshContext.connector.disconnect();
      await freshContext.connector.connect();

      // verify full functionality after reconnect
      const result = await freshContext.connector.callTool('echo', {
        message: 'post-reconnect',
      });

      expect(result.content).toBeDefined();
      expect(result.content![0]).toMatchObject({
        type: 'text',
        text: 'Echo: post-reconnect',
      });

      await freshContext.teardown();
    });
  });

  describe('error handling', () => {
    clientHttpTest('should reject request when not connected [TRANSPORT-005]', async () => {
      const port = inject('serverEverythingPort');
      const freshContext = await createClientHttpContext({ name: 'not-connected', port });

      // do not connect -- try to use directly
      await expect(freshContext.connector.listTools()).rejects.toThrow(
        /not connected/i,
      );

      await freshContext.teardown();
    });
  });
});
