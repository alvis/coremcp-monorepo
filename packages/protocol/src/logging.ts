/**
 * logging-related methods
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/logging
 */

import type { McpLogLevel } from '#primitives';
import type { JsonRpcRequestData } from '#jsonrpc';

/**
 * request to configure the minimum severity level for log messages sent to the client _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/logging
 */
export interface SetLevelRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for setting log level */
  method: 'logging/setLevel';
  /** parameters specifying the desired logging configuration */
  params: {
    /** minimum log severity level (server sends this level and higher) */
    level: McpLogLevel;
  };
}
