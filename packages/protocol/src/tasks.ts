/**
 * task-related methods and types
 * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/tasks
 */

import type { JsonifibleObject, JsonifibleValue } from '#json';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';
import type { Cursor } from '#primitives';

/** lifecycle states for a task */
export type TaskStatus =
  | 'working'
  | 'input_required'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** metadata used to request task-augmented execution */
export type TaskMetadata = {
  /** requested task retention time in milliseconds */
  ttl?: number;
};

/** metadata describing a task instance */
export type Task = {
  /** unique task identifier */
  taskId: string;
  /** current task state */
  status: TaskStatus;
  /** optional human-readable status details */
  statusMessage?: string;
  /** ISO 8601 timestamp when the task was created */
  createdAt: string;
  /** ISO 8601 timestamp when the task was last updated */
  lastUpdatedAt: string;
  /** retention duration in milliseconds, or null for unlimited */
  ttl: number | null;
  /** suggested polling interval in milliseconds */
  pollInterval?: number;
  /** optional metadata for protocol-level extensions */
  _meta?: JsonifibleObject;
};

/** immediate result returned for task-augmented requests */
export interface CreateTaskResult extends JsonRpcResultData {
  task: Task;
}

/** request to retrieve a task's current state */
export interface GetTaskRequest extends JsonRpcRequestData {
  method: 'tasks/get';
  params: {
    taskId: string;
  };
}

/** current state of a task */
export interface GetTaskResult extends JsonRpcResultData, Task {}

/** request to retrieve the final payload for a completed task */
export interface GetTaskPayloadRequest extends JsonRpcRequestData {
  method: 'tasks/result';
  params: {
    taskId: string;
  };
}

/** payload associated with a completed task */
export interface GetTaskPayloadResult extends JsonRpcResultData {
  [key: string]: JsonifibleValue;
}

/** request to cancel a task */
export interface CancelTaskRequest extends JsonRpcRequestData {
  method: 'tasks/cancel';
  params: {
    taskId: string;
  };
}

/** current state returned after cancelling a task */
export interface CancelTaskResult extends JsonRpcResultData, Task {}

/** request to list tasks */
export interface ListTasksRequest extends JsonRpcRequestData {
  method: 'tasks/list';
  params?: {
    cursor?: Cursor;
  };
}

/** paginated list of tasks */
export interface ListTasksResult extends JsonRpcResultData {
  nextCursor?: Cursor;
  tasks: Task[];
}
