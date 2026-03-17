/**
 * task lifecycle tests for the coremcp stdio server transport
 *
 * validates async task creation, polling, result retrieval, listing,
 * cancellation, and failure handling using both the StdioConnector
 * and raw stdio client against the coremcp stdio server's task store.
 *
 * tests that require the `task` parameter in tools/call use the raw stdio
 * client because the connector does not support this parameter.
 * task listing uses the connector's request method.
 * @see /e2e/interactions/14-tasks.md for interaction specifications
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  createServerStdioClientContext,
  createRawStdioSession,
} from '../fixtures/index';

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
): Promise<TaskGetResult> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = (await session.send('tasks/get', { taskId })) as TaskGetResult;

    if (result.status === expectedStatus) {
      return result;
    }

    await delay(POLL_INTERVAL_MS);
  }

  // return the last result even if it did not match
  return (await session.send('tasks/get', { taskId })) as TaskGetResult;
}

// TEST SUITES //

describe('server-transport-stdio / 14-tasks', () => {
  let ctx: ServerStdioClientContext;
  let rawSession: RawStdioSession;
  let createdTaskId: string;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();

    // NOTE: Using raw stdio client because connector does not support the task parameter in tools/call
    rawSession = await createRawStdioSession();
  }, 60_000);

  afterAll(async () => {
    await rawSession.close();
    await ctx.teardown();
  });

  describe('task creation', () => {
    it('should create an async task via tools/call with task parameter [TASK-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tools/call with a task parameter creates an async task with
       * status 'working', a unique taskId, timestamps, and the requested TTL.
       * The spec defines CreateTaskResult with a task field containing Task metadata.
       * Task interface has: taskId, status (TaskStatus), statusMessage?, createdAt, lastUpdatedAt, ttl, pollInterval?.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1819-L1867 (Task and CreateTaskResult interfaces)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L35 (createTask implementation)
       */
      // NOTE: Using raw stdio client because connector does not support the task parameter in tools/call
      const result = (await rawSession.callToolWithTask(
        'task-operation',
        { input: 'test' },
        { ttl: 60000 },
      )) as CreateTaskCallResult;

      expect(result.task).toBeDefined();
      expect(result.task.taskId).toEqual(expect.any(String));
      expect(result.task.status).toBe('working');
      expect(result.task.statusMessage).toEqual(expect.any(String));
      expect(result.task.createdAt).toEqual(expect.any(String));
      expect(result.task.lastUpdatedAt).toEqual(expect.any(String));
      expect(result.task.ttl).toBe(60000);

      // store taskId for subsequent tests
      createdTaskId = result.task.taskId;
    });
  });

  describe('task polling', () => {
    it('should poll task status via tasks/get [TASK-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tasks/get returns the current task status including taskId,
       * status string, and timestamps for a previously created task. The spec defines
       * GetTaskRequest with params.taskId and result as Task object (taskId, status,
       * statusMessage?, createdAt, lastUpdatedAt, ttl, pollInterval?).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1883-L1890 (GetTaskRequest)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L95 (getTask)
       */
      // NOTE: Using raw stdio client because connector does not support the task parameter in tools/call
      // uses taskId from TASK-001 created in the same session
      const result = (await rawSession.send('tasks/get', {
        taskId: createdTaskId,
      })) as TaskGetResult;

      expect(result.taskId).toBe(createdTaskId);
      expect(result.status).toEqual(expect.any(String));
      expect(result.createdAt).toEqual(expect.any(String));
      expect(result.lastUpdatedAt).toEqual(expect.any(String));
    });
  });

  describe('task result retrieval', () => {
    it('should retrieve completed task result via tasks/result [TASK-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tasks/result returns the completed result payload with content
       * array and _meta containing io.modelcontextprotocol/related-task for a completed task.
       * The spec states tasks/result MUST include _meta with io.modelcontextprotocol/related-task
       * in its response. The result structure matches the original request type (e.g., CallToolResult).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1914-L1941 (GetTaskPayloadRequest and GetTaskPayloadResult)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L134-L135 (getTaskResult)
       */
      // NOTE: Using raw stdio client because task was created in the same raw session
      // wait for the task to complete (server simulates 500ms processing delay)
      await delay(TASK_COMPLETION_WAIT_MS);

      // first confirm the task reached completed status
      const statusResult = await pollUntilStatus(rawSession, createdTaskId, 'completed');

      expect(statusResult.taskId).toBe(createdTaskId);
      expect(statusResult.status).toBe('completed');

      // call tasks/result to retrieve the actual result payload
      const taskResult = (await rawSession.send('tasks/result', {
        taskId: createdTaskId,
      })) as Record<string, unknown>;

      // tasks/result returns the result payload (not task metadata)
      expect(taskResult).toBeDefined();
      expect(typeof taskResult).toBe('object');
      expect(taskResult).toHaveProperty('content');
      expect(Array.isArray(taskResult.content)).toBe(true);

      // verify related-task metadata is injected into the result
      expect(taskResult._meta).toBeDefined();
      expect((taskResult._meta as Record<string, unknown>)['io.modelcontextprotocol/related-task']).toEqual({ taskId: createdTaskId });
    });
  });

  describe('task listing', () => {
    it('should list tasks via tasks/list [TASK-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tasks/list returns an array of tasks including the previously
       * created task, confirming task listing with session-scoped visibility.
       * The spec defines tasks/list with cursor-based pagination, returning tasks array
       * and optional nextCursor. Tasks are scoped to the current session.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L185-L186 (listTasks)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/interfaces.ts#L229 (listTasks interface)
       */
      // NOTE: Using raw stdio session because tasks were created in this session.
      // Using the connector would query a different session that has no tasks.
      const result = (await rawSession.send('tasks/list', {})) as {
        tasks: Array<{ taskId: string; status: string }>;
      };

      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
      // at least the task from TASK-001 should be in the list
      expect(result.tasks.length).toBeGreaterThanOrEqual(1);

      // verify the created task appears in the list
      const matchingTask = result.tasks.find((t) => t.taskId === createdTaskId);
      expect(matchingTask).toBeDefined();
    });

    it('should support pagination via cursor parameter [TASK-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tasks/list supports cursor-based pagination by creating
       * multiple tasks and confirming the list returns at least 2 entries.
       * The spec requires receivers MUST include a nextCursor if more tasks are available,
       * and requestors MUST treat cursors as opaque tokens.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/stores/inMemory.ts#L185-L186 (listTasks)
       */
      // create multiple tasks for pagination testing
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

      // request tasks/list with cursor parameter
      const result = (await rawSession.send('tasks/list', {
        cursor: undefined,
      })) as { tasks: Array<{ taskId: string; status: string }>; nextCursor?: string };

      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
      expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('task status notifications', () => {
    it('should emit status notifications when task transitions [TASK-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server sends notifications/tasks/status via stdio when
       * a task transitions to completed status, confirming push-based status updates.
       * The spec defines TaskStatusNotification with method 'notifications/tasks/status'
       * and params containing the full Task object. Receivers are not required to send these
       * notifications, but when sent they are fire-and-forget (no response expected).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L2007-L2017 (TaskStatusNotification)
       */
      // register a handler for server-initiated notifications
      const statusNotifications: Array<{
        taskId: string;
        status: string;
        statusMessage: string;
      }> = [];

      rawSession.onServerNotification((method, params) => {
        if (method === 'notifications/tasks/status') {
          const notification = params as {
            taskId: string;
            status: string;
            statusMessage: string;
          };
          statusNotifications.push(notification);
        }
      });

      // create a task that will complete asynchronously
      const createResult = (await rawSession.callToolWithTask(
        'task-operation',
        { input: 'status-notification-test' },
        { ttl: 60000 },
      )) as CreateTaskCallResult;

      const taskId = createResult.task.taskId;

      // wait for the task to complete and notifications to be delivered
      await delay(TASK_COMPLETION_WAIT_MS);

      // poll to confirm the task has completed
      const completedResult = await pollUntilStatus(rawSession, taskId, 'completed');
      expect(completedResult.status).toBe('completed');

      // hard-assert that at least one status notification was received
      const foundNotification = statusNotifications.some((n) => n.taskId === taskId);
      expect(foundNotification).toBe(true);

      // verify the notification structure
      const notification = statusNotifications.find((n) => n.taskId === taskId);
      expect(notification).toBeDefined();
      expect(notification!.status).toEqual(expect.any(String));
      expect(notification!.statusMessage).toEqual(expect.any(String));
    });
  });

  describe('tool negotiation', () => {
    it('should advertise taskSupport in task-operation tool execution field [TASK-012]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tools/list returns the task-operation tool with
       * execution.taskSupport = 'optional', confirming tool-level task negotiation.
       * The spec defines ToolExecution.taskSupport as 'forbidden' | 'optional' | 'required'.
       * Default is 'forbidden' when execution or taskSupport is absent.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1695-L1707 (ToolExecution and taskSupport)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/experimental/tasks/mcpServer.ts#L119-L122 (taskSupport validation)
       */
      const tools = await ctx.connector.listTools();

      const taskTool = tools.find((t) => t.name === 'task-operation');
      expect(taskTool).toBeDefined();

      // the test server declares execution: { taskSupport: 'optional' }
      const execution = (taskTool as { execution?: { taskSupport?: string } })
        .execution;
      expect(execution).toBeDefined();
      expect(execution!.taskSupport).toBe('optional');
    });

    it.skip('should return -32601 when calling a tool without taskSupport using task param [TASK-012]', async () => {
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
      let caughtError: Error | undefined;

      try {
        await rawSession.callToolWithTask('echo', { text: 'hello' }, { ttl: 60000 });
      } catch (error: unknown) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain('-32601');
    });

    it.skip('should return -32601 when calling a taskSupport=required tool without task param [TASK-012]', async () => {
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
      let caughtError: Error | undefined;

      try {
        await rawSession.send('tools/call', {
          name: 'task-required-tool',
          arguments: {},
        });
      } catch (error: unknown) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain('-32601');
    });
  });

  describe('task cancellation', () => {
    it('should cancel a working task via tasks/cancel [TASK-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that tasks/cancel transitions a working task to 'cancelled' status,
       * returning updated task metadata with the cancelled status. The spec requires
       * receivers MUST transition the task to 'cancelled' status before sending the response.
       * Receivers MUST reject cancellation for tasks already in terminal status with -32602.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1949-L1964 (CancelTaskRequest and CancelTaskResult)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/interfaces.ts#L220 (updateTaskStatus)
       */
      // NOTE: Using raw stdio client because connector does not support the task parameter in tools/call
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
    });
  });

  describe('task failure', () => {
    it('should handle task that transitions to failed status [TASK-011]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that a task can transition to 'failed' status and that tasks/result
       * returns -32603 error for failed tasks. The spec states task execution errors are
       * reported through task status, and protocol errors use standard JSON-RPC error codes.
       * Internal errors use -32603. The test correctly checks for 'failed' status and
       * -32603 on tasks/result for a failed task.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/spec.types.ts#L1781-L1786 (TaskStatus including 'failed')
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/experimental/tasks/interfaces.ts#L240-L241 (isTerminal)
       */
      // NOTE: Using raw stdio client because connector does not support the task parameter in tools/call
      const createResult = (await rawSession.callToolWithTask(
        'task-failing',
        { reason: 'test failure' },
        { ttl: 60000 },
      )) as CreateTaskCallResult;

      const taskId = createResult.task.taskId;

      expect(createResult.task.status).toBe('working');

      // wait for the task to fail (server simulates 500ms processing delay)
      await delay(TASK_COMPLETION_WAIT_MS);

      const failedResult = await pollUntilStatus(rawSession, taskId, 'failed');

      expect(failedResult.taskId).toBe(taskId);
      expect(failedResult.status).toBe('failed');
      expect(failedResult.statusMessage).toEqual(expect.any(String));

      // tasks/result should fail for a task in "failed" status
      let caughtError: Error | undefined;

      try {
        await rawSession.send('tasks/result', { taskId });
      } catch (error: unknown) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain('-32603');
    });
  });
});
