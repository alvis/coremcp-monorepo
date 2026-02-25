import type { ProgressToken, RequestId, JsonSchema } from '#primitives';
import type { JsonifibleObject, JsonifibleValue } from '#json';

/** any valid JSON-RPC object that can be decoded off the wire, or encoded to be sent */
export type JsonRpcMessage =
  | JsonRpcRequestEnvelope
  | JsonRpcNotificationEnvelope
  | JsonRpcResponseEnvelope
  | JsonRpcErrorEnvelope;

/** latest protocol version supported by this implementation */
export const LATEST_PROTOCOL_VERSION = '2025-06-18';

/** JSON-RPC version identifier */
export const JSONRPC_VERSION = '2.0';

/** JSON-RPC request data with optional meta fields */
export type JsonRpcRequestData = {
  /**
   * see [specification/2025-06-18/basic/index#general-fields] for notes on _meta usage.
   */
  _meta?: {
    /**
     * if specified, the caller is requesting out-of-band progress notifications for this request (as represented by notifications/progress). The value of this parameter is an opaque token that will be attached to any subsequent notifications. The receiver is not obligated to provide these notifications.
     */
    progressToken?: ProgressToken;
  };
  [key: string]: JsonifibleValue;
};

/** JSON-RPC notification data with optional meta fields */
export type JsonRpcNotificationData<P = {}> = P & {
  /**
   * see [specification/2025-06-18/basic/index#general-fields] for notes on _meta usage.
   */
  _meta?: JsonifibleObject;
  [key: string]: JsonifibleValue;
};

/** JSON-RPC result data with optional meta fields */
export type JsonRpcResultData = {
  /**
   * see [specification/2025-06-18/basic/index#general-fields] for notes on _meta usage.
   */
  _meta?: JsonifibleObject;
  [key: string]: JsonifibleValue;
};

/** base interface for all JSON-RPC messages */
export interface JsonRpcEnvelope extends JsonifibleObject {
  jsonrpc: typeof JSONRPC_VERSION;
}

/** a request that expects a response */
export interface JsonRpcRequestEnvelope<
  R extends { method: string; params?: JsonRpcRequestData } = {
    method: string;
    params?: JsonRpcRequestData;
  },
> extends JsonRpcEnvelope {
  id: RequestId;
  method: R['method'];
  params: R['params'];
  result?: never;
  error?: never;
}

/** a notification which does not expect a response */
export interface JsonRpcNotificationEnvelope<
  N extends {
    method: `notifications/${string}`;
    params?: JsonRpcNotificationData;
  } = { method: `notifications/${string}`; params?: {} },
> extends JsonRpcEnvelope {
  id?: never;
  method: N['method'];
  params?: N['params'];
  result?: never;
  error?: never;
}

/** a successful (non-error) response to a request */
export interface JsonRpcResponseEnvelope<
  T extends JsonRpcResultData = JsonRpcResultData,
> extends JsonRpcEnvelope {
  id: RequestId;
  method?: never;
  params?: never;
  error?: never;
  result: T;
}

/** a response to a request that indicates an error occurred */
export interface JsonRpcErrorEnvelope extends JsonRpcEnvelope {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: RequestId;
  method?: never;
  params?: never;
  error: JsonRpcErrorData;
  result?: never;
}

/** error data structure for JSON-RPC error responses */
export interface JsonRpcErrorData extends JsonifibleObject {
  /**
   * the error type that occurred.
   */
  code: number;
  /**
   * a short description of the error. The message SHOULD be limited to a concise single sentence.
   */
  message: string;
  /**
   * additional information about the error. The value of this member is defined by the sender (e.g. detailed error information, nested errors etc.).
   */
  data?: JsonifibleValue;
}

/** JSON-RPC error class for structured error handling */
export class JsonRpcError extends Error {
  /**
   * the error type that occurred.
   */
  public readonly code: number;
  /**
   * additional information about the error. The value of this member is defined by the sender (e.g. detailed error information, nested errors etc.).
   */
  public readonly data?: JsonifibleValue;

  /**
   * creates a new JSON-RPC error with the specified code, message, and optional data
   * @param error error data containing code, message, and optional data
   */
  constructor(error: JsonRpcErrorData) {
    const { message, code, data } = error;

    super(message);

    this.code = code;
    this.data = data;
  }
}

/** JSON-RPC request message schema for validation */
export const jsonRpcRequestMessageSchema = {
  type: 'object',
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    method: { type: 'string' },
    params: { type: 'object', required: [] },
  },
  required: ['jsonrpc', 'id', 'method'],
  additionalProperties: false,
} as const satisfies JsonSchema;

/** JSON-RPC response message schema for validation */
export const jsonRpcResponseMessageSchema = {
  type: 'object',
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    result: { type: 'object', required: [] },
  },
  required: ['jsonrpc', 'id', 'result'],
  additionalProperties: false,
} as const satisfies JsonSchema;

/** JSON-RPC notification message schema for validation */
export const jsonRpcNotificationMessageSchema = {
  type: 'object',
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    method: { type: 'string', pattern: '^notifications/' },
    params: { type: 'object', required: [] },
  },
  required: ['jsonrpc', 'method'],
  additionalProperties: false,
} as const satisfies JsonSchema;

/** JSON-RPC error message schema for validation */
export const jsonRpcErrorMessageSchema = {
  type: 'object',
  properties: {
    jsonrpc: { type: 'string', const: '2.0' },
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    error: {
      type: 'object',
      properties: { code: { type: 'number' }, message: { type: 'string' } },
      required: ['code', 'message'],
    },
  },
  required: ['jsonrpc', 'error'],
  additionalProperties: false,
} as const satisfies JsonSchema;
