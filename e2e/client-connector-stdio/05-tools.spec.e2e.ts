/**
 * E2E tests for tools via StdioConnector against server-everything
 *
 * validates tool listing, tool calling (echo, get-sum, get-tiny-image),
 * long-running operations, and unknown tool error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type { ImageContent, TextContent } from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/index';

// TEST SUITES //

describe('e2e:client-connector-stdio/tools', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should list all available tools [TOOL-001]', async () => {
    const tools = await ctx.connector.listTools();

    expect(tools.length).toBeGreaterThan(0);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'echo',
        'get-sum',
        'trigger-long-running-operation',
        'get-tiny-image',
      ]),
    );
  });

  it('should include tool descriptions and input schemas [TOOL-001]', async () => {
    const tools = await ctx.connector.listTools();
    const echoTool = tools.find((t) => t.name === 'echo');

    expect(echoTool).toEqual(
      expect.objectContaining({
        name: 'echo',
        description: expect.any(String),
        inputSchema: expect.objectContaining({
          type: 'object',
        }),
      }),
    );
  });

  it('should call echo tool and receive echoed message [TOOL-002]', async () => {
    const result = await ctx.connector.callTool('echo', {
      message: 'hello e2e',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const echoContent = result.content!;
    expect(echoContent).toHaveLength(1);
    expect(echoContent[0]).toEqual({
      type: 'text',
      text: 'Echo: hello e2e',
    });
  });

  it('should call get-sum tool and return correct sum [TOOL-002]', async () => {
    const result = await ctx.connector.callTool('get-sum', { a: 17, b: 25 });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const addContent = result.content!;
    expect(addContent).toHaveLength(1);
    expect(addContent[0]).toEqual({
      type: 'text',
      text: 'The sum of 17 and 25 is 42.',
    });
  });

  it('should call get-tiny-image and return base64 PNG image [TOOL-002]', async () => {
    const result = await ctx.connector.callTool('get-tiny-image', {});

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const imgContent = result.content!;
    expect(imgContent).toHaveLength(3);

    // first content is text intro
    const textContent1 = imgContent[0] as TextContent;
    expect(textContent1).toEqual({
      type: 'text',
      text: "Here's the image you requested:",
    });

    // second content is the image
    const imageContent = imgContent[1] as ImageContent;
    expect(imageContent).toEqual(
      expect.objectContaining({
        type: 'image',
        mimeType: 'image/png',
        data: expect.any(String),
      }),
    );

    // verify valid base64
    expect(() => atob(imageContent.data)).not.toThrow();

    // third content is text outro
    const textContent2 = imgContent[2] as TextContent;
    expect(textContent2).toEqual({
      type: 'text',
      text: 'The image above is the MCP logo.',
    });
  });

  it('should call trigger-long-running-operation and complete successfully [TOOL-005]', async () => {
    const result = await ctx.connector.callTool('trigger-long-running-operation', {
      duration: 1,
      steps: 3,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const lroContent = result.content!;
    expect(lroContent).toHaveLength(1);

    const textContent = lroContent[0] as TextContent;
    expect(textContent).toEqual({
      type: 'text',
      text: 'Long running operation completed. Duration: 1 seconds, Steps: 3.',
    });
  }, 30_000);

  it('should handle unknown tool error [TOOL-005]', async () => {
    await expect(
      ctx.connector.callTool('nonExistentTool', {}),
    ).rejects.toThrow();
  });
});
