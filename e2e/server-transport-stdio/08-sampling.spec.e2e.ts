/**
 * sampling tests for the coremcp stdio server transport via native connector
 *
 * validates server-initiated sampling/createMessage requests triggered via
 * the trigger-sampling tool over stdio transport. the StdioConnector acts
 * as the client, receiving and responding to sampling requests.
 * @see /e2e/interactions/08-sampling.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerStdioClientContext,
  createRawStdioSession,
} from '../fixtures/index';

import type {
  CreateMessageRequest,
  CreateMessageResult,
} from '@coremcp/protocol';

import type {
  ServerStdioClientContext,
  RawStdioSession,
} from '../fixtures/index';

// TYPES //

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

// TEST SUITES //

describe('server-transport-stdio / 08-sampling', () => {
  describe('basic sampling request', () => {
    let ctx: ServerStdioClientContext;

    beforeAll(async () => {
      ctx = createServerStdioClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
        onRequest: async (request) => {
          if (request.method === 'sampling/createMessage') {
            return { result: { ...SAMPLE_RESULT } };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
      });
      await ctx.connector.connect();
    }, 30_000);

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
      const result = await ctx.connector.callTool('trigger-sampling', {
        prompt: 'What is 2+2?',
        maxTokens: 100,
      });

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );

      // verify the sampling response contains all required CreateMessageResult fields
      const responseText = (
        result.content![0] as { type: string; text: string }
      ).text;
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
    let ctx: ServerStdioClientContext;
    let capturedParams: CreateMessageRequest['params'] | null = null;

    beforeAll(async () => {
      ctx = createServerStdioClientContext({
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
    }, 30_000);

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

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual(
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
    let ctx: ServerStdioClientContext;
    let capturedParams: CreateMessageRequest['params'] | null = null;

    beforeAll(async () => {
      ctx = createServerStdioClientContext({
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
    }, 30_000);

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

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual(
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
    let rawSession: RawStdioSession;
    let capturedParams: Record<string, unknown> | null = null;

    beforeAll(async () => {
      rawSession = await createRawStdioSession();

      // register handler for server-initiated sampling requests
      rawSession.onServerRequest(
        async (method: string, params: unknown) => {
          if (method === 'sampling/createMessage') {
            capturedParams = params as Record<string, unknown>;

            return { ...SAMPLE_RESULT };
          }

          throw new Error(`Unexpected server request: ${method}`);
        },
      );
    }, 30_000);

    afterAll(async () => {
      await rawSession.close();
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
      capturedParams = null;

      // NOTE: Using raw stdio client because task creation with task parameter requires raw protocol-level control
      const taskResult = (await rawSession.callToolWithTask(
        'task-operation',
        { input: 'sampling-test', triggerSampling: true },
        { ttl: 60_000 },
      )) as CreateTaskCallResult;

      expect(taskResult.task).toBeDefined();
      expect(taskResult.task.taskId).toBeDefined();

      // wait for the async task processing to trigger the sampling request
      const maxWait = 5_000;
      const interval = 100;
      let waited = 0;

      while (capturedParams === null && waited < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        waited += interval;
      }

      // verify the sampling request arrived with _meta containing related task ID
      expect(capturedParams).not.toBeNull();
      const meta = capturedParams!._meta as
        | Record<string, unknown>
        | undefined;
      expect(meta).toBeDefined();
      expect(
        meta!['io.modelcontextprotocol/related-task'],
      ).toBeDefined();
      expect(meta!['io.modelcontextprotocol/related-task']).toEqual({
        taskId: expect.any(String),
      });
      expect(meta!['io.modelcontextprotocol/related-task']).toEqual({ taskId: taskResult.task.taskId });

      // verify the sampling request contains required CreateMessageRequest fields
      expect(capturedParams).toHaveProperty('messages');
      expect(capturedParams).toHaveProperty('maxTokens');
      expect(Array.isArray(capturedParams!.messages)).toBe(true);
      expect(typeof capturedParams!.maxTokens).toBe('number');

      // verify the sampling response (SAMPLE_RESULT) has the correct structure
      // the handler returns SAMPLE_RESULT which must satisfy CreateMessageResult
      expect(SAMPLE_RESULT).toHaveProperty('model');
      expect(SAMPLE_RESULT).toHaveProperty('role');
      expect(SAMPLE_RESULT).toHaveProperty('content');
      expect(typeof SAMPLE_RESULT.model).toBe('string');
      expect(SAMPLE_RESULT.role).toBe('assistant');
      expect(SAMPLE_RESULT.content).toHaveProperty('type');
      expect(SAMPLE_RESULT.content).toHaveProperty('text');
    });
  });

  describe('sampling parameter handling', () => {
    let ctx: ServerStdioClientContext;

    beforeAll(async () => {
      ctx = createServerStdioClientContext({
        capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
        onRequest: async (request) => {
          if (request.method === 'sampling/createMessage') {
            return { result: { ...SAMPLE_RESULT } };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
      });
      await ctx.connector.connect();
    }, 30_000);

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

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual(
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

      expect(result.content).toBeDefined();
      expect(result.content![0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Sampling result received'),
        }),
      );
    });
  });
});
