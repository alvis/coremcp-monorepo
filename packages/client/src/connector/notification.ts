import { JSONRPC_VERSION } from '@coremcp/protocol';

import type { Log } from '@coremcp/core';
import type {
  JsonRpcMessage,
  JsonRpcNotificationData,
  JsonRpcNotificationEnvelope,
} from '@coremcp/protocol';

/** context required for sending notifications */
interface NotificationContext {
  /** current connection status */
  isConnected: boolean;
  /** connector name for error messages */
  name: string;
  /** optional logger */
  log?: Log;
  /** transport send function */
  send: (message: JsonRpcMessage) => Promise<void>;
}

/**
 * sends a notification to the server without expecting a response
 * @param method notification method name
 * @param params json-rpc notification data
 * @param context notification sending dependencies
 * @throws {Error} if the connector is not connected
 */
export async function sendNotification(
  method: `notifications/${string}`,
  params: JsonRpcNotificationData | undefined,
  context: NotificationContext,
): Promise<void> {
  if (!context.isConnected) {
    throw new Error(
      `Cannot send notification to ${context.name}: not connected`,
    );
  }

  const message: JsonRpcNotificationEnvelope = {
    jsonrpc: JSONRPC_VERSION,
    method,
    params,
  };

  context.log?.('debug', 'sending a notification to the server', message);

  await context.send(message);
}
