import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

/**
 * roots (filesystem) methods
 * @see https://modelcontextprotocol.io/specification/2024-11-05/client/roots
 */

/** filesystem root directory or file that servers can access _(since 2024-11-05)_ */
export type Root = {
  /** optional human-readable name for this root */
  name?: string;
  /** URI identifying the root (currently must start with file://) */
  uri: string;
};

/**
 * request from server to client for available filesystem roots _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/client/roots
 */
export interface ListRootsRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for listing roots */
  method: 'roots/list';
  /** optional empty parameters object */
  params?: {};
}

/**
 * client response containing accessible filesystem roots _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/client/roots
 */
export interface ListRootsResult extends JsonRpcResultData {
  /** array of root directories/files the server can operate on */
  roots: Root[];
}
