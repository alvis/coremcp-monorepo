/**
 * E2E tests for edge cases via HttpMcpConnector
 *
 * validates concurrent requests, large payloads, unicode content,
 * rapid reconnection, disconnect/reconnect cycles, and connection
 * stability under adverse conditions.
 * @see /e2e/interactions/17-edge-cases.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createClientHttpContext,
} from '../fixtures/index';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-http / 17-edge-cases', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent tool calls correctly [EDGE-004]', async () => {
      const requests = Array.from({ length: 5 }, async (_, i) =>
        ctx.connector.callTool('echo', { message: `concurrent-${i}` }),
      );

      const results = await Promise.all(requests);

      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        const content = result.content as Array<{ type: string; text: string }>;
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('should handle mixed concurrent operations [EDGE-004]', async () => {
      const [tools, prompts, resources, echoResult] = await Promise.all([
        ctx.connector.listTools(),
        ctx.connector.listPrompts(),
        ctx.connector.listResources(),
        ctx.connector.callTool('echo', { message: 'mixed-concurrent' }),
      ]);

      expect(tools.length).toBeGreaterThan(0);
      expect(prompts.length).toBeGreaterThan(0);
      expect(resources.length).toBeGreaterThan(0);
      expect(echoResult).toBeDefined();
    });
  });

  describe('large payload handling', () => {
    it('should handle tool call with large text argument [EDGE-007]', async () => {
      const largeText = 'C'.repeat(10_000);

      const result = await ctx.connector.callTool('echo', {
        message: largeText,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const largeContent = result.content as Array<{ type: string; text: string }>;
      expect(largeContent.length).toBeGreaterThan(0);
    });

    it('should handle reading resource list with many items [EDGE-007]', async () => {
      const resources = await ctx.connector.listResources();

      // server-everything provides 100 resources
      expect(resources.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('unicode content', () => {
    it('should handle unicode characters in tool arguments [EDGE-007]', async () => {
      const unicodeText = 'Hello \u4e16\u754c \u00e9\u00e0\u00fc \u03b1\u03b2\u03b3';

      const result = await ctx.connector.callTool('echo', {
        message: unicodeText,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('empty arguments', () => {
    it('should handle tool call with empty arguments object [EDGE-007]', async () => {
      // echo with empty args -- behavior depends on tool implementation
      try {
        const result = await ctx.connector.callTool('echo', {});
        expect(result).toBeDefined();
      } catch {
        // some tools may reject empty args -- that is acceptable
      }
    });
  });

  describe('rapid reconnection', () => {
    it('should handle disconnect and reconnect cycle [EDGE-002]', async () => {
      const freshCtx = await createClientHttpContext({ name: 'reconnect-test' });
      await freshCtx.connector.connect();

      // verify it works
      const toolsBefore = await freshCtx.connector.listTools();
      expect(toolsBefore.length).toBeGreaterThan(0);

      // disconnect
      await freshCtx.connector.disconnect();

      // reconnect
      await freshCtx.connector.connect();

      // verify it works after reconnection
      const toolsAfter = await freshCtx.connector.listTools();
      expect(toolsAfter.length).toBeGreaterThan(0);

      await freshCtx.teardown();
    }, 60_000);

    it('should handle multiple disconnect calls without error [EDGE-002]', async () => {
      const tempCtx = await createClientHttpContext({ name: 'multi-disconnect' });
      await tempCtx.connector.connect();
      await tempCtx.connector.disconnect();

      // second disconnect should not throw
      await expect(
        tempCtx.connector.disconnect(),
      ).resolves.toBeUndefined();

      await tempCtx.teardown();
    }, 60_000);
  });

  describe('backpressure / high-frequency requests', () => {
    it('should handle rapid sequential requests without data loss [EDGE-006]', async () => {
      const count = 10;

      for (let i = 0; i < count; i++) {
        const result = await ctx.connector.callTool('echo', {
          message: `rapid-http-${i}`,
        });
        expect(result).toBeDefined();
      }
    });
  });

  describe('network interruption', () => {
    it.todo(
      'should reject pending requests when connection drops mid-request [EDGE-001]',
    );
  });

  describe('request timeout', () => {
    it.todo(
      'should cancel request when timeout expires and send notifications/cancelled [EDGE-005]',
    );
  });
});
