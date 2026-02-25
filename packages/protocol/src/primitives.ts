import type { JSONSchemaType } from 'ajv';

import type { JsonifibleObject, JsonPrimitive, JsonValue } from '#json';

/** schema type definition for json values */
export type JsonSchema = JSONSchemaType<JsonValue>;

/**
 * common types and primitives shared across mcp methods
 * based on mcp specification 2025-06-18
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic
 */

/** unique identifier for json-rpc requests and responses _(since 2024-11-05)_ */
export type RequestId = string | number;
/** opaque token that associates progress notifications with their originating request _(since 2024-11-05)_ */
export type ProgressToken = string | number;
/** opaque pagination token for continuing paginated requests _(since 2024-11-05)_ */
export type Cursor = string;
/** participant role in conversations and message exchanges _(since 2024-11-05)_ */
export type Role = 'user' | 'assistant';
/** severity levels for log messages following rfc 5424 syslog standards _(since 2024-11-05)_ */
export type McpLogLevel =
  | 'emergency'
  | 'alert'
  | 'critical'
  | 'error'
  | 'warning'
  | 'notice'
  | 'info'
  | 'debug';

/** information about an mcp implementation (client or server) _(since 2024-11-05)_ */
export type Implementation = {
  /** programmatic identifier for the implementation */
  name: string;
  /** version string of the implementation */
  version: string;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
};

/** metadata hints for clients about how to handle content and data _(since 2024-11-05)_ */
export type Annotations = {
  /** intended recipients of this content (user, assistant, or both) */
  audience?: Role[];
  /** iso 8601 timestamp when the content was last modified _(since 2025-06-18)_ */
  lastModified?: string;
  /** importance level from 0 (least) to 1 (most important) */
  priority?: number;
};

/** features and functionality supported by an mcp client _(since 2024-11-05)_ */
export type ClientCapabilities = {
  /** support for requesting additional user input _(since 2025-06-18)_ */
  elicitation?: Record<string, never>;
  /** filesystem root access capabilities */
  roots?: {
    /** whether client supports notifications when roots list changes */
    listChanged?: boolean;
  };
  /** support for llm sampling and message generation requests */
  sampling?: Record<string, never>;
};

/** features and functionality provided by an mcp server _(since 2024-11-05)_ */
export type ServerCapabilities = {
  /** support for argument autocompletion suggestions _(since 2025-03-26)_ */
  completions?: JsonifibleObject;
  /** non-standard capabilities specific to this server implementation */
  experimental?: Record<string, JsonifibleObject>;
  /** support for sending log messages to the client */
  logging?: JsonifibleObject;
  /** prompt template capabilities */
  prompts?: {
    /** whether server sends notifications when prompt list changes */
    listChanged?: boolean;
  };
  /** resource access capabilities */
  resources?: {
    /** whether server sends notifications when resource list changes */
    listChanged?: boolean;
    /** whether server supports resource update subscriptions */
    subscribe?: boolean;
  };
  /** tool execution capabilities */
  tools?: {
    /** whether server sends notifications when tool list changes */
    listChanged?: boolean;
  };
};

/** schema definition for primitive value types without nesting _(since 2025-06-18)_ */
export type PrimitiveSchemaDefinition = {
  /** default value when no value is provided */
  default?: JsonPrimitive;
  /** human-readable description of this field */
  description?: string;
  /** allowed string values for enumeration types */
  enum?: string[];
  /** human-readable names corresponding to enum values */
  enumNames?: string[];
  /** specific format constraint for string types */
  format?: 'date' | 'date-time' | 'email' | 'uri';
  /** maximum allowed length for string types */
  maxLength?: number;
  /** maximum allowed value for numeric types */
  maximum?: number;
  /** minimum required length for string types */
  minLength?: number;
  /** minimum allowed value for numeric types */
  minimum?: number;
  /** human-readable display name */
  title?: string;
  /** primitive data type of this field */
  type: 'string' | 'number' | 'integer' | 'boolean';
};

/** error types that can occur during mcp operations _(custom extension)_ */
export interface McpError extends Error {
  /** error code following json-rpc 2.0 error code conventions */
  code: number;
  /** additional error data */
  data?: unknown;
  /** session id where the error occurred */
  sessionId?: string;
  /** request id that caused the error */
  requestId?: string;
}

/** standard mcp error codes _(custom extension)_ */
export const MCP_ERROR_CODES = {
  /** invalid json was received */
  PARSE_ERROR: -32700,
  /** invalid request object */
  INVALID_REQUEST: -32600,
  /** method does not exist */
  METHOD_NOT_FOUND: -32601,
  /** invalid method parameters */
  INVALID_PARAMS: -32602,
  /** internal server error */
  INTERNAL_ERROR: -32603,
  /** tool execution failed */
  TOOL_ERROR: -32000,
  /** resource not found */
  RESOURCE_NOT_FOUND: -32001,
  /** authentication required */
  AUTHENTICATION_REQUIRED: -32002,
  /** insufficient permissions */
  AUTHORIZATION_FAILED: -32003,
  /** session expired or invalid */
  SESSION_INVALID: -32004,
  /** rate limit exceeded */
  RATE_LIMITED: -32005,
} as const;

/** type for mcp error code values _(custom extension)_ */
export type McpErrorCode =
  (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];

/** negotiated capabilities between mcp client and server _(custom extension)_ */
export interface Capability {
  /** capabilities supported by the mcp client */
  client: ClientCapabilities;
  /** capabilities supported by the mcp server */
  server: ServerCapabilities;
}
