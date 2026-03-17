/**
 * provides a fully-featured MCP server with tools, prompts, resources
 *
 * resource templates, subscriptions, and completions for testing all MCP features.
 * includes task store, server-initiated request triggers, and notification triggers.
 */

import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

import { McpServer } from '@coremcp/server';

import type { Log, Session } from '@coremcp/core';
import type {
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,

  CallToolRequest,
  CallToolResult,
  JsonifibleObject,
  JsonifibleValue,
  JsonSchema,
  McpLogLevel,
  ProgressToken,
} from '@coremcp/protocol';
import type {
  CancelTask,
  Complete,
  GetPrompt,
  GetTask,
  GetTaskResultPayload,
  ListPrompts,
  ListResources,
  ListTasks,
  ListTools,
  ReadResource,
  RequestContext,
  Subscribe,
  Unsubscribe,
} from '@coremcp/server';

// EXPORTED CONSTANTS //

/** server application info for test assertions */
export const TEST_SERVER_INFO = {
  name: 'coremcp-test-server',
  version: '1.0.0',
};

/** list of tool names available in the test server */
export const TEST_TOOLS = [
  'echo',
  'add',
  'get-image',
  'slow-operation',
  'structured-output',
  'trigger-sampling',
  'trigger-elicitation',
  'trigger-elicitation-url',
  'trigger-ping',
  'trigger-roots-list',
  'trigger-list-changed',
  'trigger-resource-updated',
  'trigger-log',
  'trigger-internal-error',
  'task-operation',
  'task-failing',
];

/** list of prompt names available in the test server */
export const TEST_PROMPTS = [
  'simple-prompt',
  'greeting-prompt',
  'styled-prompt',
  'complex_prompt',
];

/** list of resource URIs available in the test server */
export const TEST_RESOURCES = Array.from(
  { length: 100 },
  (_, i) => `test://static/resource/${i + 1}`,
);

/** list of resource template URI patterns */
export const TEST_RESOURCE_TEMPLATES = [
  'test://text/{id}',
  'test://binary/{id}',
];

// INTERNAL CONSTANTS //

/** 1x1 red pixel PNG image encoded as base64 */
const RED_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

/** milliseconds per second for timeout calculations */
const MILLISECONDS_PER_SECOND = 1000;

/** default task TTL in milliseconds (60 seconds) */
const DEFAULT_TASK_TTL = 60_000;

/** poll interval suggestion for task status checks */
const DEFAULT_POLL_INTERVAL = 2000;

/** maximum time in milliseconds that tasks/result will block while waiting for a terminal state */
const TASK_RESULT_TIMEOUT = 10_000;

/** internal polling interval in milliseconds used when tasks/result blocks for completion */
const TASK_RESULT_POLL_INTERVAL = 100;

/** simulated async task processing delay in milliseconds */
const TASK_PROCESSING_DELAY = 500;

/** number of progress steps emitted during slow-operation when a progress token is present */
const PROGRESS_TOTAL_STEPS = 5;

/** maximum number of items returned per page for list handler pagination */
const PAGE_SIZE = 3;

/** timeout in milliseconds for waiting on client responses to server-initiated requests */
const SERVER_REQUEST_TIMEOUT = 30_000;

// PENDING RESPONSE INFRASTRUCTURE //

/** resolver pair for a pending server-initiated request awaiting client response */
interface PendingResponse {
  /** resolves the pending promise with the client's result payload */
  resolve: (value: unknown) => void;
  /** rejects the pending promise with the client's error payload */
  reject: (reason?: unknown) => void;
}

/**
 * maps request IDs to their pending response resolvers
 *
 * when the server sends a request to the client, a promise is created and its
 * resolve/reject pair is stored here keyed by request ID. when the client's
 * response arrives via session.addEvent, the interceptor resolves the promise.
 */
const pendingResponses = new Map<string, PendingResponse>();

/** tracks sessions whose addEvent method has been wrapped with the response interceptor */
const wrappedSessions = new WeakSet<Session>();

/**
 * ensures a session's addEvent method is wrapped to intercept client responses
 *
 * wraps session.addEvent exactly once per session instance to detect incoming
 * client-message events that carry a responseToRequestId matching a pending
 * server-initiated request. when a match is found, the corresponding promise
 * stored in pendingResponses is resolved (or rejected for error responses).
 * @param session session to install the response interceptor on
 */
function ensureResponseInterceptor(session: Session): void {
  if (wrappedSessions.has(session)) {
    return;
  }

  wrappedSessions.add(session);

  const originalAddEvent = session.addEvent.bind(session);

  session.addEvent = async (partial, options) => {
    await originalAddEvent(partial, options);

    if (
      partial.type === 'client-message' &&
      'responseToRequestId' in partial &&
      partial.responseToRequestId !== undefined
    ) {
      const requestId = String(partial.responseToRequestId);
      const pending = pendingResponses.get(requestId);

      if (pending) {
        pendingResponses.delete(requestId);

        const msg = partial.message;

        if (msg && typeof msg === 'object' && 'error' in msg && msg.error) {
          pending.reject(msg.error);
        } else if (msg && typeof msg === 'object' && 'result' in msg) {
          pending.resolve(msg.result);
        } else {
          pending.resolve(undefined);
        }
      }
    }
  };
}

// TASK STORE TYPES //

/** valid task status values */
type TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';

/** task entry stored in the in-memory task store */
interface TaskEntry {
  /** unique task identifier */
  taskId: string;
  /** current task status */
  status: TaskStatus;
  /** human-readable status description */
  statusMessage: string;
  /** ISO timestamp of task creation */
  createdAt: string;
  /** ISO timestamp of last update */
  lastUpdatedAt: string;
  /** time-to-live in milliseconds */
  ttl: number;
  /** suggested polling interval */
  pollInterval: number | undefined;
  /** stored result payload for completed tasks */
  result?: Record<string, unknown>;
  /** session that created this task */
  sessionId: string;
  /** session reference for sending notifications after async completion */
  session?: Session;
  /** channel id at the time the task was created, used to prevent stale notifications */
  originChannelId?: string;
}

// TASK STORE //

/** in-memory task store keyed by taskId */
const taskStore = new Map<string, TaskEntry>();

/** monotonically increasing task ID counter */
let taskIdCounter = 0;

/**
 * generates a unique task identifier
 * @returns unique task ID string
 */
function generateTaskId(): string {
  taskIdCounter += 1;

  return `task-${taskIdCounter}`;
}

/**
 * creates a new task entry in the store
 * @param sessionId session that initiated the task
 * @param ttl optional time-to-live override
 * @returns the created task entry
 */
function createTask(sessionId: string, ttl?: number): TaskEntry {
  const taskId = generateTaskId();
  const now = new Date().toISOString();
  const entry: TaskEntry = {
    taskId,
    status: 'working',
    statusMessage: 'Task started',
    createdAt: now,
    lastUpdatedAt: now,
    ttl: ttl ?? DEFAULT_TASK_TTL,
    pollInterval: DEFAULT_POLL_INTERVAL,
    sessionId,
  };

  taskStore.set(taskId, entry);

  return entry;
}

/**
 * retrieves a task entry from the store
 * @param taskId task identifier to look up
 * @returns the task entry or undefined if not found
 */
function getStoredTask(taskId: string): TaskEntry | undefined {
  return taskStore.get(taskId);
}

/**
 * checks whether a task status represents a terminal (final) state
 * @param status task status to evaluate
 * @returns true if the status is terminal (completed, failed, or cancelled)
 */
function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

/**
 * waits for a task to reach a terminal state by polling the task store
 *
 * blocks until the task transitions to completed, failed, or cancelled,
 * or until the timeout is exceeded.
 * @param taskId task identifier to wait for
 * @param timeoutMs maximum wait time in milliseconds
 * @returns the task entry in its terminal state
 * @throws {JsonRpcError} when the timeout is exceeded before the task reaches a terminal state
 */
async function waitForTerminalState(
  taskId: string,
  timeoutMs: number = TASK_RESULT_TIMEOUT,
): Promise<TaskEntry> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const entry = getStoredTask(taskId);

    if (!entry) {
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: `Task not found: ${taskId}`,
      });
    }

    if (isTerminalStatus(entry.status)) {
      return entry;
    }

    await new Promise((resolve) => setTimeout(resolve, TASK_RESULT_POLL_INTERVAL));
  }

  throw new JsonRpcError({
    code: MCP_ERROR_CODES.INTERNAL_ERROR,
    message: `Timed out waiting for task to complete: ${taskId}`,
  });
}

/**
 * updates a task's status in the store
 * @param taskId task identifier to update
 * @param status new task status
 * @param statusMessage human-readable status text
 * @param result optional result payload for completed tasks
 */
function updateTask(
  taskId: string,
  status: TaskStatus,
  statusMessage: string,
  result?: Record<string, unknown>,
): void {
  const entry = taskStore.get(taskId);

  if (entry) {
    entry.status = status;
    entry.statusMessage = statusMessage;
    entry.lastUpdatedAt = new Date().toISOString();

    if (result) {
      entry.result = result;
    }

    // clear poll interval for terminal states
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      entry.pollInterval = undefined;
    }
  }
}

// TOOL DEFINITIONS //

const tools: Tool[] = [
  {
    name: 'echo',
    description: 'Echoes back the provided text',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to echo back',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'add',
    description: 'Adds two numbers together and returns the sum',
    inputSchema: {
      type: 'object',
      properties: {
        a: {
          type: 'number',
          description: 'First number to add',
        },
        b: {
          type: 'number',
          description: 'Second number to add',
        },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'get-image',
    description: 'Returns a small base64 PNG image for testing binary content',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'slow-operation',
    description:
      'Waits for specified duration then returns (for testing timeouts)',
    inputSchema: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          description: 'Duration to wait in seconds',
        },
        noTotal: {
          type: 'boolean',
          description:
            'When true, progress notifications are emitted without the total field',
        },
      },
      required: ['duration'],
      additionalProperties: false,
    },
  },
  {
    name: 'structured-output',
    description:
      'Returns both content and structuredContent for testing TOOL-004',
    inputSchema: {
      type: 'object',
      properties: {
        itemCount: {
          type: 'number',
          description: 'Number of items to include in structured output',
        },
      },
      required: [],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        itemsProcessed: { type: 'number' },
        status: { type: 'string' },
        results: { type: 'array', items: { type: 'string' } },
      },
      required: ['itemsProcessed', 'status', 'results'],
    },
  },
  {
    name: 'trigger-sampling',
    description:
      'Triggers a sampling/createMessage request from server to client for SAMPLING tests',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Prompt text to send in sampling request',
        },
        maxTokens: {
          type: 'number',
          description: 'Maximum tokens for sampling',
        },
        modelPreferences: {
          type: 'object',
          description: 'Server preferences for LLM model selection',
          properties: {},
          required: [],
        },
        tools: {
          type: 'array',
          description: 'Tools the model may use during generation',
          items: { type: 'object', properties: {}, required: [] },
        },
        toolChoice: {
          type: 'object',
          description: 'Controls how the model uses tools',
          properties: {},
          required: [],
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-elicitation',
    description:
      'Triggers an elicitation/create request from server to client for ELICITATION tests',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to display for elicitation',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-elicitation-url',
    description:
      'Triggers a URL mode elicitation/create request from server to client for ELICITATION-002 tests',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL the user should open for out-of-band elicitation',
        },
        description: {
          type: 'string',
          description: 'Optional description of what the URL is for',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-ping',
    description:
      'Triggers a ping request from server to client for PING-002 tests',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-roots-list',
    description:
      'Triggers a roots/list request from server to client for ROOTS-001 tests',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-list-changed',
    description:
      'Emits list_changed notifications for resources, prompts, or tools',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description:
            'Which list_changed to emit: resources, prompts, or tools',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-resource-updated',
    description:
      'Emits a notifications/resources/updated notification for RESOURCE-005 subscribe cycle tests',
    inputSchema: {
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          description: 'URI of the resource that was updated',
        },
      },
      required: ['uri'],
      additionalProperties: false,
    },
  },
  {
    name: 'trigger-log',
    description:
      'Emits a notifications/message log notification for LOGGING-002 tests',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          description: 'Log level (debug, info, warning, error)',
        },
        data: {
          description: 'Log message data (any JSON value)',
        },
        logger: {
          type: 'string',
          description: 'Logger name',
        },
      },
      required: ['level', 'data'],
      additionalProperties: false,
    } as unknown as JsonSchema,
  },
  {
    name: 'trigger-internal-error',
    description: 'Triggers an internal server error',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'task-operation',
    description:
      'Async task tool with optional task support for TASK tests',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Input data for the task',
        },
        triggerSampling: {
          type: 'boolean',
          description:
            'When true, triggers a sampling/createMessage request with related-task metadata during task execution',
        },
        triggerElicitation: {
          type: 'boolean',
          description:
            'When true, triggers an elicitation/create request with related-task metadata during task execution',
        },
      },
      required: [],
      additionalProperties: false,
    },
    execution: { taskSupport: 'optional' },
  },
  {
    name: 'task-failing',
    description:
      'Creates a task that transitions to failed status for TASK-011 tests',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Failure reason',
        },
      },
      required: [],
      additionalProperties: false,
    },
    execution: { taskSupport: 'optional' },
  },
];

// PROMPT DEFINITIONS //

const prompts: Prompt[] = [
  {
    name: 'simple-prompt',
    description: 'A simple prompt with no arguments',
  },
  {
    name: 'greeting-prompt',
    description: 'Generates a greeting message for the specified name',
    arguments: [
      {
        name: 'name',
        description: 'Name of the person to greet',
        required: true,
      },
    ],
  },
  {
    name: 'styled-prompt',
    description: 'Generates a styled message with customizable format',
    arguments: [
      {
        name: 'style',
        description: 'Style of the message (formal, casual, friendly)',
        required: true,
      },
      {
        name: 'format',
        description: 'Optional format (short, long)',
        required: false,
      },
    ],
  },
  {
    name: 'complex_prompt',
    description: 'Generates a complex message with temperature and style controls',
    arguments: [
      {
        name: 'temperature',
        description: 'Temperature setting (high, hot, humid, low, mild, warm)',
        required: true,
      },
      {
        name: 'style',
        description: 'Optional output style (formal, casual, friendly)',
        required: false,
      },
    ],
  },
];

// RESOURCE DEFINITIONS //

const resources: Resource[] = Array.from({ length: 100 }, (_, i) => {
  const id = i + 1;

  return {
    uri: `test://static/resource/${id}`,
    name: `Resource ${id}`,
    description: `A test resource`,
    mimeType: id % 2 === 1 ? 'text/plain' : 'application/octet-stream',
  };
});

// RESOURCE TEMPLATE DEFINITIONS //

const resourceTemplates: ResourceTemplate[] = [
  {
    name: 'Text Resources',
    description: 'Template for text resources with dynamic ID',
    uriTemplate: 'test://text/{id}',
    mimeType: 'text/plain',
  },
  {
    name: 'Binary Resources',
    description: 'Template for binary resources with dynamic ID',
    uriTemplate: 'test://binary/{id}',
    mimeType: 'image/png',
  },
];

/**
 * sends a notifications/tasks/status notification to the session associated with a task
 *
 * looks up the task entry to retrieve the stored session reference, then sends
 * a task status notification containing the current task metadata.
 * @param taskId identifier of the task whose status changed
 */
async function emitTaskStatusNotification(taskId: string): Promise<void> {
  const entry = getStoredTask(taskId);

  if (!entry?.session) {
    return;
  }

  try {
    const params: JsonifibleObject = {
      taskId: entry.taskId,
      status: entry.status,
      statusMessage: entry.statusMessage,
      createdAt: entry.createdAt,
      lastUpdatedAt: entry.lastUpdatedAt,
      ttl: entry.ttl,
      pollInterval: entry.pollInterval,
    };

    await entry.session.notify({
      method: 'notifications/tasks/status',
      params,
    });
  } catch {
    // best-effort notification delivery; ignore errors from closed sessions
  }
}

// META EXTRACTION HELPERS //

/**
 * extracts the progress token from the request params _meta field
 *
 * at runtime the MCP wire format places _meta inside the params object,
 * even though the TypeScript type hierarchy models it at the request level.
 * this helper safely extracts the progress token using an index signature access.
 * @param params tool call request parameters
 * @returns the progress token if present, or undefined
 */
function extractProgressToken(
  params: CallToolRequest['params'],
): ProgressToken | undefined {
  const meta = (params as Record<string, JsonifibleValue>)['_meta'];

  if (meta && typeof meta === 'object' && 'progressToken' in meta) {
    const token = (meta as JsonifibleObject).progressToken;

    if (typeof token === 'string' || typeof token === 'number') {
      return token;
    }
  }

  return undefined;
}

// ARGUMENT EXTRACTION HELPERS //

/**
 * safely extracts a string argument from tool arguments
 * @param args tool arguments object
 * @param key argument name to extract
 * @param defaultValue fallback value if argument is missing or wrong type
 * @returns extracted string value or default
 */
function extractString(
  args: Record<string, unknown> | undefined,
  key: string,
  defaultValue: string,
): string {
  if (
    args &&
    typeof args === 'object' &&
    key in args &&
    typeof args[key] === 'string'
  ) {
    return args[key];
  }

  return defaultValue;
}

/**
 * safely extracts a number argument from tool arguments
 * @param args tool arguments object
 * @param key argument name to extract
 * @param defaultValue fallback value if argument is missing or wrong type
 * @returns extracted number value or default
 */
function extractNumber(
  args: Record<string, unknown> | undefined,
  key: string,
  defaultValue: number,
): number {
  if (
    args &&
    typeof args === 'object' &&
    key in args &&
    typeof args[key] === 'number'
  ) {
    return args[key];
  }

  return defaultValue;
}

/**
 * safely extracts a boolean argument from tool arguments
 * @param args tool arguments object
 * @param key argument name to extract
 * @param defaultValue fallback value if argument is missing or wrong type
 * @returns extracted boolean value or default
 */
function extractBoolean(
  args: Record<string, unknown> | undefined,
  key: string,
  defaultValue: boolean,
): boolean {
  if (
    args &&
    typeof args === 'object' &&
    key in args &&
    typeof args[key] === 'boolean'
  ) {
    return args[key];
  }

  return defaultValue;
}

/**
 * safely extracts an object argument from tool arguments
 * @param args tool arguments object
 * @param key argument name to extract
 * @returns extracted object value or undefined if missing or wrong type
 */
function extractObject(
  args: Record<string, unknown> | undefined,
  key: string,
): JsonifibleObject | undefined {
  if (
    args &&
    typeof args === 'object' &&
    key in args &&
    typeof args[key] === 'object' &&
    args[key] !== null &&
    !Array.isArray(args[key])
  ) {
    return args[key] as JsonifibleObject;
  }

  return undefined;
}

/**
 * safely extracts an array argument from tool arguments
 * @param args tool arguments object
 * @param key argument name to extract
 * @returns extracted array value or undefined if missing or wrong type
 */
function extractArray(
  args: Record<string, unknown> | undefined,
  key: string,
): Array<JsonifibleObject> | undefined {
  if (
    args &&
    typeof args === 'object' &&
    key in args &&
    Array.isArray(args[key])
  ) {
    return args[key] as Array<JsonifibleObject>;
  }

  return undefined;
}

// HANDLER IMPLEMENTATIONS //

/**
 * handles tool execution requests for the test server
 * @param params request parameters
 * @param params.name the tool name to execute
 * @param params.arguments tool-specific arguments
 * @param context request context with session
 * @param params.task
 * @param context.session
 * @returns tool execution result with content
 * @throws {Error} when the tool name is not recognized
 */
const callTool = async (
  params: CallToolRequest['params'],
  { session, abort }: RequestContext,
): Promise<CallToolResult> => {
  const { name, arguments: args, task } = params;
  switch (name) {
    case 'echo': {
      const text = extractString(args, 'text', '');

      return {
        content: [{ type: 'text', text }],
      };
    }

    case 'add': {
      const a = extractNumber(args, 'a', 0);
      const b = extractNumber(args, 'b', 0);
      const sum = a + b;

      return {
        content: [{ type: 'text', text: String(sum) }],
      };
    }

    case 'get-image': {
      return {
        content: [
          {
            type: 'image',
            data: RED_PIXEL_PNG_BASE64,
            mimeType: 'image/png',
          },
        ],
      };
    }

    case 'slow-operation': {
      const duration = extractNumber(args, 'duration', 1);
      const durationMs = duration * MILLISECONDS_PER_SECOND;
      const noTotal = extractBoolean(args, 'noTotal', false);
      const progressToken = extractProgressToken(params);

      /**
       * creates a promise that rejects when the abort signal fires,
       * enabling Promise.race to cancel the sleep early
       */
      const abortPromise = new Promise<never>((_, reject) => {
        if (abort.aborted) {
          reject(new Error('Operation cancelled'));
          return;
        }

        abort.addEventListener('abort', () => reject(new Error('Operation cancelled')), {
          once: true,
        });
      });

      if (progressToken !== undefined) {
        const stepDelay = durationMs / PROGRESS_TOTAL_STEPS;

        for (let step = 1; step <= PROGRESS_TOTAL_STEPS; step++) {
          await Promise.race([
            new Promise<void>((resolve) => setTimeout(resolve, stepDelay)),
            abortPromise,
          ]);

          const progressParams: JsonifibleObject = {
            progressToken,
            progress: step,
          };

          if (!noTotal) {
            progressParams.total = PROGRESS_TOTAL_STEPS;
          }

          await session.notify({
            method: 'notifications/progress',
            params: progressParams,
          });
        }
      } else {
        await Promise.race([
          new Promise<void>((resolve) => setTimeout(resolve, durationMs)),
          abortPromise,
        ]);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Operation completed after ${duration} second(s)`,
          },
        ],
      };
    }

    case 'structured-output': {
      const itemCount = extractNumber(args, 'itemCount', 3);
      const results: string[] = Array.from(
        { length: itemCount },
        (_, i) => `item-${i + 1}`,
      );

      const structured: Record<string, JsonifibleValue> = {
        itemsProcessed: itemCount,
        status: 'complete',
        results,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(structured),
          },
        ],
        structuredContent: structured,
      };
    }

    case 'trigger-sampling': {
      const prompt = extractString(args, 'prompt', 'Hello');
      const maxTokens = extractNumber(args, 'maxTokens', 100);

      const messages: JsonifibleValue = [
        {
          role: 'user',
          content: { type: 'text', text: prompt },
        },
      ];

      const samplingParams: Record<string, JsonifibleValue> = {
        messages,
        maxTokens,
      };

      const modelPreferences = extractObject(args, 'modelPreferences');

      if (modelPreferences) {
        samplingParams.modelPreferences = modelPreferences;
      }

      const samplingTools = extractArray(args, 'tools');

      if (samplingTools) {
        samplingParams.tools = samplingTools;
      }

      const toolChoice = extractObject(args, 'toolChoice');

      if (toolChoice) {
        samplingParams.toolChoice = toolChoice;
      }

      const samplingResult = await sendServerRequest(session, 'sampling/createMessage', samplingParams);

      return {
        content: [
          {
            type: 'text',
            text: `Sampling result received: ${JSON.stringify(samplingResult)}`,
          },
        ],
      };
    }

    case 'trigger-elicitation': {
      const message = extractString(
        args,
        'message',
        'Please provide input',
      );

      const requestedSchema: JsonifibleObject = {
        type: 'object',
        properties: {
          value: {
            type: 'string',
            title: 'Value',
            description: 'A value to provide',
          },
        },
        required: ['value'],
      };

      const elicitResult = await sendServerRequest(session, 'elicitation/create', {
        message,
        requestedSchema,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Elicitation result received: ${JSON.stringify(elicitResult)}`,
          },
        ],
      };
    }

    case 'trigger-elicitation-url': {
      const url = extractString(args, 'url', '');
      const description = extractString(args, 'description', '');
      const elicitationId = `elicit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const urlElicitParams: Record<string, JsonifibleValue> = {
        mode: 'url',
        message: description || `Please open ${url}`,
        elicitationId,
        url,
      };

      const urlElicitResult = await sendServerRequest(session, 'elicitation/create', urlElicitParams);

      // emit elicitation complete notification after receiving the response (6.5)
      const completeParams: JsonifibleObject = {
        elicitationId,
      };

      if (urlElicitResult && typeof urlElicitResult === 'object') {
        completeParams.result = urlElicitResult as JsonifibleObject;
      }

      await session.notify({
        method: 'notifications/elicitation/complete',
        params: completeParams,
      });

      return {
        content: [
          {
            type: 'text',
            text: `URL elicitation result received: ${JSON.stringify(urlElicitResult)}`,
          },
        ],
      };
    }

    case 'trigger-ping': {
      await sendServerRequest(session, 'ping', {});

      return {
        content: [{ type: 'text', text: 'Ping sent and response received' }],
      };
    }

    case 'trigger-roots-list': {
      // check client capabilities before sending server-to-client request
      if (!session.capabilities.client.roots) {
        throw new JsonRpcError({
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message:
            'Client does not support roots capability',
        });
      }

      const rootsResult = await sendServerRequest(session, 'roots/list', {});

      return {
        content: [
          {
            type: 'text',
            text: `Roots received: ${JSON.stringify(rootsResult)}`,
          },
        ],
      };
    }

    case 'trigger-list-changed': {
      const target = extractString(
        args,
        'target',
        'tools',
      );

      const notificationMethod: `notifications/${string}` = `notifications/${target}/list_changed`;

      await session.notify({ method: notificationMethod });

      return {
        content: [
          {
            type: 'text',
            text: `Sent ${notificationMethod} notification`,
          },
        ],
      };
    }

    case 'trigger-resource-updated': {
      const uri = extractString(args, 'uri', 'test://text/1');

      await session.notify({
        method: 'notifications/resources/updated',
        params: { uri },
      });

      return {
        content: [
          {
            type: 'text',
            text: `Sent notifications/resources/updated for ${uri}`,
          },
        ],
      };
    }

    case 'trigger-log': {
      const level = extractString(args, 'level', 'info') as McpLogLevel;
      const data = (args?.data !== undefined ? args.data : 'test log') as JsonifibleValue;
      const logger = extractString(args, 'logger', '');

      await session.sendLog(level, data, logger || undefined);

      return {
        content: [
          { type: 'text', text: `Log notification sent at level: ${level}` },
        ],
      };
    }

    case 'trigger-internal-error': {
      throw new Error('Unexpected internal error');
    }

    case 'task-operation': {
      // if task parameter is present, create an async task
      if (task) {
        const taskTtl =
          task && typeof task === 'object' && 'ttl' in task && typeof task.ttl === 'number'
            ? task.ttl
            : DEFAULT_TASK_TTL;

        const taskEntry = createTask(session.id, taskTtl);
        taskEntry.session = session;
        taskEntry.originChannelId = session.id;
        const input = extractString(args, 'input', 'default');
        const shouldTriggerSampling = extractBoolean(args, 'triggerSampling', false);
        const shouldTriggerElicitation = extractBoolean(args, 'triggerElicitation', false);

        // simulate async processing with optional sampling/elicitation triggers
        void (async () => {
          await new Promise((resolve) => setTimeout(resolve, TASK_PROCESSING_DELAY));

          if (shouldTriggerSampling) {
            await sendServerRequest(session, 'sampling/createMessage', {
              messages: [
                {
                  role: 'user',
                  content: { type: 'text', text: `Task ${taskEntry.taskId} needs sampling` },
                },
              ] as JsonifibleValue,
              maxTokens: 100,
              _meta: { 'io.modelcontextprotocol/related-task': { taskId: taskEntry.taskId } },
            });
          }

          if (shouldTriggerElicitation) {
            await sendServerRequest(session, 'elicitation/create', {
              message: `Task ${taskEntry.taskId} needs user input`,
              requestedSchema: {
                type: 'object',
                properties: {
                  value: {
                    type: 'string',
                    title: 'Value',
                    description: 'A value to provide for the task',
                  },
                },
                required: ['value'],
              },
              _meta: { 'io.modelcontextprotocol/related-task': { taskId: taskEntry.taskId } },
            });
          }

          updateTask(taskEntry.taskId, 'completed', 'Task completed successfully', {
            content: [
              {
                type: 'text',
                text: `Task processed input: ${input}`,
              },
            ],
          });
          await emitTaskStatusNotification(taskEntry.taskId);
        })();

        return {
          content: [],
          task: {
            taskId: taskEntry.taskId,
            status: taskEntry.status,
            statusMessage: taskEntry.statusMessage,
            createdAt: taskEntry.createdAt,
            lastUpdatedAt: taskEntry.lastUpdatedAt,
            ttl: taskEntry.ttl,
            pollInterval: taskEntry.pollInterval,
          },
        };
      }

      // synchronous mode
      const input = extractString(args, 'input', 'default');

      return {
        content: [
          {
            type: 'text',
            text: `Synchronously processed input: ${input}`,
          },
        ],
      };
    }

    case 'task-failing': {
      if (task) {
        const taskTtl =
          task && typeof task === 'object' && 'ttl' in task && typeof task.ttl === 'number'
            ? task.ttl
            : DEFAULT_TASK_TTL;

        const taskEntry = createTask(session.id, taskTtl);
        taskEntry.session = session;
        taskEntry.originChannelId = session.id;
        const reason = extractString(
          args,
          'reason',
          'Simulated failure',
        );

        // simulate async failure
        setTimeout(() => {
          updateTask(taskEntry.taskId, 'failed', reason);
          void emitTaskStatusNotification(taskEntry.taskId);
        }, TASK_PROCESSING_DELAY);

        return {
          content: [],
          task: {
            taskId: taskEntry.taskId,
            status: taskEntry.status,
            statusMessage: taskEntry.statusMessage,
            createdAt: taskEntry.createdAt,
            lastUpdatedAt: taskEntry.lastUpdatedAt,
            ttl: taskEntry.ttl,
            pollInterval: taskEntry.pollInterval,
          },
        };
      }

      // synchronous failure
      const reason = extractString(
        args,
        'reason',
        'Simulated failure',
      );

      return {
        content: [{ type: 'text', text: reason }],
        isError: true,
      };
    }

    default:
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: `Unknown tool: ${name}`,
      });
  }
};

/**
 * sends a server-initiated JSON-RPC request to the client and awaits the response
 *
 * installs a response interceptor on the session (once per session), creates a
 * promise keyed by a unique request ID, sends the request via session.notify,
 * and blocks until the client's response arrives or the timeout fires.
 * @param session current MCP session
 * @param method JSON-RPC method name
 * @param params request parameters
 * @returns the client's result payload from the JSON-RPC response
 */
async function sendServerRequest(
  session: Session,
  method: string,
  params: Record<string, JsonifibleValue>,
): Promise<unknown> {
  ensureResponseInterceptor(session);

  const requestId = `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const responsePromise = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingResponses.has(requestId)) {
        pendingResponses.delete(requestId);
        reject(new Error(`Server request timed out after ${SERVER_REQUEST_TIMEOUT}ms: ${method}`));
      }
    }, SERVER_REQUEST_TIMEOUT);

    pendingResponses.set(requestId, {
      resolve: (value: unknown) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (reason?: unknown) => {
        clearTimeout(timer);
        reject(reason);
      },
    });
  });

  await session.notify({
    id: requestId,
    method,
    params,
  });

  return responsePromise;
}

/**
 * handles prompt generation requests for the test server
 * @param params request parameters
 * @param params.name the prompt name to generate
 * @param params.arguments prompt-specific arguments
 * @returns generated prompt with messages
 * @throws {JsonRpcError} when the prompt name is not recognized
 */
const getPrompt: GetPrompt = async ({ name, arguments: args }) => {
  switch (name) {
    case 'simple-prompt': {
      return {
        description: 'A simple test message',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'This is a simple prompt message for testing purposes.',
            },
          },
        ],
      };
    }

    case 'greeting-prompt': {
      const personName = extractString(
        args,
        'name',
        'World',
      );

      return {
        description: `A greeting for ${personName}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Hello, ${personName}! Welcome to the test server.`,
            },
          },
        ],
      };
    }

    case 'styled-prompt': {
      const style = extractString(
        args,
        'style',
        'casual',
      );
      const format = extractString(
        args,
        'format',
        'short',
      );
      const isLongFormat = format === 'long';

      const messages: Record<string, string> = {
        formal: isLongFormat
          ? 'Good day. I trust this message finds you well. Please allow me to assist you with your inquiry.'
          : 'Good day. How may I assist you?',
        casual: isLongFormat
          ? 'Hey there! Hope you are doing great. Feel free to ask me anything you need help with.'
          : 'Hey! What can I help with?',
        friendly: isLongFormat
          ? 'Hi friend! It is wonderful to hear from you. I am here to help with whatever you need.'
          : 'Hi friend! How can I help?',
      };

      const messageText = messages[style] ?? messages.casual;

      return {
        description: `A ${style} message in ${format} format`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: messageText,
            },
          },
        ],
      };
    }

    case 'complex_prompt': {
      const temperature = extractString(
        args,
        'temperature',
        'mild',
      );
      const style = extractString(
        args,
        'style',
        'casual',
      );

      return {
        description: `A complex prompt with temperature ${temperature} and style ${style}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Generate a ${style} response with temperature setting: ${temperature}.`,
            },
          },
        ],
      };
    }

    default:
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: `Prompt not found: ${name}. Available prompts: ${TEST_PROMPTS.join(
          ', ',
        )}`,
      });
  }
};

/**
 * handles resource read requests for the test server
 * @param params request parameters
 * @param params.uri the resource URI to read
 * @param context request context
 * @param context.session the current session
 * @returns resource content with metadata
 * @throws {Error} when the resource URI is not recognized
 */
const readResource: ReadResource = async ({ uri }, { session }) => {
  // handle info resource
  if (uri === 'test://info') {
    return {
      contents: [
        {
          uri: 'test://info',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              name: TEST_SERVER_INFO.name,
              version: TEST_SERVER_INFO.version,
              description: 'A comprehensive test server for E2E testing',
              sessionId: session.id,
              tools: TEST_TOOLS,
              prompts: TEST_PROMPTS,
              resources: TEST_RESOURCES,
            },
            undefined,
            2,
          ),
        },
      ],
    };
  }

  // handle text resources
  const textMatch = /^test:\/\/text\/(\d+)$/.exec(uri);

  if (textMatch) {
    const id = textMatch[1];

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Text content for resource ${id}. This is dynamic text resource number ${id}.`,
        },
      ],
    };
  }

  // handle binary resources
  const binaryMatch = /^test:\/\/binary\/(\d+)$/.exec(uri);

  if (binaryMatch) {
    return {
      contents: [
        {
          uri,
          mimeType: 'image/png',
          blob: RED_PIXEL_PNG_BASE64,
        },
      ],
    };
  }

  // handle static resources (test://static/resource/{id})
  const staticMatch = /^test:\/\/static\/resource\/(\d+)$/.exec(uri);

  if (staticMatch) {
    const id = Number(staticMatch[1]);

    if (id % 2 === 1) {
      // odd-numbered resources return text content
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Resource ${id}: This is a plaintext resource`,
          },
        ],
      };
    }

    // even-numbered resources return blob content
    return {
      contents: [
        {
          uri,
          mimeType: 'application/octet-stream',
          blob: RED_PIXEL_PNG_BASE64,
        },
      ],
    };
  }

  throw new JsonRpcError({
    code: MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
    message: `Resource not found: ${uri}`,
  });
};

/**
 * handles resource subscription requests
 * @param params request parameters containing resource URI
 * @param params.uri resource URI to subscribe to
 * @param context request context containing session and abort signal
 * @param context.session current session context
 * @returns empty acknowledgement response
 */
const subscribe: Subscribe = async ({ uri }, { session }) => {
  session.subscribeResource(uri);

  return {};
};

/**
 * handles resource unsubscription requests
 * @param params request parameters containing resource URI
 * @param params.uri resource URI to unsubscribe from
 * @param context request context containing session and abort signal
 * @param context.session current session context
 * @returns empty acknowledgement response
 */
const unsubscribe: Unsubscribe = async ({ uri }, { session }) => {
  session.unsubscribeResource(uri);

  return {};
};

/**
 * handles argument completion requests for prompts and resource templates
 * @param params request parameters for completion
 * @param params.ref reference to prompt or resource template
 * @param params.argument argument information for completion
 * @returns completion results with suggested values
 */
const complete: Complete = async ({ ref, argument }) => {
  // handle prompt argument completions
  if (ref.type === 'ref/prompt') {
    if (ref.name === 'greeting-prompt' && argument.name === 'name') {
      const suggestions = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(argument.value.toLowerCase()),
      );

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }

    if (ref.name === 'styled-prompt') {
      if (argument.name === 'style') {
        const styles = ['formal', 'casual', 'friendly'];
        const filtered = styles.filter((s) =>
          s.toLowerCase().startsWith(argument.value.toLowerCase()),
        );

        return {
          completion: {
            values: filtered,
            total: filtered.length,
            hasMore: false,
          },
        };
      }

      if (argument.name === 'format') {
        const formats = ['short', 'long'];
        const filtered = formats.filter((f) =>
          f.toLowerCase().startsWith(argument.value.toLowerCase()),
        );

        return {
          completion: {
            values: filtered,
            total: filtered.length,
            hasMore: false,
          },
        };
      }
    }

    if (ref.name === 'complex_prompt' && argument.name === 'temperature') {
      const temperatures = ['high', 'hot', 'humid', 'low', 'mild', 'warm'];
      const filtered = temperatures.filter((t) =>
        t.toLowerCase().startsWith(argument.value.toLowerCase()),
      );

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }
  }

  // handle resource template URI completions
  if (ref.type === 'ref/resource') {
    if (ref.uri === 'test://text/{id}' && argument.name === 'id') {
      const ids = ['1', '2', '3'];
      const filtered = ids.filter((id) => id.startsWith(argument.value));

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }

    if (ref.uri === 'test://binary/{id}' && argument.name === 'id') {
      const ids = ['1', '2'];
      const filtered = ids.filter((id) => id.startsWith(argument.value));

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }
  }

  // default: no completions available
  return {
    completion: {
      values: [],
      total: 0,
      hasMore: false,
    },
  };
};

// TASK HANDLER IMPLEMENTATIONS //

/**
 * handles task status retrieval requests
 * @param params request parameters
 * @param params.taskId the task ID to look up
 * @returns task status information
 * @throws {JsonRpcError} when the task is not found
 */
const getTask: GetTask = async ({ taskId }) => {
  const entry = getStoredTask(taskId);

  if (!entry) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message: `Task not found: ${taskId}`,
    });
  }

  return {
    taskId: entry.taskId,
    status: entry.status,
    statusMessage: entry.statusMessage,
    createdAt: entry.createdAt,
    lastUpdatedAt: entry.lastUpdatedAt,
    ttl: entry.ttl,
    pollInterval: entry.pollInterval,
  };
};

/**
 * handles task result retrieval requests
 * @param params request parameters
 * @param params.taskId the task ID whose result to retrieve
 * @returns the task result payload
 * @throws {JsonRpcError} when the task is not found or has failed/been cancelled
 */
const getTaskResult: GetTaskResultPayload = async ({ taskId }) => {
  const initial = getStoredTask(taskId);

  if (!initial) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message: `Task not found: ${taskId}`,
    });
  }

  // block until the task reaches a terminal state (max 10 seconds)
  const entry = isTerminalStatus(initial.status)
    ? initial
    : await waitForTerminalState(taskId);

  if (entry.status === 'failed') {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INTERNAL_ERROR,
      message: `Task failed: ${entry.statusMessage}`,
    });
  }

  if (entry.status === 'cancelled') {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INTERNAL_ERROR,
      message: 'Task was cancelled',
    });
  }

  const result = (entry.result ?? {}) as Record<string, JsonifibleValue>;
  return {
    ...result,
    _meta: {
      ...((result._meta as Record<string, JsonifibleValue> | undefined) ?? {}),
      'io.modelcontextprotocol/related-task': { taskId },
    },
  } as Record<string, JsonifibleValue>;
};

/**
 * handles task listing requests
 * @param _params
 * @param root0
 * @param root0.session
 * @returns list of all tasks visible to the requesting session
 */
const listTasks: ListTasks = async (_params, { session }) => {
  const sessionTasks = Array.from(taskStore.values())
    .filter((entry) => entry.sessionId === session.id)
    .map((entry) => ({
      taskId: entry.taskId,
      status: entry.status,
      statusMessage: entry.statusMessage,
      createdAt: entry.createdAt,
      lastUpdatedAt: entry.lastUpdatedAt,
      ttl: entry.ttl,
      pollInterval: entry.pollInterval,
    }));

  return {
    tasks: sessionTasks,
  };
};

/**
 * handles task cancellation requests
 * @param params request parameters
 * @param params.taskId the task ID to cancel
 * @returns updated task status
 * @throws {JsonRpcError} when the task is not found or is in a terminal state
 */
const cancelTask: CancelTask = async ({ taskId }) => {
  const entry = getStoredTask(taskId);

  if (!entry) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message: `Task not found: ${taskId}`,
    });
  }

  if (
    entry.status === 'completed' ||
    entry.status === 'failed' ||
    entry.status === 'cancelled'
  ) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message: 'Cannot cancel task in terminal state',
    });
  }

  updateTask(taskId, 'cancelled', 'Task cancelled by client');

  return {
    taskId: entry.taskId,
    status: entry.status,
    statusMessage: entry.statusMessage,
    createdAt: entry.createdAt,
    lastUpdatedAt: entry.lastUpdatedAt,
    ttl: entry.ttl,
    pollInterval: entry.pollInterval,
  };
};

// PAGINATED LIST HANDLERS //

/**
 * decodes an opaque base64 cursor to a numeric start index
 * @param cursor base64-encoded cursor string or undefined
 * @returns the decoded start index, or 0 if no cursor provided
 */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  const decoded = Number(atob(cursor));

  return Number.isFinite(decoded) && decoded >= 0 ? decoded : 0;
}

/**
 * encodes a numeric index as an opaque base64 cursor
 * @param index the start index for the next page
 * @returns base64-encoded cursor string
 */
function encodeCursor(index: number): string {
  return btoa(String(index));
}

/**
 * handles paginated tool listing with PAGE_SIZE items per page
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns paginated list of tools with optional nextCursor
 */
const listTools: ListTools = async (params, { session }) => {
  const allTools = session.tools;
  const startIndex = decodeCursor(params?.cursor);
  const page = allTools.slice(startIndex, startIndex + PAGE_SIZE);
  const nextIndex = startIndex + PAGE_SIZE;

  return {
    tools: page,
    ...(nextIndex < allTools.length ? { nextCursor: encodeCursor(nextIndex) } : {}),
  };
};

/**
 * handles paginated resource listing with PAGE_SIZE items per page
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns paginated list of resources with optional nextCursor
 */
const listResources: ListResources = async (params, { session }) => {
  const allResources = session.resources;
  const startIndex = decodeCursor(params?.cursor);
  const page = allResources.slice(startIndex, startIndex + PAGE_SIZE);
  const nextIndex = startIndex + PAGE_SIZE;

  return {
    resources: page,
    ...(nextIndex < allResources.length ? { nextCursor: encodeCursor(nextIndex) } : {}),
  };
};

/** page size for prompt listing — sized to fit all test prompts on a single page */
const PROMPT_PAGE_SIZE = TEST_PROMPTS.length;

/**
 * handles paginated prompt listing with PROMPT_PAGE_SIZE items per page
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns paginated list of prompts with optional nextCursor
 */
const listPrompts: ListPrompts = async (params, { session }) => {
  const allPrompts = session.prompts;
  const startIndex = decodeCursor(params?.cursor);
  const page = allPrompts.slice(startIndex, startIndex + PROMPT_PAGE_SIZE);
  const nextIndex = startIndex + PROMPT_PAGE_SIZE;

  return {
    prompts: page,
    ...(nextIndex < allPrompts.length ? { nextCursor: encodeCursor(nextIndex) } : {}),
  };
};

// FACTORY FUNCTION //

/**
 * creates a comprehensive MCP server instance for E2E testing
 * @param log optional logger for server operations
 * @returns configured MCP server with tools, prompts, resources, and handlers
 */
export function createTestMcpServer(log?: Log): McpServer {
  return new McpServer({
    serverInfo: TEST_SERVER_INFO,
    log,
    instructions:
      'This is a comprehensive test server for E2E testing. It provides tools for basic operations, prompts for message generation, and resources for data retrieval.',
    tools,
    prompts,
    resources,
    resourceTemplates,
    handlers: {
      callTool,
      getPrompt,
      readResource,
      subscribe,
      unsubscribe,
      complete,
      listTools,
      listResources,
      listPrompts,
      getTask,
      getTaskResult,
      listTasks,
      cancelTask,
    },
  });
}
