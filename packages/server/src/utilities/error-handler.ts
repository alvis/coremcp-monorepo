/**
 * json-rpc error handling utilities for mcp server
 *
 * provides functions to create standardized error response envelopes
 * following the json-rpc 2.0 specification.
 * @module
 */

import {
  JSONRPC_VERSION,
  JsonRpcError,
  MCP_ERROR_CODES,
} from '@coremcp/protocol';

import type { JsonRpcErrorEnvelope, RequestId } from '@coremcp/protocol';

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
