import { mapMcpLogLevel } from '@coremcp/core';
import { MCP_ERROR_CODES } from '@coremcp/protocol';

import type { Log } from '@coremcp/core';
import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  JsonRpcErrorData,
  JsonRpcResultData,
  ListRootsResult,
  McpServerNotification,
  McpServerRequest,
  ProgressToken,
  RequestId,
  Root,
} from '@coremcp/protocol';

import type { CacheManager, ListType as CacheListType } from '#cache';
import type { ConnectionManager } from '#connection';
import type { McpConnector } from '#connector';
import type {
  OnCancelled,
  OnListChange,
  OnLogMessage,
  OnProgress,
  OnResourceChange,
} from '#types';

/** type of list that can be changed */
export type ListType = 'prompts' | 'tools' | 'resources';

/** callback for handling elicitation requests from server */
export type ElicitationCallback = (
  request: ElicitRequest['params'],
) => Promise<ElicitResult>;

/** callback for handling sampling requests from server */
export type SamplingCallback = (
  request: CreateMessageRequest['params'],
) => Promise<CreateMessageResult>;

/** dependencies needed for server request handler */
export interface CreateServerRequestHandlerParams {
  /** handles elicitation requests from servers */
  onElicitation?: ElicitationCallback;
  /** handles sampling requests from servers */
  onSampling?: SamplingCallback;
  /** root directories exposed to servers */
  roots: Root[];
  /** optional logger for debugging */
  log?: Log;
}

/** dependencies needed for server notification handler */
export interface ServerNotificationHandlerDependencies {
  /** callback for list change notifications */
  onListChange?: OnListChange;
  /** callback for resource updated notifications */
  onResourceChange?: OnResourceChange;
  /** callback for progress notifications */
  onProgress?: OnProgress;
  /** callback for cancelled notifications */
  onCancelled?: OnCancelled;
  /** callback for log message notifications */
  onLogMessage?: OnLogMessage;
  /** optional logger for debugging */
  log?: Log;
  /** optional cache manager for auto-refresh on list changes */
  cacheManager?: CacheManager;
  /** function to refresh list from server */
  refreshList?: (serverName: string, listType: ListType) => Promise<void>;
}

/** context for notification handlers */
interface NotificationContext {
  /** the connector that received the notification */
  connector: McpConnector;
  /** optional logger for debugging */
  log?: Log;
  /** callback for list change notifications */
  onListChange?: OnListChange;
  /** callback for resource updated notifications */
  onResourceChange?: OnResourceChange;
  /** callback for progress notifications */
  onProgress?: OnProgress;
  /** callback for cancelled notifications */
  onCancelled?: OnCancelled;
  /** callback for log message notifications */
  onLogMessage?: OnLogMessage;
  /** optional cache manager for auto-refresh on list changes */
  cacheManager?: CacheManager;
  /** function to refresh list from server */
  refreshList?: (serverName: string, listType: ListType) => Promise<void>;
}

/**
 * creates a handler for server-to-client requests
 * @param params dependencies required for handling requests
 * @returns handler function for processing server requests
 */
export function createServerRequestHandler(
  params: CreateServerRequestHandlerParams,
): (
  request: McpServerRequest,
) => Promise<{ result: JsonRpcResultData } | { error: JsonRpcErrorData }> {
  const { onElicitation, onSampling, roots, log } = params;

  return async (request: McpServerRequest) => {
    try {
      switch (request.method) {
        case 'sampling/createMessage': {
          if (!onSampling) {
            throw new Error('Sampling callback not configured');
          }

          const result = await onSampling(request.params);

          return { result };
        }

        case 'elicitation/create': {
          if (!onElicitation) {
            throw new Error('Elicitation callback not configured');
          }

          const result = await onElicitation(request.params);

          return { result };
        }

        case 'roots/list': {
          const result: ListRootsResult = {
            roots,
          };

          return { result };
        }

        default: {
          const unknownRequest = request as McpServerRequest;

          return {
            error: {
              code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
              message: `Method not found: ${unknownRequest.method}`,
              data: { request },
            },
          };
        }
      }
    } catch (error) {
      log?.('error', 'Error handling server request', {
        method: request.method,
        error,
      });

      return {
        error: {
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  };
}

/**
 * creates a handler for server notifications
 * @param params dependencies required for handling notifications
 * @returns handler function for processing server notifications
 */
export function createServerNotificationHandler(
  params: ServerNotificationHandlerDependencies,
): (
  connector: McpConnector,
  notification: McpServerNotification,
) => Promise<void> {
  return async (connector, notification) => {
    const context: NotificationContext = { connector, ...params };

    try {
      await dispatchNotification(context, notification);
    } catch (error) {
      params.log?.('error', 'Failed to handle server notification', {
        method: notification.method,
        error,
      });
    }
  };
}

/**
 * dispatches notification to appropriate handler based on method
 * @param context notification handler context
 * @param notification server notification to dispatch
 * @returns promise that resolves when notification is handled
 */
async function dispatchNotification(
  context: NotificationContext,
  notification: McpServerNotification,
): Promise<void> {
  switch (notification.method) {
    case 'notifications/message':
      return handleLogMessage(context, notification.params);
    case 'notifications/resources/updated':
      return handleResourceUpdated(context, notification.params);
    case 'notifications/tools/list_changed':
      return handleListChanged(context, 'tools');
    case 'notifications/resources/list_changed':
      return handleListChanged(context, 'resources');
    case 'notifications/prompts/list_changed':
      return handleListChanged(context, 'prompts');
    case 'notifications/progress':
      return handleProgress(context, notification.params);
    case 'notifications/cancelled':
      return handleCancelled(context, notification.params);
    default:
      context.log?.('warn', 'Unknown notification from server', {
        method: (notification as { method: string }).method,
      });
  }
}

/**
 * handles log message notifications from server
 * @param context notification handler context
 * @param params log message parameters
 * @param params.level severity level of the log
 * @param params.data log message content
 * @param params.logger optional logger name
 */
async function handleLogMessage(
  context: NotificationContext,
  params: {
    level: Parameters<typeof mapMcpLogLevel>[0];
    data: unknown;
    logger?: string;
  },
): Promise<void> {
  context.log?.(mapMcpLogLevel(params.level), params.data as string, {
    logger: params.logger,
  });

  await context.onLogMessage?.({
    connector: context.connector,
    level: params.level,
    data: params.data,
    logger: params.logger,
  });
}

/**
 * handles resource updated notifications
 * @param context notification handler context
 * @param params resource update parameters
 * @param params.uri uri of the updated resource
 */
async function handleResourceUpdated(
  context: NotificationContext,
  params: { uri: string },
): Promise<void> {
  context.log?.('debug', 'Resource updated', { uri: params.uri });

  await context.onResourceChange?.({
    connector: context.connector,
    uri: params.uri,
  });
}

/**
 * handles list changed notifications for tools, resources, or prompts
 * @param context notification handler context
 * @param changeType type of list that changed
 */
async function handleListChanged(
  context: NotificationContext,
  changeType: ListType,
): Promise<void> {
  context.log?.('debug', `${capitalize(changeType)} list changed`);

  if (context.cacheManager && context.refreshList) {
    const serverName = context.connector.info.name;
    context.cacheManager.invalidate(serverName, changeType);

    const capabilities = context.connector.info.capabilities;
    const supportsListChanged = capabilities?.[changeType]?.listChanged;

    if (supportsListChanged) {
      await context.refreshList(serverName, changeType);
    }
  }

  await context.onListChange?.({
    connector: context.connector,
    changeType,
  });
}

/**
 * handles progress notifications
 * @param context notification handler context
 * @param params progress notification parameters
 * @param params.progressToken token identifying the request
 * @param params.progress current progress value
 * @param params.total optional total progress value
 * @param params.message optional progress message
 */
async function handleProgress(
  context: NotificationContext,
  params: {
    progressToken: ProgressToken;
    progress: number;
    total?: number;
    message?: string;
  },
): Promise<void> {
  context.log?.('debug', 'Progress update', params);

  await context.onProgress?.({
    connector: context.connector,
    progressToken: params.progressToken,
    progress: params.progress,
    total: params.total,
    message: params.message,
  });
}

/**
 * handles cancelled notifications
 * @param context notification handler context
 * @param params cancellation parameters
 * @param params.requestId id of the cancelled request
 * @param params.reason optional cancellation reason
 */
async function handleCancelled(
  context: NotificationContext,
  params: { requestId: RequestId; reason?: string },
): Promise<void> {
  context.log?.('debug', 'Request cancelled', params);

  await context.onCancelled?.({
    connector: context.connector,
    requestId: params.requestId,
    reason: params.reason,
  });
}

/**
 * capitalizes the first letter of a string
 * @param str string to capitalize
 * @returns string with first letter capitalized
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** dependencies for creating a list refresher */
export interface ListRefresherDependencies {
  /** connection manager for server access */
  connectionManager: ConnectionManager;
  /** cache manager instance */
  cacheManager: CacheManager;
  /** optional logger */
  log?: Log;
}

/**
 * creates a function that refreshes list cache from server
 * @param deps dependencies needed for refreshing lists
 * @returns function that refreshes a specific list type for a server
 */
export function createListRefresher(
  deps: ListRefresherDependencies,
): (serverName: string, listType: ListType) => Promise<void> {
  const { connectionManager, cacheManager, log } = deps;

  return async (serverName: string, listType: ListType): Promise<void> => {
    const server = connectionManager.connectors.get(serverName);
    if (!server) {
      return;
    }

    try {
      switch (listType) {
        case 'prompts': {
          const prompts = await server.listPrompts();
          cacheManager.set(
            serverName,
            'prompts' satisfies CacheListType,
            prompts,
          );
          break;
        }
        case 'tools': {
          const tools = await server.listTools();
          cacheManager.set(serverName, 'tools' satisfies CacheListType, tools);
          break;
        }
        case 'resources': {
          const resources = await server.listResources();
          cacheManager.set(
            serverName,
            'resources' satisfies CacheListType,
            resources,
          );
          const templates = await server.listResourceTemplates();
          cacheManager.set(
            serverName,
            'resourceTemplates' satisfies CacheListType,
            templates,
          );
          break;
        }
        default:
          // All list types are handled above, this is exhaustive
          break;
      }
    } catch (error) {
      log?.('error', 'Failed to refresh list cache', {
        serverName,
        listType,
        error,
      });
    }
  };
}
