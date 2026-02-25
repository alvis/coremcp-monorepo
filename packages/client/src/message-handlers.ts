import { JSONRPC_VERSION, JsonRpcError } from '@coremcp/protocol';

import type { Log } from '@coremcp/core';
import type {
  JsonRpcErrorData,
  JsonRpcMessage,
  JsonRpcResultData,
  McpServerNotification,
  McpServerRequest,
} from '@coremcp/protocol';

import type { RequestManager } from '#request-manager';

/** context object containing dependencies for message handlers */
export interface MessageHandlerContext {
  /** manages pending request lifecycle */
  requestManager: RequestManager;
  /** optional logger for debugging */
  log?: Log;
  /** handles requests received from the server */
  onRequest: (
    request: McpServerRequest,
  ) => Promise<{ result: JsonRpcResultData } | { error: JsonRpcErrorData }>;
  /** optional handler for server notifications */
  onNotification?: (notification: McpServerNotification) => Promise<void>;
  /** function to send messages to the server */
  send: (message: JsonRpcMessage) => Promise<void>;
}

/** collection of handlers for different message types */
export interface MessageHandlers {
  /** handles error responses from the server */
  handleError: (message: JsonRpcMessage) => void;
  /** handles successful responses from the server */
  handleSuccess: (message: JsonRpcMessage) => void;
  /** handles incoming requests from the server */
  handleRequest: (message: JsonRpcMessage) => Promise<void>;
  /** handles notifications from the server */
  handleNotification: (message: JsonRpcMessage) => void;
}

/**
 * creates message handlers with the given context
 * @param context - dependencies and callbacks for message handling
 * @returns object containing handlers for each message type
 */
export function createMessageHandlers(
  context: MessageHandlerContext,
): MessageHandlers {
  const { requestManager, log, onRequest, onNotification, send } = context;

  return {
    /**
     * handles error responses from the server
     * @param message - json-rpc error message from server
     */
    handleError(message: JsonRpcMessage): void {
      const meta = requestManager.getRequest(message.id!);

      log?.('error', 'received error from the server', {
        duration: requestManager.getRequestDuration(message.id!),
        request: meta?.request,
        error: message.error,
      });

      requestManager.rejectRequest(
        message.id!,
        new JsonRpcError(message.error!),
      );
    },

    /**
     * handles successful responses from the server
     * @param message - json-rpc success message from server
     */
    handleSuccess(message: JsonRpcMessage): void {
      const meta = requestManager.getRequest(message.id!);

      log?.('info', 'request completed', {
        duration: requestManager.getRequestDuration(message.id!),
        request: meta?.request,
      });

      requestManager.resolveRequest(message.id!, message.result);
    },

    /**
     * handles incoming requests from the server
     * @param message - json-rpc request message from server
     */
    async handleRequest(message: JsonRpcMessage): Promise<void> {
      log?.('info', 'received a request from the server', {
        request: {
          id: message.id,
          method: message.method,
        },
      });

      const result = await onRequest({
        method: message.method,
        params: message.params,
      } as McpServerRequest);

      void send({
        jsonrpc: JSONRPC_VERSION,
        id: message.id!,
        ...result,
      });
    },

    /**
     * handles notifications from the server
     * @param message - json-rpc notification message from server
     */
    handleNotification(message: JsonRpcMessage): void {
      log?.('info', 'received a notification from the server', {
        request: {
          id: message.id,
          method: message.method,
        },
      });

      void onNotification?.({
        method: message.method,
        params: message.params,
      } as McpServerNotification);
    },
  };
}
