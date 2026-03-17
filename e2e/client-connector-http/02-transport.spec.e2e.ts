/**
 * transport tests for the coremcp HTTP client connector
 *
 * validates HTTP-specific transport behavior including session management,
 * concurrent request handling, reconnection behavior, and POST with JSON
 * responses using our HttpMcpConnector against server-everything.
 * @see /e2e/interactions/02-transport.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createClientHttpContext,
} from '../fixtures/index';

import type { TextContent } from '@coremcp/protocol';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-http / 02-transport', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('POST with JSON response', () => {
    it('should receive tool call response via POST [TRANSPORT-005]', async () => {
      const result = await ctx.connector.callTool('echo', {
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

    it('should receive tools/list response via POST [TRANSPORT-005]', async () => {
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('echo');
    });

    it('should receive resources/list response via POST [TRANSPORT-005]', async () => {
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    it('should receive prompts/list response via POST [TRANSPORT-005]', async () => {
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
    });

    it('should respond to ping via POST [TRANSPORT-005]', async () => {
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent tool calls [TRANSPORT-008]', async () => {
      const requests = [
        ctx.connector.callTool('echo', { message: 'first' }),
        ctx.connector.callTool('echo', { message: 'second' }),
        ctx.connector.callTool('get-sum', { a: 1, b: 2 }),
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

    it('should handle concurrent resource reads [TRANSPORT-008]', async () => {
      const resources = await ctx.connector.listResources();
      const testResources = resources.slice(0, 3);

      const requests = testResources.map(async (r) =>
        ctx.connector.readResource(r.uri),
      );
      const results = await Promise.all(requests);

      expect(results).toHaveLength(testResources.length);

      results.forEach((result, index) => {
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe(testResources[index].uri);
      });
    });

    it('should handle mixed concurrent operations [TRANSPORT-008]', async () => {
      const operations = [
        ctx.connector.callTool('echo', { message: 'mixed-1' }),
        ctx.connector.listTools(),
        ctx.connector.listResources(),
        ctx.connector.listPrompts(),
        ctx.connector.ping(),
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
    it('should disconnect and reconnect successfully [TRANSPORT-009]', async () => {
      const freshCtx = await createClientHttpContext({ name: 'reconnect-transport' });
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

    it('should function normally after reconnection [TRANSPORT-009]', async () => {
      const freshCtx = await createClientHttpContext({ name: 'reconnect-verify' });
      await freshCtx.connector.connect();
      await freshCtx.connector.disconnect();
      await freshCtx.connector.connect();

      // verify full functionality after reconnect
      const result = await freshCtx.connector.callTool('echo', {
        message: 'post-reconnect',
      });

      expect(result.content).toBeDefined();
      expect(result.content![0]).toMatchObject({
        type: 'text',
        text: 'Echo: post-reconnect',
      });

      await freshCtx.teardown();
    });
  });

  describe('error handling', () => {
    it('should reject request when not connected [TRANSPORT-005]', async () => {
      const freshCtx = await createClientHttpContext({ name: 'not-connected' });

      // do not connect — try to use directly
      await expect(freshCtx.connector.listTools()).rejects.toThrow(
        /not connected/i,
      );

      await freshCtx.teardown();
    });
  });
});
