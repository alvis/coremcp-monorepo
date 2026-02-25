import type { Session } from '@coremcp/core';
import type {
  CallToolRequest,
  CallToolResult,
  CompleteRequest,
  CompleteResult,
  GetPromptRequest,
  GetPromptResult,
  InitializeRequest,
  InitializeResult,
  JsonRpcResultData,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ListToolsRequest,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
  SetLevelRequest,
  SubscribeRequest,
  UnsubscribeRequest,
} from '@coremcp/protocol';

/**
 * handles initialization requests from clients
 * @param params initialization parameters from client
 * @param context request context containing session and abort signal
 * @returns initialization result with server capabilities
 */
export type Initialize = (
  params: InitializeRequest['params'],
  context: RequestContext,
) => Promise<InitializeResult>;

/**
 * handles requests to list available resources
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns list of available resources with optional next cursor
 */
export type ListResources = (
  params: ListResourcesRequest['params'],
  context: RequestContext,
) => Promise<ListResourcesResult>;

/**
 * handles requests to list resource templates
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns list of resource templates with optional next cursor
 */
export type ListResourceTemplates = (
  params: ListResourceTemplatesRequest['params'],
  context: RequestContext,
) => Promise<ListResourceTemplatesResult>;

/**
 * handles requests to read resource contents
 * @param params request parameters including resource uri
 * @param context request context containing session and abort signal
 * @returns resource contents as text or blob
 */
export type ReadResource = (
  params: ReadResourceRequest['params'],
  context: RequestContext,
) => Promise<ReadResourceResult>;

/**
 * handles requests to subscribe to resource updates
 * @param params request parameters including resource uri
 * @param context request context containing session and abort signal
 * @returns empty acknowledgement response
 */
export type Subscribe = (
  params: SubscribeRequest['params'],
  context: RequestContext,
) => Promise<Record<string, never>>;

/**
 * handles requests to unsubscribe from resource updates
 * @param params request parameters including resource uri
 * @param context request context containing session and abort signal
 * @returns empty acknowledgement response
 */
export type Unsubscribe = (
  params: UnsubscribeRequest['params'],
  context: RequestContext,
) => Promise<Record<string, never>>;

/**
 * handles requests to list available prompts
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns list of available prompts with optional next cursor
 */
export type ListPrompts = (
  params: ListPromptsRequest['params'],
  context: RequestContext,
) => Promise<ListPromptsResult>;

/**
 * handles requests to retrieve a specific prompt
 * @param params request parameters including prompt name and arguments
 * @param context request context containing session and abort signal
 * @returns prompt with resolved message content
 */
export type GetPrompt = (
  params: GetPromptRequest['params'],
  context: RequestContext,
) => Promise<GetPromptResult>;

/**
 * handles requests to list available tools
 * @param params request parameters including optional cursor
 * @param context request context containing session and abort signal
 * @returns list of available tools with optional next cursor
 */
export type ListTools = (
  params: ListToolsRequest['params'],
  context: RequestContext,
) => Promise<ListToolsResult>;

/**
 * handles requests to invoke a specific tool
 * @param params request parameters including tool name and arguments
 * @param context request context containing session and abort signal
 * @returns tool execution result with content and error status
 */
export type CallTool = (
  params: CallToolRequest['params'],
  context: RequestContext,
) => Promise<CallToolResult>;

/**
 * handles requests for argument completion
 * @param params request parameters including completion details
 * @param context request context containing session and abort signal
 * @returns completion results with suggested values
 */
export type Complete = (
  params: CompleteRequest['params'],
  context: RequestContext,
) => Promise<CompleteResult>;

/**
 * handles requests to change server logging level
 * @param params request parameters including logging level
 * @param context request context containing session and abort signal
 * @returns empty acknowledgement response
 */
export type SetLevel = (
  params: SetLevelRequest['params'],
  context: RequestContext,
) => Promise<Record<string, never>>;

/**
 * server-side handler methods for processing mcp client requests
 */
export interface ServerRequestHandler {
  initialize: Initialize;
  listResources: ListResources;
  listResourceTemplates: ListResourceTemplates;
  readResource: ReadResource;
  subscribe: Subscribe;
  unsubscribe: Unsubscribe;
  listPrompts: ListPrompts;
  getPrompt: GetPrompt;
  listTools: ListTools;
  callTool: CallTool;
  complete: Complete;
  setLevel: SetLevel;
  [method: string]:
    | ((params: any, context: RequestContext) => Promise<JsonRpcResultData>)
    | undefined;
}

/** context information passed to server request handlers */
export interface RequestContext {
  abort: AbortSignal;
  session: Session;
}
