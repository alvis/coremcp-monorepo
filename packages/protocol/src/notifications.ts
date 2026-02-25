/**
 * Notification methods
 * @see https://modelcontextprotocol.io/specification/2024-11-05/basic/notifications
 */

import type { McpLogLevel, ProgressToken, RequestId } from '#primitives';
import type { JsonifibleValue } from '#json';

/**
 * notification sent by client to server after successful initialization to begin normal operation _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle
 */
export interface InitializedNotification {
  /** json-rpc method name for initialization completion */
  method: 'notifications/initialized';
  /** optional empty parameters object */
  params?: {};
}

/**
 * notification sent by either party to cancel a previously issued request _(since 2025-03-26)_
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/cancellation
 */
export interface CancelledNotification {
  /** json-rpc method name for request cancellation */
  method: 'notifications/cancelled';
  /** parameters identifying what to cancel */
  params: {
    /** optional explanation for why the request was cancelled */
    reason?: string;
    /** ID of the request to cancel (must match a previously issued request) */
    requestId: RequestId;
  };
}

/**
 * out-of-band notification providing progress updates for long-running operations _(since 2025-03-26)_
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/progress
 */
export interface ProgressNotification {
  /** json-rpc method name for progress updates */
  method: 'notifications/progress';
  /** progress information and context */
  params: {
    /** optional human-readable description of current progress */
    message?: string;
    /** current progress amount (should increase with each update) */
    progress: number;
    /** token linking this notification to the original request */
    progressToken: ProgressToken;
    /** total amount of work to be done (if known) */
    total?: number;
  };
}

/**
 * notification from server informing client that the available resources list has changed _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ResourceListChangedNotification {
  /** json-rpc method name for resource list changes */
  method: 'notifications/resources/list_changed';
  /** optional empty parameters object */
  params?: {};
}

/**
 * notification from server informing subscribed clients that a specific resource has changed _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ResourceUpdatedNotification {
  /** json-rpc method name for resource updates */
  method: 'notifications/resources/updated';
  /** information about what changed */
  params: {
    /** uri of the resource that was updated (may be sub-resource of subscription) */
    uri: string;
  };
}

/**
 * notification from server informing client that the available prompts list has changed _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/prompts
 */
export interface PromptListChangedNotification {
  /** json-rpc method name for prompt list changes */
  method: 'notifications/prompts/list_changed';
  /** optional empty parameters object */
  params?: {};
}

/**
 * notification from server informing client that the available tools list has changed _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/tools
 */
export interface ToolListChangedNotification {
  /** json-rpc method name for tool list changes */
  method: 'notifications/tools/list_changed';
  /** optional empty parameters object */
  params?: {};
}

/**
 * notification from client informing server that the available filesystem roots have changed _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/client/roots
 */
export interface RootsListChangedNotification {
  /** json-rpc method name for roots list changes */
  method: 'notifications/roots/list_changed';
  /** optional empty parameters object */
  params?: {};
}

/**
 * notification from server containing a log message for the client to process _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/logging
 */
export interface LoggingMessageNotification {
  /** JSON-RPC method name for log messages */
  method: 'notifications/message';
  /** log message content and metadata */
  params: {
    /** the actual log data (string message or structured object) */
    data: JsonifibleValue;
    /** severity level of this log message */
    level: McpLogLevel;
    /** optional name of the component that generated this log */
    logger?: string;
  };
}
