import { Ajv } from 'ajv';

import { SUPPORTED_PROTOCOL_VERSIONS } from '#constants';

import {
  jsonRpcErrorMessageSchema,
  jsonRpcNotificationMessageSchema,
  jsonRpcRequestMessageSchema,
  jsonRpcResponseMessageSchema,
} from '#jsonrpc';
import { negotiateProtocolVersion } from '#negotiate-version';

import type { CompleteRequest, CompleteResult } from '#completions';
import type { InitializeRequest, InitializeResult, PingRequest } from '#core';
import type { ElicitRequest, ElicitResult } from '#elicitation';
import type {
  JsonRpcMessage,
  JsonRpcNotificationData,
  JsonRpcRequestData,
  JsonRpcResultData,
} from '#jsonrpc';
import type { SetLevelRequest } from '#logging';
import type {
  CancelledNotification,
  ElicitationCompleteNotification,
  InitializedNotification,
  LoggingMessageNotification,
  ProgressNotification,
  PromptListChangedNotification,
  ResourceListChangedNotification,
  ResourceUpdatedNotification,
  RootsListChangedNotification,
  TaskStatusNotification,
  ToolListChangedNotification,
} from '#notifications';
import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsRequest,
  ListPromptsResult,
} from '#prompts';
import type {
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequest,
  ReadResourceResult,
  SubscribeRequest,
  UnsubscribeRequest,
} from '#resources';
import type { ListRootsRequest, ListRootsResult } from '#roots';
import type { CreateMessageRequest, CreateMessageResult } from '#sampling';
import type {
  CancelTaskRequest,
  CancelTaskResult,
  GetTaskPayloadRequest,
  GetTaskPayloadResult,
  GetTaskRequest,
  GetTaskResult,
  ListTasksRequest,
  ListTasksResult,
} from '#tasks';
import type {
  CallToolRequest,
  CallToolResult,
  ListToolsRequest,
  ListToolsResult,
} from '#tools';

/** type definition for message validation functions */
export type MessageValidator<M> = (message: JsonRpcMessage) => M;

/* eslint-disable @typescript-eslint/naming-convention */
/** validation functions for all mcp request types */
interface RequestValidator {
  'tools/call': MessageValidator<CallToolRequest>;
  'completion/complete': MessageValidator<CompleteRequest>;
  'sampling/createMessage': MessageValidator<CreateMessageRequest>;
  'elicitation/create': MessageValidator<ElicitRequest>;
  'prompts/get': MessageValidator<GetPromptRequest>;
  'initialize': MessageValidator<InitializeRequest>;
  'prompts/list': MessageValidator<ListPromptsRequest>;
  'resources/templates/list': MessageValidator<ListResourceTemplatesRequest>;
  'resources/list': MessageValidator<ListResourcesRequest>;
  'roots/list': MessageValidator<ListRootsRequest>;
  'tools/list': MessageValidator<ListToolsRequest>;
  'ping': MessageValidator<PingRequest>;
  'resources/read': MessageValidator<ReadResourceRequest>;
  'logging/setLevel': MessageValidator<SetLevelRequest>;
  'resources/subscribe': MessageValidator<SubscribeRequest>;
  'resources/unsubscribe': MessageValidator<UnsubscribeRequest>;
  'tasks/get': MessageValidator<GetTaskRequest>;
  'tasks/result': MessageValidator<GetTaskPayloadRequest>;
  'tasks/list': MessageValidator<ListTasksRequest>;
  'tasks/cancel': MessageValidator<CancelTaskRequest>;
  [method: string]: MessageValidator<JsonRpcRequestData> | undefined;
}

/** validation functions for all mcp result types */
interface ResultValidator {
  'tools/call': MessageValidator<CallToolResult>;
  'completion/complete': MessageValidator<CompleteResult>;
  'sampling/createMessage': MessageValidator<CreateMessageResult>;
  'elicitation/create': MessageValidator<ElicitResult>;
  'prompts/get': MessageValidator<GetPromptResult>;
  'initialize': MessageValidator<InitializeResult>;
  'prompts/list': MessageValidator<ListPromptsResult>;
  'resources/templates/list': MessageValidator<ListResourceTemplatesResult>;
  'resources/list': MessageValidator<ListResourcesResult>;
  'roots/list': MessageValidator<ListRootsResult>;
  'tools/list': MessageValidator<ListToolsResult>;
  'resources/read': MessageValidator<ReadResourceResult>;
  'tasks/get': MessageValidator<GetTaskResult>;
  'tasks/result': MessageValidator<GetTaskPayloadResult>;
  'tasks/list': MessageValidator<ListTasksResult>;
  'tasks/cancel': MessageValidator<CancelTaskResult>;
  [method: string]: MessageValidator<JsonRpcResultData> | undefined;
}

/** validation functions for all mcp notification types */
interface NotificationValidator {
  'notifications/cancelled': MessageValidator<CancelledNotification>;
  'notifications/initialized': MessageValidator<InitializedNotification>;
  'notifications/message': MessageValidator<LoggingMessageNotification>;
  'notifications/progress': MessageValidator<ProgressNotification>;
  'notifications/prompts/list_changed': MessageValidator<PromptListChangedNotification>;
  'notifications/resources/list_changed': MessageValidator<ResourceListChangedNotification>;
  'notifications/resources/updated': MessageValidator<ResourceUpdatedNotification>;
  'notifications/roots/list_changed': MessageValidator<RootsListChangedNotification>;
  'notifications/tools/list_changed': MessageValidator<ToolListChangedNotification>;
  'notifications/elicitation/complete': MessageValidator<ElicitationCompleteNotification>;
  'notifications/tasks/status': MessageValidator<TaskStatusNotification>;

  [method: string]:
    | MessageValidator<{
        method: string;
        params?: JsonRpcNotificationData;
      }>
    | undefined;
}

/* eslint-enable @typescript-eslint/naming-convention */

/** combined interface containing all message validation functions */
export interface VersionedValidator {
  requests: RequestValidator;
  results: ResultValidator;
  notifications: NotificationValidator;
}

const validateJsonRpcMessageWithoutErrorThrown = new Ajv({
  strict: false,
}).compile<JsonRpcMessage>({
  anyOf: [
    jsonRpcRequestMessageSchema,
    jsonRpcResponseMessageSchema,
    jsonRpcNotificationMessageSchema,
    jsonRpcErrorMessageSchema,
  ],
});

/**
 * creates a message validation function for a specific message type
 * @param ajv AJV instance with loaded schema
 * @param version protocol version for error messages
 * @param name JSON schema definition name
 * @returns validation function that validates and narrows message type
 */
export function createMessageValidator<M>(
  ajv: Ajv,
  version: string,
  name: string,
): MessageValidator<M> {
  return (message: JsonRpcMessage): M => {
    const verify = ajv.getSchema(`#/definitions/${name}`);

    if (!verify) {
      throw new Error(`Message type ${name} isn't supported in v${version}`);
    }

    // For result validators, validate just the result content
    // for other validators, validate the entire message
    const result = verify(name.endsWith('Result') ? message.result : message);

    if (!result) {
      const validationMessage = ajv.errorsText(verify.errors);

      throw new Error(`Validation error for ${name}: ${validationMessage}`);
    } else {
      return message as M;
    }
  };
}

/**
 * retrieves version-specific JSON schema validators
 * @param version MCP protocol version
 * @returns promise resolving to validation functions for the specified version
 */
export async function getVersionedValidators(
  version: string,
): Promise<VersionedValidator> {
  const negotiated = negotiateProtocolVersion(
    version,
    SUPPORTED_PROTOCOL_VERSIONS,
  );

  const ajv = new Ajv({
    schemas: [await import(`./schemas/${negotiated}/schema.json`)],
    strict: false, // Allow unknown formats like uri-template, byte, etc.
    allowUnionTypes: true, // Allow union types in JSON schema
  });

  const validators = {
    requests: createRequestValidators(ajv, negotiated),
    results: createResultValidators(ajv, negotiated),
    notifications: createNotificationValidators(ajv, negotiated),
  };

  return negotiated === '2025-11-25'
    ? {
        requests: {
          ...validators.requests,
          'initialize': validateInitializeRequest20251125,
          'tools/call': validateCallToolRequest20251125,
          'sampling/createMessage': validateCreateMessageRequest20251125,
          'elicitation/create': validateElicitRequest20251125,
          'tasks/get': validateGetTaskRequest20251125,
          'tasks/result': validateGetTaskPayloadRequest20251125,
          'tasks/list': validateListTasksRequest20251125,
          'tasks/cancel': validateCancelTaskRequest20251125,
        },
        results: {
          ...validators.results,
          'initialize': validateInitializeResult20251125,
          'sampling/createMessage': validateCreateMessageResult20251125,
          'elicitation/create': validateElicitResult20251125,
          'tasks/get': validateGetTaskResult20251125,
          'tasks/result': validateGetTaskPayloadResult20251125,
          'tasks/list': validateListTasksResult20251125,
          'tasks/cancel': validateCancelTaskResult20251125,
        },
        notifications: {
          ...validators.notifications,
          'notifications/elicitation/complete':
            validateElicitationCompleteNotification20251125,
          'notifications/tasks/status': validateTaskStatusNotification20251125,
        },
      }
    : validators;
}

/**
 * validates JSON-RPC message structure and returns typed envelope
 * @param message the message to validate
 * @returns validated JSON-RPC message
 */
export function validateJsonRpcMessage(message: unknown): JsonRpcMessage {
  if (!validateJsonRpcMessageWithoutErrorThrown(message)) {
    throw new Error(
      `Invalid JSON-RPC message: ${new Ajv().errorsText(validateJsonRpcMessageWithoutErrorThrown.errors)}`,
    );
  }

  return message;
}

/**
 * creates request validation functions
 * @param ajv AJV instance with loaded schema
 * @param version protocol version for error messages
 * @returns request validation functions
 */
function createRequestValidators(ajv: Ajv, version: string): RequestValidator {
  const createValidator = <M>(name: string): MessageValidator<M> =>
    createMessageValidator<M>(ajv, version, name);

  return {
    'tools/call': createValidator<CallToolRequest>('CallToolRequest'),
    'completion/complete': createValidator<CompleteRequest>('CompleteRequest'),
    'sampling/createMessage': createValidator<CreateMessageRequest>(
      'CreateMessageRequest',
    ),
    'elicitation/create': createValidator<ElicitRequest>('ElicitRequest'),
    'prompts/get': createValidator<GetPromptRequest>('GetPromptRequest'),
    'initialize': createValidator<InitializeRequest>('InitializeRequest'),
    'prompts/list': createValidator<ListPromptsRequest>('ListPromptsRequest'),
    'resources/templates/list': createValidator<ListResourceTemplatesRequest>(
      'ListResourceTemplatesRequest',
    ),
    'resources/list': createValidator<ListResourcesRequest>(
      'ListResourcesRequest',
    ),
    'roots/list': createValidator<ListRootsRequest>('ListRootsRequest'),
    'tools/list': createValidator<ListToolsRequest>('ListToolsRequest'),
    'ping': createValidator<PingRequest>('PingRequest'),
    'resources/read': createValidator<ReadResourceRequest>(
      'ReadResourceRequest',
    ),
    'logging/setLevel': createValidator<SetLevelRequest>('SetLevelRequest'),
    'resources/subscribe':
      createValidator<SubscribeRequest>('SubscribeRequest'),
    'resources/unsubscribe':
      createValidator<UnsubscribeRequest>('UnsubscribeRequest'),
    'tasks/get': createUnsupportedRequestValidator<GetTaskRequest>(
      version,
      'tasks/get',
    ),
    'tasks/result': createUnsupportedRequestValidator<GetTaskPayloadRequest>(
      version,
      'tasks/result',
    ),
    'tasks/list': createUnsupportedRequestValidator<ListTasksRequest>(
      version,
      'tasks/list',
    ),
    'tasks/cancel': createUnsupportedRequestValidator<CancelTaskRequest>(
      version,
      'tasks/cancel',
    ),
  };
}

/**
 * creates result validation functions
 * @param ajv AJV instance with loaded schema
 * @param version protocol version for error messages
 * @returns result validation functions
 */
function createResultValidators(ajv: Ajv, version: string): ResultValidator {
  const createValidator = <M>(name: string): MessageValidator<M> =>
    createMessageValidator<M>(ajv, version, name);

  return {
    'tools/call': createValidator<CallToolResult>('CallToolResult'),
    'completion/complete': createValidator<CompleteResult>('CompleteResult'),
    'sampling/createMessage': createValidator<CreateMessageResult>(
      'CreateMessageResult',
    ),
    'elicitation/create': createValidator<ElicitResult>('ElicitResult'),
    'prompts/get': createValidator<GetPromptResult>('GetPromptResult'),
    'initialize': createValidator<InitializeResult>('InitializeResult'),
    'prompts/list': createValidator<ListPromptsResult>('ListPromptsResult'),
    'resources/templates/list': createValidator<ListResourceTemplatesResult>(
      'ListResourceTemplatesResult',
    ),
    'resources/list': createValidator<ListResourcesResult>(
      'ListResourcesResult',
    ),
    'roots/list': createValidator<ListRootsResult>('ListRootsResult'),
    'tools/list': createValidator<ListToolsResult>('ListToolsResult'),
    'resources/read': createValidator<ReadResourceResult>('ReadResourceResult'),
    'tasks/get': createUnsupportedResultValidator<GetTaskResult>(
      version,
      'tasks/get',
    ),
    'tasks/result': createUnsupportedResultValidator<GetTaskPayloadResult>(
      version,
      'tasks/result',
    ),
    'tasks/list': createUnsupportedResultValidator<ListTasksResult>(
      version,
      'tasks/list',
    ),
    'tasks/cancel': createUnsupportedResultValidator<CancelTaskResult>(
      version,
      'tasks/cancel',
    ),
  };
}

/**
 * creates notification validation functions
 * @param ajv AJV instance with loaded schema
 * @param version protocol version for error messages
 * @returns notification validation functions
 */
function createNotificationValidators(
  ajv: Ajv,
  version: string,
): NotificationValidator {
  const createValidator = <M>(name: string): MessageValidator<M> =>
    createMessageValidator<M>(ajv, version, name);

  return {
    'notifications/cancelled': createValidator<CancelledNotification>(
      'CancelledNotification',
    ),
    'notifications/initialized': createValidator<InitializedNotification>(
      'InitializedNotification',
    ),
    'notifications/message': createValidator<LoggingMessageNotification>(
      'LoggingMessageNotification',
    ),
    'notifications/progress': createValidator<ProgressNotification>(
      'ProgressNotification',
    ),
    'notifications/prompts/list_changed':
      createValidator<PromptListChangedNotification>(
        'PromptListChangedNotification',
      ),
    'notifications/resources/list_changed':
      createValidator<ResourceListChangedNotification>(
        'ResourceListChangedNotification',
      ),
    'notifications/resources/updated':
      createValidator<ResourceUpdatedNotification>(
        'ResourceUpdatedNotification',
      ),
    'notifications/roots/list_changed':
      createValidator<RootsListChangedNotification>(
        'RootsListChangedNotification',
      ),
    'notifications/tools/list_changed':
      createValidator<ToolListChangedNotification>(
        'ToolListChangedNotification',
      ),
    'notifications/elicitation/complete':
      createUnsupportedNotificationValidator<ElicitationCompleteNotification>(
        version,
        'notifications/elicitation/complete',
      ),
    'notifications/tasks/status':
      createUnsupportedNotificationValidator<TaskStatusNotification>(
        version,
        'notifications/tasks/status',
      ),
  };
}

function createUnsupportedRequestValidator<M>(
  version: string,
  method: string,
): MessageValidator<M> {
  return () => {
    throw new Error(`Message type ${method} isn't supported in v${version}`);
  };
}

function createUnsupportedResultValidator<M>(
  version: string,
  method: string,
): MessageValidator<M> {
  return () => {
    throw new Error(`Message type ${method} isn't supported in v${version}`);
  };
}

function createUnsupportedNotificationValidator<M>(
  version: string,
  method: string,
): MessageValidator<M> {
  return () => {
    throw new Error(`Message type ${method} isn't supported in v${version}`);
  };
}

function assertObject(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Validation error for ${name}: must be an object`);
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Validation error for ${name}: must be a string`);
  }
}

function assertNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number') {
    throw new Error(`Validation error for ${name}: must be a number`);
  }
}

function assertTaskShape(task: unknown, name: string): void {
  assertObject(task, name);
  assertString(task.taskId, `${name}.taskId`);
  assertString(task.status, `${name}.status`);
  assertString(task.createdAt, `${name}.createdAt`);
  assertString(task.lastUpdatedAt, `${name}.lastUpdatedAt`);

  if (task.ttl !== null && typeof task.ttl !== 'number') {
    throw new Error(`Validation error for ${name}.ttl: must be a number|null`);
  }
}

/** wraps a validation callback in a MessageValidator that casts via unconstrained generic after validation passes */
function createAssertionValidator<M>(
  validate: (message: JsonRpcMessage) => void,
): MessageValidator<M> {
  return (message: JsonRpcMessage): M => {
    validate(message);

    return message as M;
  };
}

const validateInitializeRequest20251125 =
  createAssertionValidator<InitializeRequest>((message) => {
    assertObject(message, 'InitializeRequest');
    if (message.method !== 'initialize') {
      throw new Error('Validation error for InitializeRequest: wrong method');
    }
    assertObject(message.params, 'InitializeRequest.params');
    assertString(
      message.params.protocolVersion,
      'InitializeRequest.params.protocolVersion',
    );
    assertObject(
      message.params.clientInfo,
      'InitializeRequest.params.clientInfo',
    );
    assertString(
      message.params.clientInfo.name,
      'InitializeRequest.params.clientInfo.name',
    );
    assertString(
      message.params.clientInfo.version,
      'InitializeRequest.params.clientInfo.version',
    );
  });

const validateInitializeResult20251125 =
  createAssertionValidator<InitializeResult>((message) => {
    assertObject(message.result, 'InitializeResult');
    assertString(
      message.result.protocolVersion,
      'InitializeResult.protocolVersion',
    );
    assertObject(message.result.serverInfo, 'InitializeResult.serverInfo');
    assertString(
      message.result.serverInfo.name,
      'InitializeResult.serverInfo.name',
    );
    assertString(
      message.result.serverInfo.version,
      'InitializeResult.serverInfo.version',
    );
  });

const validateCallToolRequest20251125 =
  createAssertionValidator<CallToolRequest>((message) => {
    assertObject(message, 'CallToolRequest');
    if (message.method !== 'tools/call') {
      throw new Error('Validation error for CallToolRequest: wrong method');
    }
    assertObject(message.params, 'CallToolRequest.params');
    assertString(message.params.name, 'CallToolRequest.params.name');
  });

const validateCreateMessageRequest20251125 =
  createAssertionValidator<CreateMessageRequest>((message) => {
    assertObject(message, 'CreateMessageRequest');
    if (message.method !== 'sampling/createMessage') {
      throw new Error(
        'Validation error for CreateMessageRequest: wrong method',
      );
    }
    assertObject(message.params, 'CreateMessageRequest.params');
    if (!Array.isArray(message.params.messages)) {
      throw new Error(
        'Validation error for CreateMessageRequest.params.messages: must be an array',
      );
    }
    assertNumber(
      message.params.maxTokens,
      'CreateMessageRequest.params.maxTokens',
    );
  });

const validateCreateMessageResult20251125 =
  createAssertionValidator<CreateMessageResult>((message) => {
    assertObject(message.result, 'CreateMessageResult');
    assertString(message.result.model, 'CreateMessageResult.model');
    assertString(message.result.role, 'CreateMessageResult.role');

    if (!('content' in message.result)) {
      throw new Error(
        'Validation error for CreateMessageResult.content: missing',
      );
    }
  });

const validateElicitRequest20251125 = createAssertionValidator<ElicitRequest>(
  (message) => {
    assertObject(message, 'ElicitRequest');
    if (message.method !== 'elicitation/create') {
      throw new Error('Validation error for ElicitRequest: wrong method');
    }
    assertObject(message.params, 'ElicitRequest.params');
    assertString(message.params.message, 'ElicitRequest.params.message');

    if (message.params.mode === 'url') {
      assertString(
        message.params.elicitationId,
        'ElicitRequest.params.elicitationId',
      );
      assertString(message.params.url, 'ElicitRequest.params.url');
    } else {
      assertObject(
        message.params.requestedSchema,
        'ElicitRequest.params.requestedSchema',
      );
    }
  },
);

const validateElicitResult20251125 = createAssertionValidator<ElicitResult>(
  (message) => {
    assertObject(message.result, 'ElicitResult');
    assertString(message.result.action, 'ElicitResult.action');
  },
);

const validateGetTaskRequest20251125 = createAssertionValidator<GetTaskRequest>(
  (message) => {
    assertObject(message, 'GetTaskRequest');
    if (message.method !== 'tasks/get') {
      throw new Error('Validation error for GetTaskRequest: wrong method');
    }
    assertObject(message.params, 'GetTaskRequest.params');
    assertString(message.params.taskId, 'GetTaskRequest.params.taskId');
  },
);

const validateGetTaskResult20251125 = createAssertionValidator<GetTaskResult>(
  (message) => {
    assertTaskShape(message.result, 'GetTaskResult');
  },
);

const validateGetTaskPayloadRequest20251125 =
  createAssertionValidator<GetTaskPayloadRequest>((message) => {
    assertObject(message, 'GetTaskPayloadRequest');
    if (message.method !== 'tasks/result') {
      throw new Error(
        'Validation error for GetTaskPayloadRequest: wrong method',
      );
    }
    assertObject(message.params, 'GetTaskPayloadRequest.params');
    assertString(message.params.taskId, 'GetTaskPayloadRequest.params.taskId');
  });

const validateGetTaskPayloadResult20251125 =
  createAssertionValidator<GetTaskPayloadResult>((message) => {
    assertObject(message.result, 'GetTaskPayloadResult');
  });

const validateListTasksRequest20251125 =
  createAssertionValidator<ListTasksRequest>((message) => {
    assertObject(message, 'ListTasksRequest');
    if (message.method !== 'tasks/list') {
      throw new Error('Validation error for ListTasksRequest: wrong method');
    }
    if (message.params !== undefined) {
      assertObject(message.params, 'ListTasksRequest.params');
    }
  });

const validateListTasksResult20251125 =
  createAssertionValidator<ListTasksResult>((message) => {
    assertObject(message.result, 'ListTasksResult');
    if (!Array.isArray(message.result.tasks)) {
      throw new Error(
        'Validation error for ListTasksResult.tasks: must be an array',
      );
    }
  });

const validateCancelTaskRequest20251125 =
  createAssertionValidator<CancelTaskRequest>((message) => {
    assertObject(message, 'CancelTaskRequest');
    if (message.method !== 'tasks/cancel') {
      throw new Error('Validation error for CancelTaskRequest: wrong method');
    }
    assertObject(message.params, 'CancelTaskRequest.params');
    assertString(message.params.taskId, 'CancelTaskRequest.params.taskId');
  });

const validateCancelTaskResult20251125 =
  createAssertionValidator<CancelTaskResult>((message) => {
    assertTaskShape(message.result, 'CancelTaskResult');
  });

const validateElicitationCompleteNotification20251125 =
  createAssertionValidator<ElicitationCompleteNotification>((message) => {
    assertObject(message, 'ElicitationCompleteNotification');
    if (message.method !== 'notifications/elicitation/complete') {
      throw new Error(
        'Validation error for ElicitationCompleteNotification: wrong method',
      );
    }
    assertObject(message.params, 'ElicitationCompleteNotification.params');
    assertString(
      message.params.elicitationId,
      'ElicitationCompleteNotification.params.elicitationId',
    );
  });

const validateTaskStatusNotification20251125 =
  createAssertionValidator<TaskStatusNotification>((message) => {
    assertObject(message, 'TaskStatusNotification');
    if (message.method !== 'notifications/tasks/status') {
      throw new Error(
        'Validation error for TaskStatusNotification: wrong method',
      );
    }
    assertTaskShape(message.params, 'TaskStatusNotification.params');
  });
