/**
 * json-rpc notification handling utilities for mcp server
 *
 * provides functions for processing incoming client notifications
 * including initialized confirmations and cancellation requests.
 * @module
 */

import { jsonifyError } from '@coremcp/core';

import {
  getVersionedValidators,
  JsonRpcError,
  MCP_ERROR_CODES,
} from '@coremcp/protocol';

import { createErrorMessageEnvelope } from './error-handler';

import type { Log, Session } from '@coremcp/core';
import type { JsonRpcNotificationEnvelope } from '@coremcp/protocol';

/**
 * processes an incoming json-rpc notification message
 *
 * validates the notification against the session's protocol version,
 * routes it to the appropriate handler (initialized confirmation or
 * cancellation), and logs the operation. errors are caught and sent
 * back as error responses.
 * @param message json-rpc notification envelope
 * @param session current client session
 * @param log optional logger for operation tracing
 */
export async function processNotification(
  message: JsonRpcNotificationEnvelope,
  session: Session,
  log?: Log,
): Promise<void> {
  try {
    log?.('debug', `processing JSON-RPC notification: ${message.method}`, {
      notification: message.method,
      params: message.params,
    });
    await session.addEvent({ type: 'client-message', message });

    // get the appropriate validator for the session's protocol version
    const validator = await getVersionedValidators(session.protocolVersion);

    // route message to appropriate handler based on method name
    switch (message.method) {
      case 'notifications/initialized':
        validator.notifications[message.method](message);

        // client confirms initialization is complete - no action needed
        break;
      case 'notifications/cancelled': {
        const {
          params: { requestId },
        } = validator.notifications[message.method](message);

        // client cancelled a request - abort the corresponding operation via session
        session.cancelRequest(requestId);

        break;
      }
      default:
        throw new JsonRpcError({
          code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
          message: `Unknown notification: ${message.method}`,
        });
    }

    log?.(
      'debug',
      `JSON-RPC notification processed successfully: ${message.method}`,
      { notification: message.method },
    );
  } catch (exception) {
    log?.('error', `failed to handle JSON-RPC notification`, {
      method: message.method,
      error: jsonifyError(exception),
    });

    const errorMessage = createErrorMessageEnvelope(message.id, exception);
    await session.notify(errorMessage);
  }
}
