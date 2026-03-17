/**
 * E2E tests for tools via HttpMcpConnector against server-everything
 *
 * validates tool listing, tool calling (echo, get-sum, get-tiny-image),
 * long-running operations, and unknown tool error handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type {
  ImageContent,
  TextContent,
  ContentBlock,
} from '@coremcp/protocol';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITES //

describe('e2e:client-connector-http/tools', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should list all available tools [TOOL-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies listTools returns the server's full tool catalog.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#listing-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L701-L710 (ListToolsRequest/ListToolsResult)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L365-L369 (listTools)
     */
    const tools = await ctx.connector.listTools();

    expect(tools.length).toBeGreaterThan(0);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('echo');
    expect(toolNames).toContain('get-sum');
    expect(toolNames).toContain('get-tiny-image');
    expect(toolNames).toContain('trigger-long-running-operation');
  });

  it('should include tool descriptions and input schemas [TOOL-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies tools returned by listTools include descriptions and JSON Schema
     * input definitions.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#listing-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L818-L833 (Tool.description and Tool.inputSchema)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector.ts#L365-L369 (listTools)
     */
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

  it('should call echo tool and receive response [TOOL-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies tools/call returns a text response for the echo tool.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#calling-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L744-L752 (CallToolRequest)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L36-L60 (callTool)
     */
    const result = await ctx.connector.callTool('echo', { message: 'hello' });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const content = result.content as ContentBlock[];
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: 'text',
      text: 'Echo: hello',
    });
  });

  it('should call get-sum tool with numeric arguments [TOOL-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies tools/call accepts numeric arguments and returns the computed sum.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#calling-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L744-L752 (CallToolRequest.params.arguments)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L43-L60 (callTool)
     */
    const result = await ctx.connector.callTool('get-sum', { a: 5, b: 3 });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const addContent = result.content as ContentBlock[];
    expect(addContent).toHaveLength(1);

    const textContent = addContent[0] as TextContent;
    expect(textContent.type).toBe('text');
    expect(textContent.text).toContain('8');
  });

  it('should call get-tiny-image tool and receive image content [TOOL-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies tools/call can return mixed content including image blocks.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#image-content
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L1032-L1048 (ImageContent)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L43-L60 (callTool)
     */
    const result = await ctx.connector.callTool('get-tiny-image', {});

    expect(result.isError).toBeFalsy();
    // server-everything returns 3 content items: text intro, image, text outro
    expect(result.content).toBeDefined();
    const imgContent = result.content as ContentBlock[];
    expect(imgContent).toHaveLength(3);

    const imageContent = imgContent.find(
      (c): c is ImageContent => c.type === 'image',
    );
    expect(imageContent).toEqual(
      expect.objectContaining({
        type: 'image',
        mimeType: expect.stringMatching(/^image\//),
        data: expect.any(String),
      }),
    );
  });

  it('should handle trigger-long-running-operation with progress [TOOL-005]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies the connector can invoke a long-running tool call and receive a
     * successful completion response.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#calling-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L43-L60 (callTool)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L307-L327 (ProgressNotification)
     */
    const result = await ctx.connector.callTool(
      'trigger-long-running-operation',
      {
        duration: 1,
        steps: 3,
      },
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const lroContent = result.content as ContentBlock[];
    expect(lroContent).toHaveLength(1);

    const lroTextContent = lroContent[0] as TextContent;
    expect(lroTextContent.type).toBe('text');
    expect(lroTextContent.text).toContain('completed');
  }, 15_000);

  it('should handle unknown tool error [TOOL-005]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies tool-call failures are surfaced as errors when the server reports
     * a missing tool or other exceptional condition.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/protocol/src/schemas/2025-11-25/schema.ts#L731-L740 (CallToolResult.isError and protocol-level tool lookup failures)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/client/src/connector/tools.ts#L43-L60 (callTool throws ToolError on isError)
     */
    await expect(
      ctx.connector.callTool('nonExistentTool', {}),
    ).rejects.toThrow();
  });
});
