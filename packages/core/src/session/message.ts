import { JSONRPC_VERSION } from '@coremcp/protocol';

import type { JsonRpcMessage } from '@coremcp/protocol';

/**
 * creates a JSON-RPC message with the version prefix
 * @param data message data without jsonrpc version
 * @returns complete JSON-RPC message
 */
export function createJsonRpcMessage(
  data: Omit<JsonRpcMessage, 'jsonrpc'>,
): JsonRpcMessage {
  return { jsonrpc: JSONRPC_VERSION, ...data } as JsonRpcMessage;
}
