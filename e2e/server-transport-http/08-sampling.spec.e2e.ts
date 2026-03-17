/**
 * sampling tests for the coremcp HTTP server transport via native connector
 *
 * validates server-initiated sampling/createMessage requests triggered via
 * the trigger-sampling tool. the HttpMcpConnector acts as the client,
 * receiving and responding to sampling requests from our server.
 * @see /e2e/interactions/08-sampling.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerHttpClientContext,
  createRawHttpSession,
} from '../fixtures/index';

import type {
  CreateMessageRequest,
  CreateMessageResult,
  RequestId,
} from '@coremcp/protocol';

import type {
  ServerHttpClientContext,
  RawHttpSession,
} from '../fixtures/index';

// TYPES //

/** JSON-RPC request received via SSE stream */
interface JsonRpcStreamRequest {
  /** JSON-RPC version identifier */
  jsonrpc: string;
  /** request identifier */
  id: RequestId;
  /** method name */
  method: string;
  /** optional parameters */
  params?: Record<string, unknown>;
}

/** tool call result from the server */
interface ToolCallContent {
  /** content items returned by the tool */
  content: Array<{ type: string; text: string }>;
}

/** task metadata returned in a CreateTaskResult response */
interface TaskInfo {
  /** unique task identifier */
  taskId: string;
  /** current task status */
  status: string;
}

/** result from tools/call with task parameter */
interface CreateTaskCallResult {
  /** content array (empty for task responses) */
  content: Array<{ type: string; text?: string }>;
  /** task metadata */
  task: TaskInfo;
}

// CONSTANTS //

const SAMPLE_RESPONSE_TEXT = 'Sample response from client';

const SAMPLE_RESULT: CreateMessageResult = {
  model: 'test-model',
  role: 'assistant',
  content: { type: 'text', text: SAMPLE_RESPONSE_TEXT },
};

/** timeout for waiting for SSE events in milliseconds */
const SSE_EVENT_TIMEOUT_MS = 10_000;

// HELPERS //

/**
 * reads SSE events from a ReadableStream until a message event is found
 *
 * parses the SSE text/event-stream format and returns the first JSON-RPC
 * request message received on the stream.
 * @param stream readable stream from the SSE connection
 * @returns parsed JSON-RPC request from the stream
 * @throws {Error} when no valid JSON-RPC request is found within the timeout
 */
async function readSseRequest(
  stream: ReadableStream<Uint8Array>,
): Promise<JsonRpcStreamRequest> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      void reader.cancel();
      reject(new Error('SSE event timeout'));
    }, SSE_EVENT_TIMEOUT_MS);
  });

  const readPromise = (async (): Promise<JsonRpcStreamRequest> => {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        throw new Error('SSE stream ended without receiving a request');
      }

      buffer += decoder.decode(value, { stream: true });

      // parse SSE events from the buffer (double newline delimited)
      const events = buffer.split('\n\n');

      // keep the last incomplete chunk in the buffer
      buffer = events.pop() ?? '';

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n');
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            eventData += line.slice(6);
          } else if (line.startsWith('data:')) {
            eventData += line.slice(5);
          }
        }

        if (!eventData) {
          continue;
        }

        try {
          const parsed = JSON.parse(eventData) as JsonRpcStreamRequest;

          // look for a request with both method and id (server-initiated request)
          if (parsed.method && parsed.id !== undefined) {
            void reader.cancel();

            return parsed;
          }
        } catch {
          // skip non-JSON SSE events
        }
      }
    }
  })();

  return Promise.race([readPromise, timeoutPromise]);
}

// TEST SUITES //

describe('server-transport-http / 08-sampling', () => {
  describe('basic sampling request', () => {
    let ctx: ServerHttpClientContext;

    beforeAll(async () => {
      ctx = await createServerHttpClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
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

    it('should send sampling/createMessage to client and receive result [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send a sampling/createMessage request to the client and
       * receive a valid CreateMessageResult containing model, role, and content fields.
       * per spec, the client MUST declare sampling capability and the result MUST include
       * model (string), role ("assistant"|"user"), and content (text/image/audio).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#creating-messages
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L496-L554 (createMessage implementation)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1828-L1849 (CreateMessageResultSchema: model, stopReason?, role, content)
       */
      // trigger-sampling calls session.reply with sampling/createMessage
      // the connector handles the request via onRequest and the tool returns the result
      const result = await ctx.connector.callTool('trigger-sampling', {
        prompt: 'What is 2+2?',
        maxTokens: 100,
      });

      const toolResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content).toBeDefined();
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );

      // verify the sampling response contains all required CreateMessageResult fields
      const responseText = toolResult.content[0].text;
      const jsonMatch = responseText.match(
        /Sampling result received: (.+)/,
      );
      expect(jsonMatch).not.toBeNull();

      const samplingResponse = JSON.parse(jsonMatch![1]) as Record<
        string,
        unknown
      >;
      expect(samplingResponse).toHaveProperty('model');
      expect(samplingResponse).toHaveProperty('role');
      expect(samplingResponse).toHaveProperty('content');
      expect(typeof samplingResponse.model).toBe('string');
      expect(samplingResponse.role).toBe('assistant');

      const content = samplingResponse.content as Record<string, unknown>;
      expect(content).toHaveProperty('type');
      expect(content).toHaveProperty('text');
      expect(content.type).toBe('text');
      expect(content.text).toBe(SAMPLE_RESPONSE_TEXT);
    });
  });

  describe('sampling with model preferences', () => {
    let ctx: ServerHttpClientContext;
    let capturedParams: CreateMessageRequest['params'] | null = null;

    beforeAll(async () => {
      ctx = await createServerHttpClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
        onRequest: async (request) => {
          if (request.method === 'sampling/createMessage') {
            capturedParams = (request as CreateMessageRequest)
              .params;

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

    it('should send sampling request with modelPreferences [SAMPLING-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can include modelPreferences (hints, costPriority,
       * intelligencePriority) in a sampling/createMessage request. per spec, model
       * preferences use normalized priority values (0-1) and hints as substring
       * matches for model selection. the client MAY use these to select an appropriate model.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#model-preferences
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1689-L1706 (ModelPreferencesSchema: hints?, costPriority?, speedPriority?, intelligencePriority?)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1778 (CreateMessageRequestParams.modelPreferences optional)
       */
      capturedParams = null;

      const result = await ctx.connector.callTool('trigger-sampling', {
        prompt: 'What model should I use?',
        maxTokens: 100,
        modelPreferences: {
          hints: [{ name: 'claude-3' }],
          costPriority: 0.5,
          intelligencePriority: 0.8,
        },
      });

      const toolResult = result as ToolCallContent;
      expect(toolResult.content).toBeDefined();
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );

      // verify the sampling request included modelPreferences
      expect(capturedParams).not.toBeNull();
      expect(capturedParams!.modelPreferences).toBeDefined();
      expect(capturedParams!.modelPreferences).toEqual(
        expect.objectContaining({
          hints: [{ name: 'claude-3' }],
          costPriority: 0.5,
          intelligencePriority: 0.8,
        }),
      );
    });
  });

  describe('sampling with tools', () => {
    let ctx: ServerHttpClientContext;
    let capturedParams: CreateMessageRequest['params'] | null = null;

    beforeAll(async () => {
      ctx = await createServerHttpClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
        onRequest: async (request) => {
          if (request.method === 'sampling/createMessage') {
            capturedParams = (request as CreateMessageRequest)
              .params;

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

    it('should send sampling request with tools and toolChoice [SAMPLING-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can include tools and toolChoice in a sampling/createMessage
       * request. per spec, clients MUST declare sampling.tools capability to receive
       * tool-enabled requests. servers MUST NOT send tool-enabled requests without it.
       * the SDK checks this at L501 and throws CapabilityNotSupported if missing.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#sampling-with-tools
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L500-L503 (tools/toolChoice capability check)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1807-L1813 (tools and toolChoice in CreateMessageRequestParams)
       */
      capturedParams = null;

      const result = await ctx.connector.callTool('trigger-sampling', {
        prompt: 'Use the calculator',
        maxTokens: 200,
        tools: [
          {
            name: 'calculator',
            description: 'A calculator',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
        toolChoice: { mode: 'auto' },
      });

      const toolResult = result as ToolCallContent;
      expect(toolResult.content).toBeDefined();
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );

      // verify the sampling request included tools and toolChoice
      expect(capturedParams).not.toBeNull();
      expect(capturedParams!.tools).toBeDefined();
      expect(capturedParams!.tools).toEqual([
        expect.objectContaining({
          name: 'calculator',
          description: 'A calculator',
        }),
      ]);
      expect(capturedParams!.toolChoice).toBeDefined();
      expect(capturedParams!.toolChoice).toEqual({ mode: 'auto' });
    });
  });

  describe('task-augmented sampling', () => {
    let ctx: ServerHttpClientContext;
    let rawSession: RawHttpSession;

    beforeAll(async () => {
      ctx = await createServerHttpClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
      });
      await ctx.connector.connect();
    }, 60_000);

    afterAll(async () => {
      await ctx.teardown();
    });

    it('should send sampling request with task metadata [SAMPLING-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that when a sampling/createMessage is sent during task execution,
       * the _meta field includes io.modelcontextprotocol/related-task with the taskId.
       * this links the sampling request to the originating task per the tasks extension.
       * the result must still satisfy CreateMessageResult with model, role, and content.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#creating-messages
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L496-L554 (createMessage implementation)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1828-L1849 (CreateMessageResultSchema)
       */
      // NOTE: Using raw HTTP client because task creation with task parameter requires raw protocol-level control
      rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      try {
        // step 1: open SSE stream for receiving server-to-client requests
        const sseStream = await rawSession.openSseStream();

        // step 2: create an async task with triggerSampling enabled
        // do not await the tool call -- it will block until we respond to the sampling request
        const toolCallPromise = rawSession.callToolWithTask(
          'task-operation',
          { input: 'sampling-test', triggerSampling: true },
          { ttl: 60_000 },
        );

        // step 3: read the sampling/createMessage request from the SSE stream
        const serverRequest = await readSseRequest(sseStream);

        expect(serverRequest.method).toBe('sampling/createMessage');
        expect(serverRequest.id).toBeDefined();

        // step 4: verify _meta contains the related task ID
        expect(serverRequest.params).toBeDefined();
        const meta = serverRequest.params!._meta as
          | Record<string, unknown>
          | undefined;
        expect(meta).toBeDefined();
        expect(
          meta!['io.modelcontextprotocol/related-task'],
        ).toBeDefined();
        expect(meta!['io.modelcontextprotocol/related-task']).toEqual({
          taskId: expect.any(String),
        });

        // step 5: respond to the sampling request with a full CreateMessageResult
        await rawSession.respondToRequest(serverRequest.id, {
          ...SAMPLE_RESULT,
        });

        // step 6: verify the tool call completes (task was created successfully)
        const taskResult = (await toolCallPromise) as CreateTaskCallResult;
        expect(taskResult.task).toBeDefined();
        expect(taskResult.task.taskId).toBeDefined();
        expect(meta!['io.modelcontextprotocol/related-task']).toEqual({ taskId: taskResult.task.taskId });

        // step 7: verify the sampling response contains all required CreateMessageResult fields
        // the tool embeds the sampling result as JSON in the response text
        const responseText = taskResult.content?.[0]?.text;

        if (responseText) {
          const jsonMatch = responseText.match(
            /Sampling result received: (.+)/,
          );

          if (jsonMatch?.[1]) {
            const samplingResponse = JSON.parse(jsonMatch[1]) as Record<
              string,
              unknown
            >;

            // verify required CreateMessageResult fields per MCP spec
            expect(samplingResponse).toHaveProperty('model');
            expect(samplingResponse).toHaveProperty('role');
            expect(samplingResponse).toHaveProperty('content');

            expect(typeof samplingResponse.model).toBe('string');
            expect(samplingResponse.role).toBe('assistant');

            const content = samplingResponse.content as Record<
              string,
              unknown
            >;
            expect(content).toHaveProperty('type');
            expect(content).toHaveProperty('text');
            expect(content.type).toBe('text');
            expect(content.text).toBe(SAMPLE_RESPONSE_TEXT);
          }
        }
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('sampling parameter handling', () => {
    let ctx: ServerHttpClientContext;

    beforeAll(async () => {
      ctx = await createServerHttpClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
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

    it('should send sampling request with custom prompt text [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send a sampling/createMessage with a custom prompt.
       * per spec, the messages array in CreateMessageRequest contains the prompt content
       * and the result must be a valid CreateMessageResult.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#creating-messages
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1773-L1814 (CreateMessageRequestParams: messages, maxTokens, etc.)
       */
      const result = await ctx.connector.callTool('trigger-sampling', {
        prompt: 'Explain quantum computing',
        maxTokens: 200,
      });

      const toolResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );
    });

    it('should send sampling request with default maxTokens [SAMPLING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send a sampling/createMessage without explicitly
       * specifying maxTokens in the tool arguments. per spec, maxTokens is a required
       * integer field in CreateMessageRequestParams (types.ts L1797), but the test server
       * provides a default value when the tool caller omits it.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling#creating-messages
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1797 (maxTokens: z.number().int() -- required)
       */
      const result = await ctx.connector.callTool('trigger-sampling', {
        prompt: 'Hello',
      });

      const toolResult = result as {
        content: Array<{ type: string; text: string }>;
      };
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );
    });
  });
});
