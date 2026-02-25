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
  InitializedNotification,
  LoggingMessageNotification,
  ProgressNotification,
  PromptListChangedNotification,
  ResourceListChangedNotification,
  ResourceUpdatedNotification,
  RootsListChangedNotification,
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

  return {
    requests: createRequestValidators(ajv, negotiated),
    results: createResultValidators(ajv, negotiated),
    notifications: createNotificationValidators(ajv, negotiated),
  };
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
  };
}
