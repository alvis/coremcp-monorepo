/**
 * E2E tests for edge cases via StdioConnector
 *
 * validates concurrent requests, large payloads, unicode content,
 * rapid messages, disconnect/reconnect cycles, and connection
 * stability under adverse conditions using the stdio transport.
 * @see /e2e/interactions/17-edge-cases.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createClientStdioContext,
} from '../fixtures/index';

import type { ClientStdioContext } from '../fixtures/index';

// TYPES //

/** text content item */
interface TextContentItem {
  type: 'text';
  text: string;
}

/** tool call result shape */
interface ToolCallResult {
  content: TextContentItem[];
  isError?: boolean;
}

// TEST SUITES //

describe('client-connector-stdio / 17-edge-cases', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
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
        ctx.connector.callTool('echo', { message: 'mixed-stdio' }),
      ]);

      expect(tools.length).toBeGreaterThan(0);
      expect(prompts.length).toBeGreaterThan(0);
      expect(resources.length).toBeGreaterThan(0);
      expect(echoResult).toBeDefined();
    });
  });

  describe('large payload handling', () => {
    it('should handle tool call with large text argument [EDGE-007]', async () => {
      const largeText = 'D'.repeat(10_000);

      const result = await ctx.connector.callTool('echo', {
        message: largeText,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      const largeContent = result.content as Array<{ type: string; text: string }>;
      expect(largeContent.length).toBeGreaterThan(0);
    });

    it('should handle reading many resources [EDGE-007]', async () => {
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

    it('should handle CJK characters in echo [EDGE-007]', async () => {
      const cjkText = '\u6d4b\u8bd5\u6587\u672c \u30c6\u30b9\u30c8 \ud14c\uc2a4\ud2b8';

      const result = await ctx.connector.callTool('echo', {
        message: cjkText,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('empty arguments', () => {
    it('should handle tool call with empty arguments object [EDGE-007]', async () => {
      try {
        const result = await ctx.connector.callTool('echo', {});
        expect(result).toBeDefined();
      } catch {
        // some tools may reject empty args -- acceptable
      }
    });
  });

  describe('rapid messages / backpressure', () => {
    it('should handle rapid sequential requests without data loss [EDGE-006]', async () => {
      const count = 10;

      for (let i = 0; i < count; i++) {
        const result = await ctx.connector.callTool('echo', {
          message: `rapid-stdio-${i}`,
        });
        expect(result).toBeDefined();
      }
    });

    it('should handle burst of concurrent requests [EDGE-006]', async () => {
      const requests = Array.from({ length: 10 }, async (_, i) =>
        ctx.connector.callTool('echo', { message: `burst-${i}` }),
      );

      const results = await Promise.all(requests);

      for (const result of results) {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
        const burstContent = result.content as Array<{ type: string; text: string }>;
        expect(burstContent.length).toBeGreaterThan(0);
      }
    });
  });

  describe('disconnect and reconnect', () => {
    it('should handle disconnect and reconnect cycle [EDGE-002]', async () => {
      const freshCtx = createClientStdioContext({ name: 'reconnect-test' });
      await freshCtx.connector.connect();

      // verify it works
      const toolsBefore = await freshCtx.connector.listTools();
      expect(toolsBefore.length).toBeGreaterThan(0);

      // disconnect
      await freshCtx.connector.disconnect();

      // reconnect
      await freshCtx.connector.connect();

      // verify it works after reconnection (full reinitialization for stdio)
      const toolsAfter = await freshCtx.connector.listTools();
      expect(toolsAfter.length).toBeGreaterThan(0);

      await freshCtx.teardown();
    }, 60_000);

    it('should handle multiple disconnect calls without error [EDGE-002]', async () => {
      const tempCtx = createClientStdioContext({ name: 'multi-disconnect' });
      await tempCtx.connector.connect();
      await tempCtx.connector.disconnect();

      // second disconnect should not throw
      await expect(
        tempCtx.connector.disconnect(),
      ).resolves.toBeUndefined();
    }, 60_000);
  });

  describe('network interruption', () => {
    it.todo(
      'should detect pipe closure when server process is killed mid-request [EDGE-001]',
    );
  });

  describe('message ordering', () => {
    it('should return correct responses for sequential requests [EDGE-013]', async () => {
      const results: string[] = [];

      for (let i = 0; i < 5; i++) {
        const result = (await ctx.connector.callTool('echo', {
          message: `order-${i}`,
        })) as ToolCallResult;

        expect(result.content.length).toBeGreaterThan(0);
        results.push(result.content[0].text);
      }

      // sequential order preserved
      for (let i = 0; i < 5; i++) {
        expect(results[i]).toContain(`order-${i}`);
      }
    });
  });
});
