/**
 * elicitation tests for the coremcp stdio server transport
 *
 * validates server-initiated elicitation/create requests triggered via
 * the trigger-elicitation tool over stdio transport. uses both the connector
 * (for accept flow) and raw stdio client (for decline/cancel flows).
 *
 * decline and cancel tests use the raw stdio client because the connector
 * auto-responds to elicitation requests and cannot simulate user decline or cancel.
 * @see /e2e/interactions/09-elicitation.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerStdioClientContext,
  createRawStdioSession,
} from '../fixtures/index';

import type { McpServerNotification } from '@coremcp/protocol';

import type {
  ServerStdioClientContext,
  RawStdioSession,
} from '../fixtures/index';

// TYPES //

/** tool call result from the server */
interface ToolCallContent {
  /** content items returned by the tool */
  content: Array<{ type: string; text: string }>;
}

// CONSTANTS //

/** delay in milliseconds before polling for completed task status */
const TASK_COMPLETION_WAIT_MS = 800;

/** maximum number of poll attempts before giving up */
const MAX_POLL_ATTEMPTS = 10;

/** delay between poll attempts in milliseconds */
const POLL_INTERVAL_MS = 200;

// HELPERS //

/**
 * waits for a specified number of milliseconds
 * @param ms milliseconds to wait
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * polls tasks/get until the task reaches the expected status or exhausts retries
 * @param session raw stdio session to use for polling
 * @param taskId task identifier to poll
 * @param expectedStatus status to wait for
 * @returns the final task status result
 */
async function pollUntilStatus(
  session: RawStdioSession,
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

describe('server-transport-stdio / 09-elicitation', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext({
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
  }, 30_000);

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
      const result = (await ctx.connector.callTool(
        'trigger-elicitation',
        { message: 'Please provide your API key' },
      )) as ToolCallContent;

      expect(result.content).toBeDefined();
      expect(result.content[0]).toEqual(
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
      // NOTE: Using raw stdio client to inspect URL mode elicitation params at the protocol level
      let rawSession: RawStdioSession | undefined;

      try {
        rawSession = await createRawStdioSession();

        // capture the elicitation request params for assertion
        let capturedParams: Record<string, unknown> | undefined;

        // register handler for server-initiated requests
        rawSession.onServerRequest(
          async (method: string, params: unknown): Promise<unknown> => {
            if (method === 'elicitation/create') {
              capturedParams = params as Record<string, unknown>;

              return { action: 'accept', content: { value: 'test-response' } };
            }

            return {};
          },
        );

        // call the trigger-elicitation-url tool
        const toolResult = (await rawSession.send('tools/call', {
          name: 'trigger-elicitation-url',
          arguments: {
            url: 'https://example.com/form',
            description: 'Fill out this form',
          },
        })) as ToolCallContent;

        expect(toolResult.content).toBeDefined();
        expect(toolResult.content[0]).toEqual(
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining('URL elicitation result received'),
          }),
        );

        // verify the captured elicitation request had URL mode params
        expect(capturedParams).toBeDefined();
        expect(capturedParams!.mode).toBe('url');
        expect(capturedParams!.url).toBe('https://example.com/form');
        expect(capturedParams!.elicitationId).toEqual(expect.any(String));
        expect(capturedParams!.message).toEqual(expect.any(String));
      } finally {
        if (rawSession) {
          await rawSession.close();
        }
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
      const notifyCtx = createServerStdioClientContext({
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
        const result = (await notifyCtx.connector.callTool(
          'trigger-elicitation-url',
          {
            url: 'https://example.com/form',
            description: 'Fill out this form',
          },
        )) as ToolCallContent;

        expect(result.content[0]).toEqual(
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
      // NOTE: Using raw stdio client because connector auto-responds to elicitation and cannot simulate user decline/cancel
      let rawSession: RawStdioSession | undefined;

      try {
        rawSession = await createRawStdioSession();

        // register handler for server-initiated requests before calling the tool
        rawSession.onServerRequest(
          async (method: string, _params: unknown): Promise<unknown> => {
            if (method === 'elicitation/create') {
              return { action: 'decline' };
            }

            return {};
          },
        );

        // call the trigger-elicitation tool which will send elicitation/create
        // to our client; the handler above will respond with decline
        const toolResult = (await rawSession.send('tools/call', {
          name: 'trigger-elicitation',
          arguments: { message: 'Please provide credentials' },
        })) as ToolCallContent;

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
        if (rawSession) {
          await rawSession.close();
        }
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
      // NOTE: Using raw stdio client because connector auto-responds to elicitation and cannot simulate user decline/cancel
      let rawSession: RawStdioSession | undefined;

      try {
        rawSession = await createRawStdioSession();

        // register handler for server-initiated requests before calling the tool
        rawSession.onServerRequest(
          async (method: string, _params: unknown): Promise<unknown> => {
            if (method === 'elicitation/create') {
              return { action: 'cancel' };
            }

            return {};
          },
        );

        // call the trigger-elicitation tool which will send elicitation/create
        // to our client; the handler above will respond with cancel
        const toolResult = (await rawSession.send('tools/call', {
          name: 'trigger-elicitation',
          arguments: { message: 'Please provide credentials' },
        })) as ToolCallContent;

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
        if (rawSession) {
          await rawSession.close();
        }
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
      // NOTE: Using raw stdio client because callToolWithTask requires raw protocol-level control
      let rawSession: RawStdioSession | undefined;

      try {
        rawSession = await createRawStdioSession();

        // capture the elicitation request params for assertion
        let capturedParams: Record<string, unknown> | undefined;

        // register handler for server-initiated requests
        rawSession.onServerRequest(
          async (method: string, params: unknown): Promise<unknown> => {
            if (method === 'elicitation/create') {
              capturedParams = params as Record<string, unknown>;

              return {
                action: 'accept',
                content: { value: 'test-response' },
              };
            }

            return {};
          },
        );

        // trigger task-operation with triggerElicitation flag and task parameter
        // the task runs async and sends elicitation/create with _meta during execution
        const taskResult = (await rawSession.callToolWithTask(
          'task-operation',
          { input: 'elicitation-meta-test', triggerElicitation: true },
          { ttl: 60000 },
        )) as { task: { taskId: string; status: string } };

        expect(taskResult.task).toBeDefined();
        expect(taskResult.task.taskId).toEqual(expect.any(String));

        // wait for the task to complete (processing delay + elicitation round trip)
        await delay(TASK_COMPLETION_WAIT_MS);

        // poll to confirm the task has completed
        const completedResult = await pollUntilStatus(
          rawSession,
          taskResult.task.taskId,
          'completed',
        );
        expect(completedResult.status).toBe('completed');

        // verify the captured elicitation request included _meta with related-task
        expect(capturedParams).toBeDefined();
        const meta = capturedParams!._meta as
          | Record<string, unknown>
          | undefined;
        expect(meta).toBeDefined();
        expect(
          meta!['io.modelcontextprotocol/related-task'],
        ).toBe(taskResult.task.taskId);
      } finally {
        if (rawSession) {
          await rawSession.close();
        }
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
      const result = (await ctx.connector.callTool(
        'trigger-elicitation',
        { message: 'Configure the deployment settings' },
      )) as ToolCallContent;

      expect(result.content[0]).toEqual(
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
      const result = (await ctx.connector.callTool(
        'trigger-elicitation',
        {},
      )) as ToolCallContent;

      expect(result.content[0]).toEqual(
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Elicitation result received'),
        }),
      );
    });
  });
});
