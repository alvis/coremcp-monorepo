/**
 * elicitation tests for the coremcp HTTP server transport
 *
 * validates server-initiated elicitation/create requests triggered via
 * the trigger-elicitation tool. uses both the HttpMcpConnector (for accept flow)
 * and raw HTTP client (for decline/cancel flows) against the coremcp HTTP server.
 *
 * decline and cancel tests use the raw HTTP client because the connector
 * auto-responds to elicitation requests and cannot simulate user decline or cancel.
 * @see /e2e/interactions/09-elicitation.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerHttpClientContext,
  createRawHttpSession,
} from '../fixtures/index';

import type { RequestId, McpServerNotification } from '@coremcp/protocol';

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

// CONSTANTS //

/** timeout for waiting for SSE events in milliseconds */
const SSE_EVENT_TIMEOUT_MS = 10_000;

/** delay in milliseconds before polling for completed task status */
const TASK_COMPLETION_WAIT_MS = 800;

/** maximum number of poll attempts before giving up */
const MAX_POLL_ATTEMPTS = 10;

/** delay between poll attempts in milliseconds */
const POLL_INTERVAL_MS = 200;

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

/**
 * waits for a specified number of milliseconds
 * @param ms milliseconds to wait
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * polls tasks/get until the task reaches the expected status or exhausts retries
 * @param session raw HTTP session to use for polling
 * @param taskId task identifier to poll
 * @param expectedStatus status to wait for
 * @returns the final task status result
 */
async function pollUntilStatus(
  session: RawHttpSession,
  taskId: string,
  expectedStatus: string,
): Promise<{ taskId: string; status: string }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = (await session.send('tasks/get', { taskId })) as {
      taskId: string;
      status: string;
    };

    if (result.status === expectedStatus) {
      return result;
    }

    await delay(POLL_INTERVAL_MS);
  }

  // return the last result even if it did not match
  return (await session.send('tasks/get', { taskId })) as {
    taskId: string;
    status: string;
  };
}

// TEST SUITES //

describe('server-transport-http / 09-elicitation', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext({
      capabilities: {
        roots: { listChanged: true },
        elicitation: {},
      },
      onRequest: async (request) => {
        if (request.method === 'elicitation/create') {
          return { result: { action: 'accept' as const, content: { value: 'test-input' } } };
        }

        throw new Error(`Unexpected request: ${request.method}`);
      },
    });
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('form mode elicitation', () => {
    it('should send elicitation/create to client and receive result [ELICITATION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send an elicitation/create request (form mode) to the
       * client and receive a result with action "accept" and content. per spec, the client
       * MUST declare elicitation capability. the result uses a three-action model:
       * accept (with content), decline, or cancel.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#form-mode-elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
       */
      // trigger-elicitation calls session.reply with elicitation/create
      // the connector should handle the request via onRequest
      const result = await ctx.connector.callTool(
        'trigger-elicitation',
        { message: 'Please provide your API key' },
      );

      expect(result.content).toBeDefined();

      const toolResult = result as ToolCallContent;
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Elicitation result received'),
        }),
      );
    });
  });

  describe('URL mode elicitation', () => {
    it('should send URL mode elicitation/create to client [ELICITATION-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send a URL mode elicitation/create request with mode:"url",
       * a url parameter, and an elicitationId. per spec, URL mode requests MUST specify
       * mode:"url", a valid url, and an elicitationId. the client responds with action
       * "accept" (without content for URL mode) to indicate user consent to the interaction.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#url-mode-elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L567-L573 (URL mode branch in elicitInput)
       */
      // NOTE: Using raw HTTP client to inspect URL mode elicitation params at the protocol level
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      try {
        // step 1: open SSE stream for receiving server-to-client requests
        const sseStream = await rawSession.openSseStream();

        // step 2: trigger the URL mode elicitation tool call concurrently
        // do not await -- it will block until we respond to the elicitation request
        const toolCallPromise = rawSession.send('tools/call', {
          name: 'trigger-elicitation-url',
          arguments: {
            url: 'https://example.com/form',
            description: 'Fill out this form',
          },
        });

        // step 3: read the elicitation/create request from the SSE stream
        const serverRequest = await readSseRequest(sseStream);

        expect(serverRequest.method).toBe('elicitation/create');
        expect(serverRequest.id).toBeDefined();
        expect(serverRequest.params).toBeDefined();
        expect(serverRequest.params!.mode).toBe('url');
        expect(serverRequest.params!.url).toBe('https://example.com/form');
        expect(serverRequest.params!.elicitationId).toEqual(expect.any(String));
        expect(serverRequest.params!.message).toEqual(expect.any(String));

        // step 4: respond with accept action including content per MCP spec
        await rawSession.respondToRequest(serverRequest.id, {
          action: 'accept',
          content: { value: 'test-response' },
        });

        // step 5: the tool call should now complete
        const toolResult = (await toolCallPromise) as ToolCallContent;

        expect(toolResult.content).toBeDefined();
        expect(toolResult.content[0]).toEqual(
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('URL elicitation result received'),
          }),
        );
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('elicitation complete notification', () => {
    it('should emit notifications/elicitation/complete after URL mode elicitation [ELICITATION-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server sends notifications/elicitation/complete after a URL mode
       * elicitation completes. per spec, the notification MUST include elicitationId.
       * clients MUST ignore notifications referencing unknown or already-completed IDs.
       * the SDK uses createElicitationCompletionNotifier to emit this notification.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#completion-notifications-for-url-mode-elicitation
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L623-L640
       */
      const notifications: McpServerNotification[] = [];

      // create a dedicated context with both onRequest (to handle URL mode elicitation)
      // and onNotification (to capture the elicitation complete notification)
      const notifyCtx = await createServerHttpClientContext({
        capabilities: {
          roots: { listChanged: true },
          elicitation: {},
        },
        onRequest: async (request) => {
          if (request.method === 'elicitation/create') {
            return { result: { action: 'accept' as const, content: { value: 'test-input' } } };
          }

          throw new Error(`Unexpected request: ${request.method}`);
        },
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyCtx.connector.connect();

        // call trigger-elicitation-url which sends elicitation/create (URL mode)
        // followed by notifications/elicitation/complete
        const result = await notifyCtx.connector.callTool(
          'trigger-elicitation-url',
          {
            url: 'https://example.com/form',
            description: 'Fill out this form',
          },
        );

        const toolResult = result as ToolCallContent;
        expect(toolResult.content[0]).toEqual(
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('URL elicitation result received'),
          }),
        );

        // allow time for the notification to arrive
        await delay(500);

        // verify the elicitation complete notification was received
        const completeNotifications = notifications.filter(
          (n) => n.method === 'notifications/elicitation/complete',
        );
        expect(completeNotifications.length).toBeGreaterThanOrEqual(1);

        // verify the notification payload structure
        const completeNotification = completeNotifications[0] as {
          method: string;
          params: { elicitationId: string; result?: unknown };
        };
        expect(completeNotification.params.elicitationId).toEqual(
          expect.any(String),
        );
      } finally {
        await notifyCtx.teardown();
      }
    }, 30_000);
  });

  describe('user decline/cancel', () => {
    it('should handle user decline action [ELICITATION-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the client can respond with action:"decline" to an elicitation/create
       * request. per spec, "decline" means the user explicitly declined the request.
       * the content field is typically omitted for decline responses.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
       */
      // NOTE: Using raw HTTP client because connector auto-responds to elicitation and cannot simulate user decline/cancel
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      try {
        // step 1: open SSE stream for receiving server-to-client requests
        const sseStream = await rawSession.openSseStream();

        // step 2: trigger the elicitation tool call concurrently
        // do not await -- it will block until we respond to the elicitation request
        const toolCallPromise = rawSession.send('tools/call', {
          name: 'trigger-elicitation',
          arguments: { message: 'Please provide credentials' },
        });

        // step 3: read the elicitation/create request from the SSE stream
        const serverRequest = await readSseRequest(sseStream);

        expect(serverRequest.method).toBe('elicitation/create');
        expect(serverRequest.id).toBeDefined();

        // step 4: respond with decline action
        await rawSession.respondToRequest(serverRequest.id, {
          action: 'decline',
        });

        // step 5: the tool call should now complete
        const toolResult = (await toolCallPromise) as ToolCallContent;

        expect(toolResult.content).toBeDefined();
        expect(toolResult.content[0]).toEqual(
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('Elicitation result received'),
          }),
        );

        // verify the result includes the decline action
        expect(toolResult.content[0].text).toContain('decline');
      } finally {
        await rawSession.close();
      }
    });

    it('should handle user cancel action [ELICITATION-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the client can respond with action:"cancel" to an elicitation/create
       * request. per spec, "cancel" means the user dismissed/cancelled without making
       * an explicit choice. the content field is typically omitted for cancel responses.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
       */
      // NOTE: Using raw HTTP client because connector auto-responds to elicitation and cannot simulate user decline/cancel
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      try {
        // step 1: open SSE stream for receiving server-to-client requests
        const sseStream = await rawSession.openSseStream();

        // step 2: trigger the elicitation tool call concurrently
        const toolCallPromise = rawSession.send('tools/call', {
          name: 'trigger-elicitation',
          arguments: { message: 'Please provide credentials' },
        });

        // step 3: read the elicitation/create request from the SSE stream
        const serverRequest = await readSseRequest(sseStream);

        expect(serverRequest.method).toBe('elicitation/create');
        expect(serverRequest.id).toBeDefined();

        // step 4: respond with cancel action
        await rawSession.respondToRequest(serverRequest.id, {
          action: 'cancel',
        });

        // step 5: the tool call should now complete
        const toolResult = (await toolCallPromise) as ToolCallContent;

        expect(toolResult.content).toBeDefined();
        expect(toolResult.content[0]).toEqual(
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('Elicitation result received'),
          }),
        );

        // verify the result includes the cancel action
        expect(toolResult.content[0].text).toContain('cancel');
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('task-augmented elicitation', () => {
    it('should include related task metadata in elicitation during task execution [ELICITATION-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that when an elicitation/create is sent during task execution, the _meta
       * field includes io.modelcontextprotocol/related-task with the taskId linking the
       * elicitation to the originating task. the elicitation must still complete and the
       * task must reach "completed" status.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
       */
      // NOTE: Using raw HTTP client because callToolWithTask requires raw protocol-level control
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      try {
        // step 1: open SSE stream for receiving server-to-client requests
        const sseStream = await rawSession.openSseStream();

        // step 2: trigger task-operation with triggerElicitation flag and task parameter
        // do not await -- the task runs async and will send elicitation/create during execution
        const taskCallPromise = rawSession.callToolWithTask(
          'task-operation',
          { input: 'elicitation-meta-test', triggerElicitation: true },
          { ttl: 60000 },
        );

        // step 3: read the elicitation/create request from the SSE stream
        // the task processing delay (500ms) occurs before the elicitation is sent
        const serverRequest = await readSseRequest(sseStream);

        expect(serverRequest.method).toBe('elicitation/create');
        expect(serverRequest.id).toBeDefined();
        expect(serverRequest.params).toBeDefined();

        // step 4: verify the _meta field includes related-task with the task ID
        const meta = serverRequest.params!._meta as
          | Record<string, unknown>
          | undefined;
        expect(meta).toBeDefined();
        expect(
          meta!['io.modelcontextprotocol/related-task'],
        ).toEqual(expect.any(String));

        // step 5: respond to the elicitation so the task can complete
        await rawSession.respondToRequest(serverRequest.id, {
          action: 'accept',
          content: { value: 'test-response' },
        });

        // step 6: wait for the task creation response and verify the task completes
        const taskResult = (await taskCallPromise) as {
          task: { taskId: string; status: string };
        };
        expect(taskResult.task).toBeDefined();
        expect(taskResult.task.taskId).toEqual(expect.any(String));

        // verify the related-task metadata matches the actual task ID
        expect(meta!['io.modelcontextprotocol/related-task']).toBe(
          taskResult.task.taskId,
        );

        // wait for the task to complete
        await delay(TASK_COMPLETION_WAIT_MS);
        const completedResult = await pollUntilStatus(
          rawSession,
          taskResult.task.taskId,
          'completed',
        );
        expect(completedResult.status).toBe('completed');
      } finally {
        await rawSession.close();
      }
    });
  });

  describe('elicitation with different messages', () => {
    it('should send elicitation with custom message text [ELICITATION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send an elicitation/create with a custom message string.
       * per spec, message is a required string parameter describing what information is needed.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#form-mode-elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
       */
      const result = await ctx.connector.callTool(
        'trigger-elicitation',
        { message: 'Configure the deployment settings' },
      );

      const toolResult = result as ToolCallContent;
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Elicitation result received'),
        }),
      );
    });

    it('should send elicitation with default message [ELICITATION-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the server can send an elicitation/create with a default/empty message.
       * per spec, message is a required field but the test server provides a default value
       * when none is specified by the tool caller.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation#form-mode-elicitation-requests
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L563-L613
       */
      const result = await ctx.connector.callTool(
        'trigger-elicitation',
        {},
      );

      const toolResult = result as ToolCallContent;
      expect(toolResult.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Elicitation result received'),
        }),
      );
    });
  });
});
