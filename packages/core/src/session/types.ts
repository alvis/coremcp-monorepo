import type {
  AppInfo,
  ClientCapabilities,
  JsonifibleObject,
  JsonObject,
  JsonRpcErrorData,
  JsonRpcMessage,
  JsonRpcNotificationData,
  JsonRpcRequestData,
  JsonRpcResultData,
  Prompt,
  RequestId,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from '@coremcp/protocol';

import type { SetRequired } from '#types';

import type { SessionStore } from './store';

/** session data with all events marked as recorded */
export type RecordedSessionData = Omit<SessionData, 'events'> & {
  events: RecordedSessionEvent[];
};

/** session event that has been recorded with a timestamp */
export type RecordedSessionEvent = SetRequired<SessionEvent, 'recordedAt'>;

/** union type representing all possible session events */
export type SessionEvent =
  | SessionServerMessageEvent
  | SessionClientMessageEvent
  | SessionAssistantMessageEvent
  | SessionSystemEvent;

/** event representing a message sent from server to client */
export interface SessionServerMessageEvent extends SessionEventBase {
  type: 'server-message';
  /** related request id if it's a response from the server to the client in response to a client's request */
  responseToRequestId?: RequestId;
  message: JsonRpcMessage;
}

/** event representing a message sent from client to server */
export interface SessionClientMessageEvent extends SessionEventBase {
  type: 'client-message';
  /** related request id if it's a response from the client to the server in response to a server's request */
  responseToRequestId?: RequestId;
  message: JsonRpcMessage;
}

/** event representing a message from an assistant or AI agent */
export interface SessionAssistantMessageEvent extends SessionEventBase {
  type: 'assistant-message';
  message: JsonifibleObject;
}

/** event representing system-level session lifecycle changes */
export interface SessionSystemEvent extends SessionEventBase {
  type: 'channel-started' | 'channel-ended' | 'abort';
}

interface SessionEventBase {
  id: string;
  type: string;
  channelId: string;
  /** the stream where the event happened */
  occurredAt: number;
  recordedAt?: number;
  metadata?: JsonObject;
}

/** union type representing all possible session request states */
export type SessionRequest =
  | IncompleteSessionRequest
  | CompletedSessionRequest
  | ErrorSessionRequest;

/** session request that is still in progress or has been hanged/cancelled */
export interface IncompleteSessionRequest extends SessionRequestBase {
  /** prcessing indicates that there is an active thread handling it, hanged means no active thread due to disconnection or the original thread has timeouted, cancelled for aborted by the user */
  status: 'processing' | 'hanged' | 'cancelled';
  result?: never;
  error?: never;
}

/** session request that has completed successfully with a result */
export interface CompletedSessionRequest extends SessionRequestBase {
  status: 'fulfilled';
  result: JsonRpcResultData;
  error?: never;
}

/** session request that has failed with an error */
export interface ErrorSessionRequest extends SessionRequestBase {
  status: 'error';
  result?: never;
  error: JsonRpcErrorData;
}

/** base properties shared by all session request types */
export interface SessionRequestBase {
  id: RequestId;
  from: 'server' | 'client';
  createdAt: number;
  lastActivity: number;
  status: 'processing' | 'hanged' | 'cancelled' | 'error' | 'fulfilled';
  request: JsonRpcRequestData;
  /** list of notifications happened because of this request, excluding subscription notifications */
  notifications: JsonRpcNotificationData[];
  result?: JsonRpcResultData;
  error?: JsonRpcErrorData;
  subRequests: RequestId[];
  events: SessionEvent[];
}

/** complete session data including user info, capabilities, and event history */
export interface SessionData {
  id: string;
  userId: string | null;
  protocolVersion: string;
  clientInfo: AppInfo;
  serverInfo: AppInfo;
  capabilities: {
    client: ClientCapabilities;
    server: ServerCapabilities;
  };
  tools: Tool[];
  prompts: Prompt[];
  resources: Resource[];
  resourceTemplates: ResourceTemplate[];
  subscriptions: string[];
  events: SessionEvent[];
}

/** context information and configuration for a session */
export interface SessionContext {
  channel: SessionChannelContext;
  hooks?: SessionHook;
  store?: SessionStore;
}

/** transport channel context for session communication */
export interface SessionChannelContext {
  // transport //
  id: string;
  side: 'server' | 'client';
  write: (message: JsonRpcMessage) => Promise<void>;
}

/** session lifecycle hooks for event and subscription handling */
export interface SessionHook {
  // event subscription //
  onEvent?: EventHook;
  onSubscribe?: SubscriptionHook;
  onUnsubscribe?: SubscriptionHook;
}

/** callback function invoked when a session event occurs */
export type EventHook = (event: SessionEvent) => void;

/** callback function invoked for resource subscription changes */
export type SubscriptionHook = (uri: string) => void;
