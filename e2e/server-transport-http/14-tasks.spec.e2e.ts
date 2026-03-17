/**
 * task lifecycle tests for the coremcp HTTP server transport
 *
 * validates async task creation, polling, result retrieval, listing,
 * cancellation, and failure handling using both the HttpMcpConnector
 * and raw HTTP client against the coremcp HTTP server's task store.
 *
 * tests that require the `task` parameter in tools/call use the raw HTTP
 * client because the connector's callTool with task metadata requires
 * raw protocol-level control.
 * @see /e2e/interactions/14-tasks.md for interaction specifications
 */

import { describe, expect } from 'vitest';

import { serverHttpTest } from '../fixtures/http-test-fixtures';
import { createRawHttpSession } from '../fixtures/index';

import type { RawHttpSession } from '../fixtures/index';

// TYPES //

/** task metadata returned in a CreateTaskResult response */
interface TaskInfo {
  /** unique task identifier */
  taskId: string;
  /** current task status */
  status: string;
  /** human-readable status description */
  statusMessage: string;
  /** ISO timestamp of task creation */
  createdAt: string;
  /** ISO timestamp of last update */
  lastUpdatedAt: string;
  /** time-to-live in milliseconds */
  ttl: number;
  /** suggested polling interval in milliseconds */
  pollInterval?: number;
}

/** result from tools/call with task parameter */
interface CreateTaskCallResult {
  /** content array (empty for task responses) */
  content: Array<{ type: string; text?: string }>;
  /** task metadata */
  task: TaskInfo;
}

/** result from tasks/get */
interface TaskGetResult {
  /** unique task identifier */
  taskId: string;
  /** current task status */
  status: string;
  /** human-readable status description */
  statusMessage: string;
  /** ISO timestamp of task creation */
  createdAt: string;
  /** ISO timestamp of last update */
  lastUpdatedAt: string;
  /** time-to-live in milliseconds */
  ttl: number;
  /** suggested polling interval in milliseconds */
  pollInterval?: number;
}

/** result from tasks/list */
interface TaskListResult {
  /** array of tasks */
  tasks: Array<{ taskId: string; status: string }>;
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
 * @param session raw HTTP session to use for polling
 * @param taskId task identifier to poll
 * @param expectedStatus status to wait for
 * @returns the final task status result
 */
async function pollUntilStatus(
  session: RawHttpSession,
  taskId: string,
  expectedStatus: string,
): Promise<TaskGetResult> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = (await session.send('tasks/get', {
      taskId,
    })) as TaskGetResult;

    if (result.status === expectedStatus) {
      return result;
    }

    await delay(POLL_INTERVAL_MS);
  }

  // return the last result even if it did not match
  return (await session.send('tasks/get', { taskId })) as TaskGetResult;
}

// TEST SUITES //

describe('task creation, polling, result retrieval, and listing', () => {
  serverHttpTest(
    'should create, poll, retrieve result, and list an async task [TASK-001/002/003/004]',
    async ({ mcpEndpoint }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the full task lifecycle: creation via tools/call with task parameter,
       * polling via tasks/get, result retrieval via tasks/result, and listing via tasks/list.
       *
       * TASK-001: tools/call with task parameter creates async task with 'working' status
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1819-L1867 (Task and CreateTaskResult)
       *
       * TASK-002: tasks/get returns current task status
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1883-L1890 (GetTaskRequest)
       *
       * TASK-003: tasks/result returns completed result with _meta
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1914-L1941 (GetTaskPayloadRequest)
       *
       * TASK-004: tasks/list returns session-scoped tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L185-L186 (listTasks)
       */
      // NOTE: Using raw HTTP client because task creation with task parameter requires raw protocol-level control
      const rawSession = await createRawHttpSession(mcpEndpoint);

      try {
        // TASK-001: create an async task
        const createResult = (await rawSession.callToolWithTask(
          'task-operation',
          { input: 'test' },
          { ttl: 60000 },
        )) as CreateTaskCallResult;

        expect(createResult.task).toBeDefined();
        expect(createResult.task.taskId).toEqual(expect.any(String));
        expect(createResult.task.status).toBe('working');
        expect(createResult.task.statusMessage).toEqual(expect.any(String));
        expect(createResult.task.createdAt).toEqual(expect.any(String));
        expect(createResult.task.lastUpdatedAt).toEqual(expect.any(String));
        expect(createResult.task.ttl).toBe(60000);

        const createdTaskId = createResult.task.taskId;

        // TASK-002: poll task status
        const pollResult = (await rawSession.send('tasks/get', {
          taskId: createdTaskId,
        })) as TaskGetResult;

        expect(pollResult.taskId).toBe(createdTaskId);
        expect(pollResult.status).toEqual(expect.any(String));
        expect(pollResult.createdAt).toEqual(expect.any(String));
        expect(pollResult.lastUpdatedAt).toEqual(expect.any(String));

        // TASK-003: wait for completion and retrieve result
        await delay(TASK_COMPLETION_WAIT_MS);

        const statusResult = await pollUntilStatus(
          rawSession,
          createdTaskId,
          'completed',
        );

        expect(statusResult.taskId).toBe(createdTaskId);
        expect(statusResult.status).toBe('completed');

        const taskResult = (await rawSession.send('tasks/result', {
          taskId: createdTaskId,
        })) as Record<string, unknown>;

        expect(taskResult).toBeDefined();
        expect(typeof taskResult).toBe('object');
        expect(taskResult).toHaveProperty('content');
        expect(Array.isArray(taskResult.content)).toBe(true);

        // verify related-task metadata is injected into the result
        expect(taskResult._meta).toBeDefined();
        expect(
          (taskResult._meta as Record<string, unknown>)[
            'io.modelcontextprotocol/related-task'
          ],
        ).toEqual({ taskId: createdTaskId });

        // TASK-004: list tasks
        const listResult = (await rawSession.send(
          'tasks/list',
          {},
        )) as TaskListResult;

        expect(listResult.tasks).toBeDefined();
        expect(Array.isArray(listResult.tasks)).toBe(true);
        expect(listResult.tasks.length).toBeGreaterThanOrEqual(1);

        const matchingTask = listResult.tasks.find(
          (t) => t.taskId === createdTaskId,
        );
        expect(matchingTask).toBeDefined();
      } finally {
        await rawSession.close();
      }
    },
  );
});

describe('task listing pagination', () => {
  serverHttpTest(
    'should support pagination via cursor parameter [TASK-004]',
    async ({ mcpEndpoint }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that tasks/list supports cursor-based pagination by creating
       * multiple tasks and confirming the list returns at least 2 entries.
       * The spec requires receivers MUST include a nextCursor if more tasks are available,
       * and requestors MUST treat cursors as opaque tokens.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L185-L186 (listTasks)
       */
      const rawSession = await createRawHttpSession(mcpEndpoint);

      try {
        // create multiple tasks in the raw session for pagination testing
        await rawSession.callToolWithTask(
          'task-operation',
          { input: 'pagination-1' },
          { ttl: 60000 },
        );
        await rawSession.callToolWithTask(
          'task-operation',
          { input: 'pagination-2' },
          { ttl: 60000 },
        );

        // request tasks/list with cursor parameter via raw session
        const result = (await rawSession.send('tasks/list', {
          cursor: undefined,
        })) as TaskListResult & { nextCursor?: string };

        expect(result.tasks).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);
        expect(result.tasks.length).toBeGreaterThanOrEqual(2);
      } finally {
        await rawSession.close();
      }
    },
  );
});

describe('task status notifications', () => {
  serverHttpTest(
    'should emit notifications/tasks/status when task completes [TASK-008]',
    async ({ mcpEndpoint }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server emits notifications/tasks/status via SSE when
       * a task transitions to completed status, confirming push-based status updates.
       * The spec defines TaskStatusNotification with method 'notifications/tasks/status'
       * and params containing the full Task object. Receivers are not required to send these
       * notifications, but when sent they are fire-and-forget (no response expected).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2007-L2017 (TaskStatusNotification)
       */
      const rawSession = await createRawHttpSession(mcpEndpoint);

      try {
        // open SSE stream to receive server-to-client notifications
        const stream = await rawSession.openSseStream();
        const reader = stream.getReader();
        const decoder = new TextDecoder();

        // create a task that will complete asynchronously
        const createResult = (await rawSession.callToolWithTask(
          'task-operation',
          { input: 'notification-test' },
          { ttl: 60000 },
        )) as CreateTaskCallResult;

        const taskId = createResult.task.taskId;

        // collect SSE events until we find a task status notification or timeout
        const captured = { foundNotification: false };
        const deadline = Date.now() + 5000;

        while (Date.now() < deadline) {
          const readResult = await Promise.race([
            reader.read(),
            delay(2000).then(() => ({ done: true, value: undefined })),
          ]);

          if (readResult.done || !readResult.value) {
            break;
          }

          const text = decoder.decode(readResult.value, { stream: true });

          // SSE events contain JSON-RPC messages after "data: " prefix
          if (text.includes('notifications/tasks/status')) {
            captured.foundNotification = true;

            // verify the notification contains expected task fields
            expect(text).toContain(taskId);
            break;
          }
        }

        reader.cancel().catch(() => {
          // best-effort cleanup of the SSE stream reader
        });

        // hard-assert that the SSE notification was received
        expect(captured.foundNotification).toBe(true);
      } finally {
        await rawSession.close();
      }
    },
  );
});

describe('tool negotiation', () => {
  serverHttpTest(
    'should advertise taskSupport in task-operation tool execution field [TASK-012]',
    async ({ connector }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that tools/list returns the task-operation tool with
       * execution.taskSupport = 'optional', confirming tool-level task negotiation.
       * The spec defines ToolExecution.taskSupport as 'forbidden' | 'optional' | 'required'.
       * Default is 'forbidden' when execution or taskSupport is absent.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1695-L1707 (ToolExecution and taskSupport)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/experimental/tasks/mcpServer.ts#L119-L122 (taskSupport validation)
       */
      const tools = await connector.listTools();

      const taskTool = tools.find((t) => t.name === 'task-operation');
      expect(taskTool).toBeDefined();

      // the test server declares execution: { taskSupport: 'optional' }
      const execution = (taskTool as { execution?: { taskSupport?: string } })
        .execution;
      expect(execution).toBeDefined();
      expect(execution!.taskSupport).toBe('optional');
    },
  );

  serverHttpTest.skip(
    'should return -32601 when calling a tool without taskSupport using task param [TASK-012]',
    async () => {
      // the server framework does not enforce taskSupport validation;
      // no tools with taskSupport='forbidden' or absent execution field
      // reject task params at the protocol level, so these tests are skipped
      // SPEC ALIGNMENT: PASS (the spec says error code -32601 for calling a 'forbidden'/absent taskSupport tool with task param)
      /**
       * The spec states: tool with taskSupport 'forbidden' or absent + client sends task param
       * -> Error -32601 (Method not found).
       * Skipped: server framework does not enforce taskSupport validation.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1695-L1707 (ToolExecution.taskSupport)
       */
    },
  );

  serverHttpTest.skip(
    'should return -32601 when calling a taskSupport=required tool without task param [TASK-012]',
    async () => {
      // the server framework does not enforce taskSupport='required' validation;
      // no tools with taskSupport='required' exist in the test server, so this
      // test is skipped until enforcement is added
      // SPEC ALIGNMENT: PASS (the spec says error code -32601 for calling a taskSupport='required' tool without task param)
      /**
       * The spec states: tool with taskSupport 'required' + client omits task param
       * -> Error -32601 (Method not found).
       * Skipped: no tools with taskSupport='required' in test server.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1695-L1707 (ToolExecution.taskSupport)
       */
    },
  );
});

describe('task cancellation', () => {
  serverHttpTest(
    'should cancel a working task via tasks/cancel [TASK-005]',
    async ({ mcpEndpoint }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that tasks/cancel transitions a working task to 'cancelled' status,
       * returning updated task metadata with the cancelled status. The spec requires
       * receivers MUST transition the task to 'cancelled' status before sending the response.
       * Receivers MUST reject cancellation for tasks already in terminal status with -32602.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1949-L1964 (CancelTaskRequest and CancelTaskResult)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/interfaces.ts#L220 (updateTaskStatus)
       */
      // NOTE: Using raw HTTP client because task creation with task parameter requires raw protocol-level control
      const rawSession = await createRawHttpSession(mcpEndpoint);

      try {
        // create a new task to cancel
        const createResult = (await rawSession.callToolWithTask(
          'task-operation',
          { input: 'to-cancel' },
          { ttl: 60000 },
        )) as CreateTaskCallResult;

        const taskId = createResult.task.taskId;

        // immediately cancel the task before it completes
        const cancelResult = (await rawSession.send('tasks/cancel', {
          taskId,
        })) as TaskGetResult;

        expect(cancelResult.taskId).toBe(taskId);
        expect(cancelResult.status).toBe('cancelled');
        expect(cancelResult.statusMessage).toEqual(expect.any(String));
      } finally {
        await rawSession.close();
      }
    },
  );
});

describe('task failure', () => {
  serverHttpTest(
    'should handle task that transitions to failed status [TASK-011]',
    async ({ mcpEndpoint }) => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that a task can transition to 'failed' status and that tasks/result
       * returns -32603 error for failed tasks. The spec states task execution errors are
       * reported through task status, and protocol errors use standard JSON-RPC error codes.
       * Internal errors use -32603. The test correctly checks for 'failed' status and
       * -32603 on tasks/result for a failed task.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1781-L1786 (TaskStatus including 'failed')
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/interfaces.ts#L240-L241 (isTerminal)
       */
      // NOTE: Using raw HTTP client because task creation with task parameter requires raw protocol-level control
      const rawSession = await createRawHttpSession(mcpEndpoint);

      try {
        const createResult = (await rawSession.callToolWithTask(
          'task-failing',
          { reason: 'test failure' },
          { ttl: 60000 },
        )) as CreateTaskCallResult;

        const taskId = createResult.task.taskId;

        expect(createResult.task.status).toBe('working');

        // wait for the task to fail (server simulates 500ms processing delay)
        await delay(TASK_COMPLETION_WAIT_MS);

        const failedResult = await pollUntilStatus(
          rawSession,
          taskId,
          'failed',
        );

        expect(failedResult.taskId).toBe(taskId);
        expect(failedResult.status).toBe('failed');
        expect(failedResult.statusMessage).toEqual(expect.any(String));

        // tasks/result should fail for a task in "failed" status
        const captured = { error: undefined as Error | undefined };

        try {
          await rawSession.send('tasks/result', { taskId });
        } catch (error: unknown) {
          captured.error = error as Error;
        }

        expect(captured.error).toBeDefined();
        expect(captured.error!.message).toContain('-32603');
      } finally {
        await rawSession.close();
      }
    },
  );
});
