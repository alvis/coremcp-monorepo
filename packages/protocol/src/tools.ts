/**
 * tool-related methods and types
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */

import type { Cursor, JsonSchema } from '#primitives';
import type { ContentBlock } from '#content';
import type { JsonifibleValue } from '#json';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

/** executable functionality that servers provide to clients for performing actions _(since 2024-11-05)_ */
export type Tool = {
  /** unique identifier for the tool */
  name: string;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
  /** human-readable explanation of what this tool does */
  description: string;
  /** json schema defining the structure of arguments this tool accepts */
  inputSchema: JsonSchema;
  /** json schema defining the structure of this tool's structured output _(since 2025-06-18)_ */
  outputSchema?: JsonSchema;
  /** optional hints about tool behavior and characteristics _(since 2025-03-26)_ */
  annotations?: ToolAnnotations;
};

/** behavioral hints about a tool's characteristics (all are hints, not guarantees) _(since 2025-03-26)_ */
export type ToolAnnotations = {
  /** whether tool may perform destructive updates (default: true) */
  destructiveHint?: boolean;
  /** whether repeated calls with same arguments have no additional effect (default: false) */
  idempotentHint?: boolean;
  /** whether tool interacts with external entities beyond closed domain (default: true) */
  openWorldHint?: boolean;
  /** whether tool only reads data without modifying environment (default: false) */
  readOnlyHint?: boolean;
  /** human-readable tool name for display */
  title?: string;
};

/**
 * request to discover all executable tools available from the server with optional pagination _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#listing-tools
 */
export interface ListToolsRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for listing tools */
  method: 'tools/list';
  /** optional parameters for pagination */
  params?: {
    /** pagination cursor to continue from previous request */
    cursor?: Cursor;
  };
}

/**
 * server response containing available tools and optional pagination continuation _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#listing-tools
 */
export interface ListToolsResult extends JsonRpcResultData {
  /** cursor for fetching additional results if more are available */
  nextCursor?: Cursor;
  /** array of tools available from this server */
  tools: Tool[];
}

/**
 * request to execute a specific tool with provided arguments _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#calling-tools
 */
export interface CallToolRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for calling tools */
  method: 'tools/call';
  /** parameters specifying which tool to call and how */
  params: {
    /** key-value arguments matching the tool's input schema */
    arguments?: Record<string, JsonifibleValue>;
    /** programmatic identifier of the tool to execute */
    name: string;
  };
}

/**
 * server response containing the results of tool execution _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools#calling-tools
 */
export interface CallToolResult extends JsonRpcResultData {
  /** unstructured results as content blocks (text, images, resources, etc.) */
  content: ContentBlock[];
  /** whether the tool execution resulted in an error */
  isError?: boolean;
  /** structured results matching the tool's output schema _(since 2025-06-18)_ */
  structuredContent?: Record<string, JsonifibleValue>;
}
