/**
 * core protocol methods for initialization and basic communication
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
 */

import type {
  ClientCapabilities,
  Implementation,
  ServerCapabilities,
} from '#primitives';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

/**
 * initial handshake request sent by clients to establish MCP connection and negotiate protocol version _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle#initialization
 */
export interface InitializeRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for initialization */
  method: 'initialize';
  /** initialization parameters */
  params: {
    /** features and functionality this client supports */
    capabilities: ClientCapabilities;
    /** information about the client implementation */
    clientInfo: Implementation;
    /** latest MCP protocol version this client supports */
    protocolVersion: string;
  };
}

/**
 * server response to initialization containing negotiated protocol details and server capabilities _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle#initialization
 */
export interface InitializeResult extends JsonRpcResultData {
  /** features and functionality this server provides */
  capabilities: ServerCapabilities;
  /** optional usage instructions for LLMs about how to use this server */
  instructions?: string;
  /** MCP protocol version this server wants to use (may differ from client request) */
  protocolVersion: string;
  /** information about the server implementation */
  serverInfo: Implementation;
}

/**
 * heartbeat request used by either party to verify connection is still alive and responsive _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/utilities/ping#message-format
 */
export interface PingRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for ping */
  method: 'ping';
  /** optional empty parameters object */
  params?: {};
}

/** successful ping response */
export interface PingResult extends JsonRpcResultData {}
