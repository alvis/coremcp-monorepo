import type { RequestId } from '#primitives';
import type { CompleteRequest, CompleteResult } from '#completions';
import type { InitializeRequest, InitializeResult, PingRequest } from '#core';
import type { ElicitRequest, ElicitResult } from '#elicitation';
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
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
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

/** empty result type for operations that return no data */
export type EmptyResult = Record<string, never>;

/** union of all possible client-initiated requests to a server */
export type McpClientRequest =
  | InitializeRequest
  | PingRequest
  | CallToolRequest
  | ListToolsRequest
  | ListResourcesRequest
  | ListResourceTemplatesRequest
  | ReadResourceRequest
  | SubscribeRequest
  | UnsubscribeRequest
  | ListPromptsRequest
  | GetPromptRequest
  | CompleteRequest
  | SetLevelRequest;

/** union of all possible server-initiated requests to a client */
export type McpServerRequest =
  | CreateMessageRequest
  | ListRootsRequest
  | ElicitRequest;

/** union of all possible MCP requests from either party */
export type McpRequest = McpClientRequest | McpServerRequest;

/** union of all possible server response types */
export type McpServerReply =
  | InitializeResult
  | CallToolResult
  | ListToolsResult
  | ListResourcesResult
  | ListResourceTemplatesResult
  | ReadResourceResult
  | ListPromptsResult
  | GetPromptResult
  | CompleteResult
  | EmptyResult;

/** union of all possible client response types */
export type McpClientReply =
  | CreateMessageResult
  | ListRootsResult
  | ElicitResult;

/** union of all possible MCP reply types from either party */
export type McpReply = McpServerReply | McpClientReply;

/** union of all possible server-to-client notifications */
export type McpServerNotification =
  | ResourceListChangedNotification
  | ResourceUpdatedNotification
  | PromptListChangedNotification
  | ToolListChangedNotification
  | LoggingMessageNotification
  | McpBidirectionalNotification;

/** union of all possible client-to-server notifications */
export type McpClientNotification =
  | InitializedNotification
  | RootsListChangedNotification
  | McpBidirectionalNotification;

/** union of notifications that can be sent by either party */
export type McpBidirectionalNotification =
  | CancelledNotification
  | ProgressNotification;

/** union of all possible MCP notifications from either party */
export type McpNotification =
  | McpServerNotification
  | McpClientNotification
  | McpBidirectionalNotification;

/** base interface for all MCP messages with common fields */
export interface MessageBase {
  type: 'client-to-server' | 'server-to-client';
  status: 'sent' | 'replied';
  id?: RequestId;
  sentAt: Date;
  repliedAt?: Date;
  message: McpRequest | McpNotification;
  reply?: McpReply;
}

/** message wrapper for MCP notifications */
export interface NotificationMessage extends MessageBase {
  type: 'client-to-server' | 'server-to-client';
  id?: never;
  message: McpNotification;
  reply?: never;
}

/** message wrapper for MCP initialization */
export interface InitializeMessage extends MessageBase {
  type: 'client-to-server';
  message: InitializeRequest;
  reply?: InitializeResult;
}

/** message wrapper for ping requests */
export interface PingMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: PingRequest;
  reply?: EmptyResult;
}

/** message wrapper for tool call requests */
export interface CallToolMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: CallToolRequest;
  reply?: CallToolResult;
}

/** message wrapper for tool listing requests */
export interface ListToolsMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: ListToolsRequest;
  reply?: ListToolsResult;
}

/** message wrapper for resource listing requests */
export interface ListResourcesMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: ListResourcesRequest;
  reply?: ListResourcesResult;
}

/** message wrapper for resource template listing requests */
export interface ListResourceTemplatesMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: ListResourceTemplatesRequest;
  reply?: ListResourceTemplatesResult;
}

/** message wrapper for resource read requests */
export interface ReadResourceMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: ReadResourceRequest;
  reply?: ReadResourceResult;
}

/** message wrapper for resource subscription requests */
export interface SubscribeMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: SubscribeRequest;
  reply?: EmptyResult;
}

/** message wrapper for resource unsubscription requests */
export interface UnsubscribeMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: UnsubscribeRequest;
  reply?: EmptyResult;
}

/** message wrapper for prompt listing requests */
export interface ListPromptsMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: ListPromptsRequest;
  reply?: ListPromptsResult;
}

/** message wrapper for prompt retrieval requests */
export interface GetPromptMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: GetPromptRequest;
  reply?: GetPromptResult;
}

/** message wrapper for LLM message creation requests */
export interface CreateMessageMessage extends MessageBase {
  type: 'server-to-client';
  id: RequestId;
  message: CreateMessageRequest;
  reply?: CreateMessageResult;
}

/** message wrapper for autocompletion requests */
export interface CompleteMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: CompleteRequest;
  reply?: CompleteResult;
}

/** message wrapper for logging level configuration */
export interface SetLevelMessage extends MessageBase {
  type: 'client-to-server';
  id: RequestId;
  message: SetLevelRequest;
  reply?: EmptyResult;
}

/** message wrapper for filesystem roots listing */
export interface ListRootsMessage extends MessageBase {
  type: 'server-to-client';
  id: RequestId;
  message: ListRootsRequest;
  reply?: ListRootsResult;
}

/** message wrapper for user input elicitation */
export interface ElicitMessage extends MessageBase {
  type: 'server-to-client';
  id: RequestId;
  message: ElicitRequest;
  reply?: ElicitResult;
}

/** union of all possible client-to-server message types */
export type ClientToServerMessage =
  | InitializeMessage
  | PingMessage
  | CallToolMessage
  | ListToolsMessage
  | ListResourcesMessage
  | ListResourceTemplatesMessage
  | ReadResourceMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | ListPromptsMessage
  | GetPromptMessage
  | CompleteMessage
  | SetLevelMessage;

/** union of all possible server-to-client message types */
export type ServerToClientMessage =
  | CreateMessageMessage
  | ListRootsMessage
  | ElicitMessage;

/** union of all possible MCP message types */
export type McpMessage =
  | ClientToServerMessage
  | ServerToClientMessage
  | NotificationMessage;
