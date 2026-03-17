/**
 * minimal JSON-RPC client using fetch() for streamable HTTP transport
 *
 * provides low-level MCP communication without the SDK connector layer,
 * enabling tests that verify raw protocol behavior, session management,
 * and task lifecycle over HTTP.
 */

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';

import { CLIENT_INFO } from './index';

import type { RequestId } from '@coremcp/protocol';

// TYPES //

/** JSON-RPC request envelope for outgoing messages */
interface JsonRpcRequestMessage {
  /** JSON-RPC version identifier */
  jsonrpc: typeof JSONRPC_VERSION;
  /** unique request identifier */
  id: RequestId;
  /** method name to invoke */
  method: string;
  /** optional parameters for the method */
  params?: Record<string, unknown>;
}

/** JSON-RPC response envelope for incoming messages */
interface JsonRpcResponseMessage {
  /** JSON-RPC version identifier */
  jsonrpc: string;
  /** request identifier matching the original request */
  id: RequestId;
  /** successful result payload */
  result?: unknown;
  /** error payload when the request failed */
  error?: {
    /** numeric error code */
    code: number;
    /** human-readable error description */
    message: string;
    /** optional additional error data */
    data?: unknown;
  };
}

/** raw HTTP response returned by sendRawMessage */
export interface RawHttpResponse {
  /** HTTP status code */
  status: number;
  /** response headers */
  headers: Headers;
  /** raw response body text */
  body: string;
}

/** raw HTTP MCP session for low-level protocol testing */
export interface RawHttpSession {
  /** the JSON-RPC request ID used by the most recent send or sendRequest call */
  lastRequestId: RequestId | undefined;
  /** session identifier assigned by the server */
  sessionId: string;
  /** sends a JSON-RPC request and returns the result */
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  /** sends a JSON-RPC notification (no id field, no response expected) */
  sendNotification: (
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<void>;
  /** sends an arbitrary raw string to the server without JSON parsing or envelope wrapping */
  sendRawMessage: (json: string) => Promise<RawHttpResponse>;
  /** calls a tool with task metadata for async task lifecycle testing */
  callToolWithTask: (
    name: string,
    args: Record<string, unknown>,
    task: { ttl: number },
  ) => Promise<unknown>;
  /** opens an SSE stream for receiving server-to-client requests */
  openSseStream: () => Promise<ReadableStream<Uint8Array>>;
  /** sends a JSON-RPC response back to the server for a server-initiated request */
  respondToRequest: (id: RequestId, result: unknown) => Promise<void>;
  /** closes the session and releases resources */
  close: () => Promise<void>;
}

// CONSTANTS //

/** content type header for JSON-RPC messages */
const JSON_CONTENT_TYPE = 'application/json';

/** accept header for SSE streams */
const SSE_ACCEPT = 'text/event-stream';

/** session header name used by MCP streamable HTTP transport */
const SESSION_HEADER = 'Mcp-Session-Id';

// FUNCTIONS //

/**
 * creates a raw HTTP MCP session by performing the initialization handshake
 *
 * sends the `initialize` request followed by `notifications/initialized` to
 * establish a session with the server. the returned session provides methods
 * for sending requests, calling tools with task metadata, and opening SSE streams.
 * @param mcpEndpoint full URL of the MCP HTTP endpoint
 * @returns initialized raw HTTP session
 * @throws when the server does not return a valid session ID or initialization fails
 */
export async function createRawHttpSession(
  mcpEndpoint: string,
): Promise<RawHttpSession> {
  let nextId = 1;
  let sessionId = '';
  let lastRequestId: RequestId | undefined;

  /**
   * builds a JSON-RPC request envelope with an auto-incremented ID
   * @param method JSON-RPC method name
   * @param params optional parameters for the method
   * @returns complete JSON-RPC request envelope
   */
  function buildRequest(
    method: string,
    params?: Record<string, unknown>,
  ): JsonRpcRequestMessage {
    const id = nextId;
    nextId += 1;

    const message: JsonRpcRequestMessage = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
    };

    if (params !== undefined) {
      message.params = params;
    }

    return message;
  }

  /**
   * builds HTTP headers for a JSON-RPC POST request
   * @returns headers object with content type, accept, and optional session ID
   */
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': JSON_CONTENT_TYPE,
      Accept: `${JSON_CONTENT_TYPE}, ${SSE_ACCEPT}`,
      'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
    };

    if (sessionId) {
      headers[SESSION_HEADER] = sessionId;
    }

    return headers;
  }

  /**
   * sends a JSON-RPC request to the server and parses the response
   * @param method JSON-RPC method name
   * @param params optional parameters for the method
   * @returns the result field from the JSON-RPC response
   * @throws when the server returns an error response or the request fails
   */
  async function send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const request = buildRequest(method, params);
    lastRequestId = request.id;
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(request),
    });

    // capture session ID from response headers if present
    const responseSessionId = response.headers.get(SESSION_HEADER);

    if (responseSessionId) {
      sessionId = responseSessionId;
    }

    const contentType = response.headers.get('content-type') ?? '';
    let body: JsonRpcResponseMessage;

    if (contentType.includes('text/event-stream')) {
      // server responded with SSE format -- extract JSON from "data: " lines
      const text = await response.text();
      const jsonLine = text
        .split('\n')
        .find((line) => line.startsWith('data: '));

      if (!jsonLine) {
        throw new Error('SSE response contained no data line');
      }

      body = JSON.parse(jsonLine.slice(6)) as JsonRpcResponseMessage;
    } else {
      body = (await response.json()) as JsonRpcResponseMessage;
    }

    if (body.error) {
      throw new Error(
        `JSON-RPC error ${body.error.code}: ${body.error.message}`,
      );
    }

    return body.result;
  }

  /**
   * sends a JSON-RPC notification to the server (no id field, fire-and-forget)
   *
   * notifications do not include an `id` field and the server is not expected
   * to return a response body. used for cancellation and other one-way signals.
   * @param method JSON-RPC notification method name
   * @param params optional parameters for the notification
   */
  async function sendNotification(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const message: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      method,
    };

    if (params !== undefined) {
      message.params = params;
    }

    await fetch(mcpEndpoint, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(message),
    });
  }

  /**
   * sends an arbitrary raw string to the server without JSON parsing or envelope wrapping
   *
   * the provided string is sent as-is in the request body. this enables edge-case
   * testing such as malformed JSON, truncated payloads, and duplicate request IDs.
   * @param json raw string to send as the request body
   * @returns the raw HTTP response including status, headers, and body text
   */
  async function sendRawMessage(json: string): Promise<RawHttpResponse> {
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: buildHeaders(),
      body: json,
    });

    const body = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      body,
    };
  }

  /**
   * calls a tool with task metadata for async task lifecycle testing
   * @param name tool name to invoke
   * @param args tool arguments matching the tool's input schema
   * @param task task metadata containing TTL configuration
   * @param task.ttl
   * @returns the result of the tool call including task information
   */
  async function callToolWithTask(
    name: string,
    args: Record<string, unknown>,
    task: { ttl: number },
  ): Promise<unknown> {
    return send('tools/call', {
      name,
      arguments: args,
      task: { ttl: task.ttl },
    });
  }

  /**
   * opens an SSE stream for receiving server-to-client requests
   *
   * performs a GET request with the SSE accept header and session ID
   * to establish a server-sent events stream for bidirectional communication.
   * @returns readable stream of SSE data
   * @throws when the server does not return a valid response body
   */
  async function openSseStream(): Promise<ReadableStream<Uint8Array>> {
    const headers: Record<string, string> = {
      Accept: SSE_ACCEPT,
    };

    if (sessionId) {
      headers[SESSION_HEADER] = sessionId;
    }

    const response = await fetch(mcpEndpoint, {
      method: 'GET',
      headers,
    });

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    return response.body;
  }

  /**
   * sends a JSON-RPC response back to the server for a server-initiated request
   *
   * this posts a response envelope (not a request) to acknowledge or answer
   * a server-to-client request received via the SSE stream.
   * @param id request ID from the server-initiated request
   * @param result result payload to send back
   */
  async function respondToRequest(
    id: RequestId,
    result: unknown,
  ): Promise<void> {
    const responseMessage = {
      jsonrpc: JSONRPC_VERSION,
      id,
      result,
    };

    await fetch(mcpEndpoint, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(responseMessage),
    });
  }

  /**
   * closes the session by sending a DELETE request to the server
   */
  async function close(): Promise<void> {
    if (!sessionId) {
      return;
    }

    try {
      await fetch(mcpEndpoint, {
        method: 'DELETE',
        headers: { [SESSION_HEADER]: sessionId },
      });
    } catch {
      // best-effort cleanup; ignore errors during teardown
    }
  }

  // perform initialization handshake
  await send('initialize', {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
    clientInfo: CLIENT_INFO,
  });

  // send initialized notification (no id field per JSON-RPC 2.0 -- notifications must not include id)
  await sendNotification('notifications/initialized');

  return {
    get lastRequestId() {
      return lastRequestId;
    },
    sessionId,
    send,
    sendNotification,
    sendRawMessage,
    callToolWithTask,
    openSseStream,
    respondToRequest,
    close,
  };
}
