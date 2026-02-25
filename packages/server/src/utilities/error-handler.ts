/**
 * json-rpc error handling utilities for mcp server
 *
 * provides functions to create standardized error response envelopes
 * following the json-rpc 2.0 specification.
 * @module
 */

import { jsonifyError } from '@coremcp/core';

import {
  JSONRPC_VERSION,
  JsonRpcError,
  MCP_ERROR_CODES,
} from '@coremcp/protocol';

import type { Log, Session } from '@coremcp/core';
import type {
  JsonRpcErrorEnvelope,
  JsonRpcMessage,
  RequestId,
} from '@coremcp/protocol';

/**
 * creates a json-rpc error message envelope from an exception
 *
 * handles both JsonRpcError instances and generic exceptions.
 * jsonrpc errors preserve their code, message, and data.
 * generic exceptions are wrapped as internal errors.
 * @param requestId the id of the request that caused the error (undefined for notifications)
 * @param exception the error that occurred
 * @returns json-rpc error envelope ready to send to client
 */
export function createErrorMessageEnvelope(
  requestId: RequestId | undefined,
  exception: unknown,
): JsonRpcErrorEnvelope {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: requestId,
    error:
      exception instanceof JsonRpcError
        ? {
            code: exception.code,
            message: exception.message,
            data: exception.data,
          }
        : {
            code: MCP_ERROR_CODES.INTERNAL_ERROR,
            message: 'Internal Error',
          },
  };
}

/**
 * handles errors that occur during message processing
 *
 * logs the error details and sends a json-rpc error response to the client.
 * @param context error context containing exception, message, session, and logger
 * @param context.exception the error that occurred
 * @param context.message the json-rpc message being processed
 * @param context.session the current session
 * @param context.log optional logger for error reporting
 */
export async function handleMessageError(context: {
  exception: unknown;
  message: JsonRpcMessage;
  session: Session;
  log?: Log;
}): Promise<void> {
  const { message, exception, session, log } = context;

  log?.('error', `failed to handle JSON-RPC message`, {
    id: message.id,
    method: message.method,
    error: jsonifyError(exception),
  });

  const errorMessage = createErrorMessageEnvelope(message.id, exception);

  await session.reply(errorMessage);
}

/**
 * validates a json-rpc message using the provided validator, wrapping errors as INVALID_PARAMS
 * @param validator schema validation function for the request
 * @param message the json-rpc message to validate
 * @returns validated message cast to the expected type
 * @throws {JsonRpcError} with INVALID_PARAMS when validation fails
 */
export function validateRequest<T>(
  validator: (message: JsonRpcMessage) => T,
  message: JsonRpcMessage,
): T {
  try {
    return validator(message);
  } catch (error) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
