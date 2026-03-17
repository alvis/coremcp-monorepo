/**
 * E2E tests for tools via stdio transport using StdioConnector
 *
 * validates tool listing, tool calling (echo, add, get-image), structured output,
 * unknown tool error handling, cursor-based pagination, list_changed notification,
 * and isError flag against the coremcp test server.
 */

import { ToolError } from '@coremcp/client';
import { JsonRpcError } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';
import { TEST_TOOLS } from '../fixtures/test-server';

import type { McpServerNotification } from '@coremcp/protocol';

import type { ServerStdioClientContext } from '../fixtures/index';

// TYPES //

/** image content item */
interface ImageContentItem {
  type: 'image';
  data: string;
  mimeType: string;
}

// TEST SUITES //

describe('server-transport-stdio / tools', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should list all tools with metadata [TOOL-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies tools/list returns all registered tools with correct metadata (name, description,
     * inputSchema). Per spec, tools/list response contains an array of Tool objects each with
     * a name (unique identifier), description, and inputSchema (JSON Schema object with type "object").
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#listing-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1504-L1530 (ListToolsRequest, ListToolsResult)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1727-L1772 (Tool interface: name, description, inputSchema)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L139-L167 (tools/list handler)
     */
    const tools = await ctx.connector.listTools();

    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));

    // verify tool structure
    const echoTool = tools.find((t) => t.name === 'echo');
    expect(echoTool).toEqual(
      expect.objectContaining({
        name: 'echo',
        description: expect.any(String),
        inputSchema: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
        }),
      }),
    );
  });

  it('should call echo tool [TOOL-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies tools/call with the echo tool returns a text content block matching the input.
     * Per spec, tools/call sends a request with name and arguments, and the response contains
     * a content array with typed content blocks (here TextContent with type "text").
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#calling-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1546-L1580 (CallToolResult: content, isError, structuredContent)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2316-L2338 (TextContent interface)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L168-L200 (tools/call handler)
     */
    const result = await ctx.connector.callTool('echo', {
      text: 'hello inspector',
    });

    expect(result.content).toBeDefined();
    expect(result.content!).toHaveLength(1);
    expect(result.content![0]).toEqual({
      type: 'text',
      text: 'hello inspector',
    });
  });

  it('should call add tool with numeric args [TOOL-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies tools/call with numeric arguments returns the correct computed result.
     * Per spec, tools/call params include name and arguments (object), and the response
     * contains a content array. The add tool returns the sum as a text content block.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#calling-tools
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1597-L1616 (CallToolRequestParams: name, arguments)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L203-L244 (tools/call validation wrapper)
     */
    const result = await ctx.connector.callTool('add', { a: 17, b: 25 });

    expect(result.content).toBeDefined();
    expect(result.content!).toHaveLength(1);
    expect(result.content![0]).toEqual({
      type: 'text',
      text: '42',
    });
  });

  it('should call get-image and validate binary [TOOL-003]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies tools/call can return ImageContent with base64-encoded binary data.
     * Per spec, tool results may contain image content blocks with type "image",
     * a mimeType field, and base64-encoded data string.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#image-content
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2340-L2362 (ImageContent: type, data, mimeType, annotations)
     */
    const result = await ctx.connector.callTool('get-image');

    expect(result.content).toBeDefined();
    expect(result.content!).toHaveLength(1);

    const imageContent = result.content![0] as ImageContentItem;
    expect(imageContent).toEqual(
      expect.objectContaining({
        type: 'image',
        mimeType: 'image/png',
        data: expect.any(String),
      }),
    );

    // verify valid base64
    expect(() => atob(imageContent.data)).not.toThrow();
  });

  it('should call structured-output tool and return structuredContent [TOOL-004]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies structured output: tool declares outputSchema in tools/list, and tools/call returns
     * both content (TextContent with serialized JSON) and structuredContent (parsed JSON object).
     * Per spec, if outputSchema is provided, servers MUST return structured results conforming
     * to it, and for backwards compat, SHOULD also return serialized JSON in a TextContent block.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#structured-content
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#output-schema
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1727-L1772 (Tool interface: outputSchema field)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1546-L1580 (CallToolResult: structuredContent)
     */
    // 1. verify outputSchema is present in tool listing
    const tools = await ctx.connector.listTools();
    const structuredTool = tools.find((t) => t.name === 'structured-output');
    expect(structuredTool).toBeDefined();
    expect(
      (structuredTool as { outputSchema?: Record<string, unknown> })
        .outputSchema,
    ).toBeDefined();

    const outputSchema = (
      structuredTool as { outputSchema: Record<string, unknown> }
    ).outputSchema;
    expect(outputSchema.type).toBe('object');
    expect(outputSchema.properties).toBeDefined();

    // 2. call the tool and validate content + structuredContent
    const result = await ctx.connector.callTool('structured-output', {
      itemCount: 2,
    });

    expect(result.content).toBeDefined();
    expect(result.content!).toHaveLength(1);

    // text content equals JSON.stringify of structuredContent
    expect(result.structuredContent).toBeDefined();
    expect(result.content![0]).toEqual({
      type: 'text',
      text: JSON.stringify(result.structuredContent),
    });

    // 3. validate structuredContent against the declared schema
    const structured = result.structuredContent as Record<string, unknown>;
    expect(typeof structured.itemsProcessed).toBe('number');
    expect(typeof structured.status).toBe('string');
    expect(Array.isArray(structured.results)).toBe(true);

    // verify the required fields from the schema are present
    const requiredFields = outputSchema.required as string[] | undefined;
    if (requiredFields) {
      for (const field of requiredFields) {
        expect(structured).toHaveProperty(field);
      }
    }
  });

  it('should handle unknown tool error [TOOL-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * Verifies that calling a nonexistent tool returns a JSON-RPC protocol error with code -32602
     * (InvalidParams). Per spec, errors in finding the tool should be reported as MCP protocol-level
     * error responses, not as tool execution errors with isError: true.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1546-L1580 (CallToolResult.isError docs: "errors in finding the tool... should be reported as an MCP error response")
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L169-L171 (throws ProtocolError InvalidParams for unknown tool)
     */
    // connector throws for unknown tool errors with InvalidParams code
    try {
      await ctx.connector.callTool('nonexistent-tool');
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(JsonRpcError);
      expect((error as JsonRpcError).code).toBe(-32602);
    }
  });

  describe('tools/list pagination', () => {
    it('should paginate tools with cursor-based navigation [TOOL-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies cursor-based pagination for tools/list. Per spec, tools/list supports pagination:
       * the request may include an optional cursor param, and the response may include nextCursor.
       * Pages must not overlap, and each page returns a bounded number of tools.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#listing-tools
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1504-L1530 (ListToolsRequest extends PaginatedRequest, ListToolsResult extends PaginatedResult)
       */
      // first page without cursor returns up to PAGE_SIZE=3 items
      const firstPage = await ctx.connector.sendRequest<{
        tools: Array<{ name: string; description?: string }>;
        nextCursor?: string;
      }>({ method: 'tools/list', params: {} });

      expect(firstPage.tools.length).toBeGreaterThan(0);
      expect(firstPage.tools.length).toBeLessThanOrEqual(3);
      expect(firstPage.nextCursor).toBeDefined();

      // second page uses the opaque cursor from the first page
      const secondPage = await ctx.connector.sendRequest<{
        tools: Array<{ name: string; description?: string }>;
        nextCursor?: string;
      }>({ method: 'tools/list', params: { cursor: firstPage.nextCursor } });

      expect(secondPage.tools.length).toBeGreaterThan(0);

      // pages must not overlap
      const firstNames = new Set(firstPage.tools.map((t) => t.name));
      expect(secondPage.tools.every((t) => !firstNames.has(t.name))).toBe(true);
    });
  });

  describe('tools/list_changed notification', () => {
    it('should receive list_changed notification when triggered [TOOL-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that servers emit notifications/tools/list_changed when the tool list changes.
       * Per spec, servers declaring tools capability with listChanged: true will emit this
       * notification, which clients can use to re-fetch the tool list.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#list-changed-notification
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L307-L314 (assertCapabilityForMethod: notifications/tools/list_changed)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L673-L674 (sendToolListChanged notification)
       */
      const notifications: McpServerNotification[] = [];

      const notifyCtx = createServerStdioClientContext({
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyCtx.connector.connect();

        await notifyCtx.connector.callTool('trigger-list-changed', {
          target: 'tools',
        });

        // allow time for the notification to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        const listChangedNotifications = notifications.filter(
          (n) => n.method === 'notifications/tools/list_changed',
        );
        expect(listChangedNotifications.length).toBeGreaterThanOrEqual(1);
      } finally {
        await notifyCtx.teardown();
      }
    }, 30_000);
  });

  describe('tool isError flag', () => {
    it('should throw ToolError for failing tool in sync mode [TOOL-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that tool execution errors are surfaced as thrown ToolError exceptions
       * on the client side. Per spec, tool execution errors (API failures, validation
       * errors, business logic errors) set isError: true with actionable feedback in the
       * content array. The client converts these into thrown ToolError instances whose
       * result property preserves the original CallToolResult for inspection.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1546-L1580 (CallToolResult.isError: "Any errors that originate from the tool SHOULD be reported inside the result object, with isError set to true")
       */
      // task-failing in sync mode (no task param) returns isError: true,
      // which the client surfaces as a ToolError
      try {
        await ctx.connector.callTool('task-failing', {
          reason: 'deliberate test failure',
        });
        expect.unreachable('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ToolError);
        const toolError = error as ToolError;
        expect(toolError.message).toBe('deliberate test failure');
        expect(toolError.result.isError).toBe(true);
        expect(toolError.result.content).toHaveLength(1);
        expect(toolError.result.content[0]).toEqual({
          type: 'text',
          text: 'deliberate test failure',
        });
      }
    });
  });
});
