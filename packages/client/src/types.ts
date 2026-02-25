import type { Log, SessionStore } from '@coremcp/core';
import type {
  ClientCapabilities,
  Implementation,
  JsonRpcErrorData,
  JsonRpcMessage,
  JsonRpcResultData,
  McpLogLevel,
  McpServerNotification,
  McpServerRequest,
  ProgressToken,
  RequestId,
} from '@coremcp/protocol';

import type { McpConnector } from '#connector';

/** configuration parameters for creating an mcp connector */
export interface McpConnectorParams {
  /** unique identifier for this connector */
  name: string;
  /** client implementation information sent during handshake */
  clientInfo: Implementation;
  /** capabilities supported by the client */
  capabilities: ClientCapabilities;
  /** optional session store for persistence */
  sessionStore?: SessionStore;
  /** optional logger for debugging */
  log?: Log;
  /** callback invoked when connection is established */
  onConnect?: OnConnect;
  /** handler for server-to-client requests */
  onRequest?: OnRequest;
  /** handler for server notifications */
  onNotification?: OnNotification;
}

/** connection status states for mcp connectors */
export type Status =
  | 'disconnected'
  | 'connecting'
  | 'pending-auth'
  | 'connected'
  | 'disconnecting';

/** comprehensive status information for mcp connector */
export interface StatusInfo {
  /** current connection status */
  status: Status;
  /** transport implementation name */
  transport: string;
  /** runtime process information */
  processInfo: {
    /** process identifier */
    pid: number;
    /** node.js version string */
    nodeVersion: string;
    /** operating system platform */
    platform: string;
    /** cpu architecture */
    arch: string;
    /** process uptime in seconds */
    uptime: number;
  };
  /** iso 8601 timestamp of status capture */
  timestamp: string;
}

/** callback invoked when connection is successfully established */
export type OnConnect = () => void;

/** handles messages received from the server */
export type OnMessage = (message: JsonRpcMessage) => void;

/** handles requests received from the server */
export type OnRequest = (
  message: McpServerRequest,
) => Promise<{ result: JsonRpcResultData } | { error: JsonRpcErrorData }>;

/** handles notifications received from the server */
export type OnNotification = (
  notification: McpServerNotification,
) => Promise<void>;

// NOTIFICATION HOOK TYPES //

/** parameters for onListChange hook - combines all list_changed notifications */
export interface OnListChangeParams {
  /** the connector that sent this notification */
  connector: McpConnector;
  /** type of list that changed */
  changeType: 'tools' | 'resources' | 'prompts';
}

/** callback for list change notifications (tools, resources, prompts) */
export type OnListChange = (params: OnListChangeParams) => void | Promise<void>;

/** parameters for onResourceChange hook */
export interface OnResourceChangeParams {
  /** the connector that sent this notification */
  connector: McpConnector;
  /** uri of the resource that was updated */
  uri: string;
}

/** callback for resource updated notifications */
export type OnResourceChange = (
  params: OnResourceChangeParams,
) => void | Promise<void>;

/** parameters for onProgress hook */
export interface OnProgressParams {
  /** the connector that sent this notification */
  connector: McpConnector;
  /** token linking this notification to the original request */
  progressToken: ProgressToken;
  /** current progress amount */
  progress: number;
  /** total amount of work to be done (if known) */
  total?: number;
  /** human-readable description of current progress */
  message?: string;
}

/** callback for progress notifications */
export type OnProgress = (params: OnProgressParams) => void | Promise<void>;

/** parameters for onCancelled hook */
export interface OnCancelledParams {
  /** the connector that sent this notification */
  connector: McpConnector;
  /** ID of the request that was cancelled */
  requestId: RequestId;
  /** explanation for why the request was cancelled */
  reason?: string;
}

/** callback for cancelled notifications */
export type OnCancelled = (params: OnCancelledParams) => void | Promise<void>;

/** parameters for onLogMessage hook */
export interface OnLogMessageParams {
  /** the connector that sent this notification */
  connector: McpConnector;
  /** severity level of the log message */
  level: McpLogLevel;
  /** the actual log data */
  data: unknown;
  /** name of the component that generated this log */
  logger?: string;
}

/** callback for log message notifications */
export type OnLogMessage = (params: OnLogMessageParams) => void | Promise<void>;
