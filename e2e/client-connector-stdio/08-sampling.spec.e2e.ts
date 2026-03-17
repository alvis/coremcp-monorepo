/**
 * sampling tests for the coremcp stdio client connector against server-everything
 *
 * validates that our StdioConnector correctly handles server-initiated
 * sampling/createMessage requests. server-everything's sampleLLM tool
 * triggers a sampling request from server to client.
 * @see /e2e/interactions/08-sampling.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type {
  CallToolResult,
  CreateMessageResult,
  TextContent,
} from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/index';

// CONSTANTS //

const SAMPLE_RESPONSE_TEXT = 'Sample response from client';

const SAMPLE_RESULT: CreateMessageResult = {
  model: 'test-model',
  role: 'assistant',
  content: { type: 'text', text: SAMPLE_RESPONSE_TEXT },
};

// TEST SUITES //

describe('client-connector-stdio / 08-sampling', () => {
  describe('sampling without handler', () => {
    let ctx: ClientStdioContext;

    beforeAll(async () => {
      ctx = createClientStdioContext();
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should reject sampling request when no sampling handler is configured [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that when the client has not declared sampling capability, the server's
       * attempt to send sampling/createMessage fails. per spec, the server checks
       * _clientCapabilities.sampling and throws CapabilityNotSupported if missing.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#capabilities
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L256-L260 (assertCapabilityForMethod: sampling/createMessage check)
       */
      // the connector created by createClientStdioContext does not have
      // sampling capability enabled, so calling sampleLLM on server-everything
      // should result in an error because the client cannot handle
      // sampling/createMessage requests
      await expect(
        ctx.connector.callTool('sampleLLM', {
          prompt: 'Test sampling',
          maxTokens: 10,
        }),
      ).rejects.toThrow();
    });
  });

  describe('sampleLLM tool availability', () => {
    let ctx: ClientStdioContext;

    beforeAll(async () => {
      ctx = createClientStdioContext();
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should list sampleLLM as an available tool [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server-everything exposes a sampleLLM tool which triggers
       * server-initiated sampling/createMessage requests. this validates tool discovery
       * as a prerequisite for sampling tests.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L496-L554 (createMessage implementation)
       */
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('sampleLLM');
    });

    it('should include sampleLLM tool with proper input schema [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the sampleLLM tool has a description and inputSchema, confirming it
       * conforms to the Tool type in the MCP spec. this is a prerequisite for invoking
       * the tool to trigger sampling/createMessage.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L496-L554 (createMessage implementation)
       */
      const tools = await ctx.connector.listTools();
      const sampleTool = tools.find((t) => t.name === 'sampleLLM');

      expect(sampleTool).toBeDefined();
      expect(sampleTool?.description).toBeDefined();
      expect(sampleTool?.inputSchema).toBeDefined();
    });
  });

  describe('sampling with handler', () => {
    // NOTE: Using onRequest handler with sampling capability because
    // server-everything's sampleLLM tool triggers server->client
    // sampling/createMessage
    let ctx: ClientStdioContext;

    beforeAll(async () => {
      ctx = createClientStdioContext({
        capabilities: {
          roots: { listChanged: true },
          sampling: { context: {}, tools: {} },
        },
        onRequest: async (request) => {
          if (request.method === 'sampling/createMessage') {
            return { result: { ...SAMPLE_RESULT } };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
      });
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should handle sampling/createMessage and return result [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that with sampling capability declared, the client correctly handles
       * the server's sampling/createMessage request and returns a valid CreateMessageResult.
       * per spec, the result MUST contain model, role, and content. the client responds
       * via the onRequest handler with the SAMPLE_RESULT fixture.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#creating-messages
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L496-L554 (createMessage validates result against CreateMessageResultSchema)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1828-L1849 (CreateMessageResultSchema: model, stopReason?, role, content)
       */
      const tools = await ctx.connector.listTools();
      const toolNames = tools.map((t) => t.name);

      if (!toolNames.includes('sampleLLM')) {
        return;
      }

      const result = (await ctx.connector.callTool('sampleLLM', {
        prompt: 'Test sampling',
        maxTokens: 10,
      })) as CallToolResult;

      expect(result.content).toBeDefined();

      const textBlocks = result.content.filter(
        (c): c is TextContent => c.type === 'text',
      );
      const fullText = textBlocks.map((b) => b.text).join('\n');

      expect(fullText).toContain(SAMPLE_RESPONSE_TEXT);
    });
  });

  describe('sampling with model preferences', () => {
    it.todo(
      'should handle sampling request with modelPreferences [SAMPLING-002] - requires custom connector with onSampling handler and model preferences support',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing modelPreferences in sampling/createMessage via server-everything.
         * per spec, modelPreferences includes hints, costPriority, speedPriority, intelligencePriority.
         *
         * pseudo-code:
         * 1. create client context with sampling capability and onRequest handler
         * 2. capture the CreateMessageRequest params in the handler
         * 3. call sampleLLM tool with modelPreferences (hints, costPriority, intelligencePriority)
         * 4. verify capturedParams.modelPreferences contains the expected hints and priority values
         * 5. verify the handler's CreateMessageResult is returned successfully
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#model-preferences
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1689-L1706 (ModelPreferencesSchema)
         */
      },
    );
  });

  describe('sampling with tools', () => {
    it.todo(
      'should handle sampling request with tools parameter [SAMPLING-003] - requires 2025-11-25 protocol support in server-everything',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing tools and toolChoice in sampling/createMessage via server-everything.
         * per spec, clients MUST declare sampling.tools capability for tool-enabled requests.
         *
         * pseudo-code:
         * 1. create client context with sampling capability including sampling.tools
         * 2. configure onRequest handler to capture CreateMessageRequest params
         * 3. trigger a sampling request that includes tools array and toolChoice
         * 4. verify capturedParams.tools contains the expected tool definitions
         * 5. verify capturedParams.toolChoice matches the expected mode (e.g., 'auto')
         * 6. verify the sampling result is returned successfully
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#sampling-with-tools
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L500-L503 (tools capability check)
         */
      },
    );
  });

  describe('task-augmented sampling', () => {
    it.todo(
      'should handle task-augmented sampling request [SAMPLING-004] - requires task support in sampling handler',
      async () => {
        // SPEC ALIGNMENT: TODO
        /**
         * placeholder for testing task-augmented sampling where client returns CreateTaskResult.
         * per spec, client may return a task instead of immediate CreateMessageResult when
         * capabilities.tasks.requests.sampling.createMessage is declared.
         *
         * pseudo-code:
         * 1. create client context with sampling + tasks capabilities
         * 2. configure onRequest handler to return a CreateTaskResult (with taskId, status)
         *    instead of a direct CreateMessageResult
         * 3. trigger a sampling/createMessage request from the server
         * 4. verify the server receives a task object with id, status, and result fields
         * 5. verify the task can be polled/resolved to get the final CreateMessageResult
         *
         * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#creating-messages
         * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L496-L554 (createMessage)
         */
      },
    );
  });
});
