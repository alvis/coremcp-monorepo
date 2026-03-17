/**
 * transport tests for the coremcp stdio client connector
 *
 * validates stdio-specific transport behavior including stdin/stdout
 * communication, rapid message handling, connection stability after
 * errors, status reporting, and graceful disconnect using our
 * StdioConnector against server-everything.
 * @see /e2e/interactions/02-transport.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createClientStdioContext,
} from '../fixtures/index';

import type { TextContent, Tool, Prompt } from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('client-connector-stdio / 02-transport', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('basic message exchange', () => {
    it('should exchange messages via stdin/stdout [TRANSPORT-001]', async () => {
      const result = await ctx.connector.callTool('echo', {
        message: 'stdio-transport',
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      expect(result.content).toBeDefined();
      const textContent = result.content![0] as TextContent;

      expect(textContent).toEqual({
        type: 'text',
        text: 'Echo: stdio-transport',
      });
    });

    it('should handle tools/list via stdio [TRANSPORT-001]', async () => {
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t: Tool) => t.name);

      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('get-sum');
    });

    it('should handle resources/list via stdio [TRANSPORT-001]', async () => {
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    it('should handle prompts/list via stdio [TRANSPORT-001]', async () => {
      const prompts = await ctx.connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);

      const promptNames = prompts.map((p: Prompt) => p.name);

      expect(promptNames).toContain('simple-prompt');
    });

    it('should handle numeric computation via stdio [TRANSPORT-001]', async () => {
      const result = await ctx.connector.callTool('get-sum', { a: 17, b: 25 });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      expect(result.content).toBeDefined();
      const textContent = result.content![0] as TextContent;

      expect(textContent).toEqual({
        type: 'text',
        text: 'The sum of 17 and 25 is 42.',
      });
    });
  });

  describe('rapid messages', () => {
    it('should handle rapid sequential messages [TRANSPORT-001]', async () => {
      const [tools, prompts, resources, echoResult1, echoResult2] =
        await Promise.all([
          ctx.connector.listTools(),
          ctx.connector.listPrompts(),
          ctx.connector.listResources(),
          ctx.connector.callTool('echo', { message: 'rapid-1' }),
          ctx.connector.callTool('echo', { message: 'rapid-2' }),
        ]);

      // verify all requests completed successfully
      expect((tools).length).toBeGreaterThan(0);
      expect((prompts).length).toBeGreaterThan(0);
      expect((resources as Array<{ uri: string }>).length).toBeGreaterThan(0);

      expect(echoResult1.isError).toBeFalsy();
      expect(echoResult2.isError).toBeFalsy();

      expect(echoResult1.content).toBeDefined();
      expect(echoResult2.content).toBeDefined();
      expect((echoResult1.content![0] as TextContent).text).toBe(
        'Echo: rapid-1',
      );
      expect((echoResult2.content![0] as TextContent).text).toBe(
        'Echo: rapid-2',
      );
    });
  });

  describe('connection stability after errors', () => {
    it('should maintain connection after error responses [TRANSPORT-002]', async () => {
      // trigger an error by calling unknown tool
      await expect(
        ctx.connector.callTool('nonExistentTool', {}),
      ).rejects.toThrow();

      // connection should still be active
      expect(ctx.connector.info.isConnected).toBe(true);

      // should be able to make subsequent requests
      const tools = await ctx.connector.listTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should handle connection stability during rapid operations [TRANSPORT-002]', async () => {
      // make many requests in sequence to verify stability
      for (let i = 0; i < 5; i++) {
        const result = await ctx.connector.callTool('echo', {
          message: `stability-${i}`,
        });

        expect(result.isError).toBeFalsy();
        expect(result.content).toBeDefined();
        expect((result.content![0] as TextContent).text).toBe(
          `Echo: stability-${i}`,
        );
      }

      expect(ctx.connector.info.isConnected).toBe(true);
    });
  });

  describe('status reporting', () => {
    it('should report correct status information [TRANSPORT-001]', () => {
      const status = ctx.connector.status;

      expect(status).toEqual({
        status: 'connected',
        transport: 'StdioConnector',
        processInfo: {
          pid: expect.any(Number),
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
          uptime: expect.any(Number),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('disconnect', () => {
    it('should disconnect and report status correctly [LIFECYCLE-005]', async () => {
      const testCtx = createClientStdioContext({ name: 'disconnect-transport' });
      await testCtx.connector.connect();

      expect(testCtx.connector.info.isConnected).toBe(true);

      await testCtx.connector.disconnect();

      expect(testCtx.connector.info.isConnected).toBe(false);
    }, 60_000);
  });

  describe('ping via stdio', () => {
    it('should handle ping request via stdin/stdout [TRANSPORT-001]', async () => {
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });
});
