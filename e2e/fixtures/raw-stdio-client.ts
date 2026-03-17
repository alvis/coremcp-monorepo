/**
 * minimal JSON-RPC client using child_process.spawn for stdio transport
 *
 * provides low-level MCP communication over stdin/stdout without the SDK
 * connector layer, enabling tests that verify raw protocol behavior,
 * server-initiated requests, and task lifecycle over stdio.
 */

import { spawn } from 'node:child_process';

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';

import { CLIENT_INFO, getStdioServerConfig } from './index';

import type { ChildProcess } from 'node:child_process';

import type { RequestId } from '@coremcp/protocol';

// TYPES //

/** JSON-RPC message with method field (request or notification) */
interface JsonRpcIncomingRequest {
  /** JSON-RPC version identifier */
  jsonrpc: string;
  /** request identifier (present for requests, absent for notifications) */
  id?: RequestId;
  /** method name */
  method: string;
  /** optional parameters */
  params?: unknown;
}

/** JSON-RPC response message */
interface JsonRpcIncomingResponse {
  /** JSON-RPC version identifier */
  jsonrpc: string;
  /** request identifier matching the original request */
  id: RequestId;
  /** successful result payload */
  result?: unknown;
  /** error payload */
  error?: {
    /** numeric error code */
    code: number;
    /** human-readable error description */
    message: string;
    /** optional additional error data */
    data?: unknown;
  };
}

/** parsed JSON-RPC message from stdout */
type IncomingMessage = JsonRpcIncomingRequest | JsonRpcIncomingResponse;

/** pending request awaiting a response from the server */
interface PendingRequest {
  /** resolves the promise with the result value */
  resolve: (value: unknown) => void;
  /** rejects the promise with an error */
  reject: (error: Error) => void;
}

/** handler for server-initiated requests that returns a response */
type ServerRequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

/** handler for server-initiated notifications (fire-and-forget, no response) */
type ServerNotificationHandler = (method: string, params: unknown) => void;

/** raw stdio response returned by sendRawMessage */
export interface RawStdioResponse {
  /** parsed JSON-RPC response, or null if the response could not be parsed */
  parsed: JsonRpcIncomingResponse | null;
  /** raw response line from stdout, or null if no response was received before timeout */
  raw: string | null;
}

/** raw stdio MCP session for low-level protocol testing */
export interface RawStdioSession {
  /** the JSON-RPC request ID used by the most recent send call */
  lastRequestId: RequestId | undefined;
  /** sends a JSON-RPC request and returns the result */
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  /** sends a JSON-RPC notification (no id field, fire-and-forget) */
  sendNotification: (
    method: string,
    params?: Record<string, unknown>,
  ) => void;
  /** sends an arbitrary raw string to the server without JSON parsing or envelope wrapping */
  sendRawMessage: (json: string) => Promise<RawStdioResponse>;
  /** calls a tool with task metadata for async task lifecycle testing */
  callToolWithTask: (
    name: string,
    args: Record<string, unknown>,
    task: { ttl: number },
  ) => Promise<unknown>;
  /** registers a handler for server-initiated requests */
  onServerRequest: (handler: ServerRequestHandler) => void;
  /** registers a handler for server-initiated notifications */
  onServerNotification: (handler: ServerNotificationHandler) => void;
  /** closes the session by terminating the child process */
  close: () => Promise<void>;
}

// CONSTANTS //

/** timeout for pending requests in milliseconds (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/** grace period before sending SIGKILL in milliseconds */
const KILL_GRACE_PERIOD_MS = 5_000;

// FUNCTIONS //

/**
 * checks whether a parsed message is a response (has result or error, no method)
 * @param message parsed JSON-RPC message
 * @returns true if the message is a response
 */
function isResponse(message: IncomingMessage): message is JsonRpcIncomingResponse {
  return (
    'id' in message &&
    message.id !== undefined &&
    !('method' in message && message.method !== undefined)
  );
}

/**
 * checks whether a parsed message is a server-initiated request (has method and id)
 * @param message parsed JSON-RPC message
 * @returns true if the message is a server request
 */
function isServerRequest(
  message: IncomingMessage,
): message is JsonRpcIncomingRequest & { id: RequestId } {
  return (
    'method' in message &&
    typeof message.method === 'string' &&
    'id' in message &&
    message.id !== undefined
  );
}

/**
 * checks whether a parsed message is a server-initiated notification (has method but no id)
 * @param message parsed JSON-RPC message
 * @returns true if the message is a notification
 */
function isNotification(
  message: IncomingMessage,
): message is JsonRpcIncomingRequest & { id?: undefined } {
  return (
    'method' in message &&
    typeof message.method === 'string' &&
    !('id' in message && message.id !== undefined)
  );
}

/**
 * creates a raw stdio MCP session by spawning the test server and initializing
 *
 * spawns the test server via `getStdioServerConfig()`, establishes JSON-RPC
 * communication over stdin/stdout, and performs the initialization handshake.
 * @returns initialized raw stdio session
 * @throws when the server process fails to start or initialization times out
 */
export async function createRawStdioSession(): Promise<RawStdioSession> {
  const config = getStdioServerConfig();
  let nextId = 1;
  let lastRequestId: RequestId | undefined;
  let serverProcess: ChildProcess | null = null;
  let serverRequestHandler: ServerRequestHandler | null = null;
  let serverNotificationHandler: ServerNotificationHandler | null = null;

  const pendingRequests = new Map<RequestId, PendingRequest>();
  let stdoutBuffer = '';

  /**
   * processes a single JSON-RPC message received from stdout
   * @param message parsed JSON-RPC message
   */
  function handleMessage(message: IncomingMessage): void {
    if (isResponse(message)) {
      const pending = pendingRequests.get(message.id);

      if (pending) {
        pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(
              `JSON-RPC error ${message.error.code}: ${message.error.message}`,
            ),
          );
        } else {
          pending.resolve(message.result);
        }
      }

      return;
    }

    if (isServerRequest(message)) {
      if (serverRequestHandler) {
        void serverRequestHandler(message.method, message.params).then(
          (result) => {
            writeMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              result,
            });
          },
          (error: unknown) => {
            writeMessage({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              error: {
                code: -32603,
                message:
                  error instanceof Error ? error.message : 'Internal error',
              },
            });
          },
        );
      }
    }

    if (isNotification(message)) {
      if (serverNotificationHandler) {
        serverNotificationHandler(message.method, message.params);
      }
    }
  }

  /**
   * processes buffered stdout data, extracting complete JSON-RPC messages
   *
   * messages are newline-delimited JSON. partial messages are kept in the
   * buffer until a complete line is received.
   */
  function processBuffer(): void {
    const lines = stdoutBuffer.split('\n');

    // keep the last incomplete line in the buffer
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      try {
        const message = JSON.parse(trimmed) as IncomingMessage;
        handleMessage(message);
      } catch {
        // skip non-JSON lines (e.g., server diagnostic output)
      }
    }
  }

  /**
   * writes a JSON-RPC message to the server's stdin
   * @param message message object to serialize and send
   */
  function writeMessage(message: Record<string, unknown>): void {
    if (serverProcess?.stdin?.writable) {
      serverProcess.stdin.write(`${JSON.stringify(message)}\n`);
    }
  }

  /**
   * sends a JSON-RPC request and waits for the matching response
   * @param method JSON-RPC method name
   * @param params optional parameters for the method
   * @returns the result field from the JSON-RPC response
   * @throws when the request times out or the server returns an error
   */
  async function send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = nextId;
    nextId += 1;
    lastRequestId = id;

    const message: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
    };

    if (params !== undefined) {
      message.params = params;
    }

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Request ${method} (id=${id}) timed out`));
      }, REQUEST_TIMEOUT_MS);

      pendingRequests.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      writeMessage(message);
    });
  }

  /**
   * sends a JSON-RPC notification to the server (no id field, fire-and-forget)
   *
   * notifications do not include an `id` field and the server is not expected
   * to send a response. used for cancellation and other one-way signals.
   * @param method JSON-RPC notification method name
   * @param params optional parameters for the notification
   */
  function sendNotification(
    method: string,
    params?: Record<string, unknown>,
  ): void {
    const message: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      method,
    };

    if (params !== undefined) {
      message.params = params;
    }

    writeMessage(message);
  }

  /**
   * sends an arbitrary raw string to the server without JSON parsing or envelope wrapping
   *
   * the provided string is written directly to stdin followed by a newline.
   * this enables edge-case testing such as malformed JSON and truncated payloads.
   * waits for a response line on stdout or times out after the standard timeout.
   * @param json raw string to write to stdin
   * @returns the raw stdio response with parsed and raw fields
   */
  async function sendRawMessage(json: string): Promise<RawStdioResponse> {
    return new Promise<RawStdioResponse>((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          serverProcess?.stdout?.removeListener('data', onData);
          resolve({ parsed: null, raw: null });
        }
      }, REQUEST_TIMEOUT_MS);

      const onData = (chunk: Buffer): void => {
        if (resolved) {
          return;
        }

        const lines = chunk.toString().split('\n');

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed) {
            continue;
          }

          resolved = true;
          clearTimeout(timeout);
          serverProcess?.stdout?.removeListener('data', onData);

          try {
            const parsed = JSON.parse(trimmed) as JsonRpcIncomingResponse;
            resolve({ parsed, raw: trimmed });
          } catch {
            resolve({ parsed: null, raw: trimmed });
          }

          return;
        }
      };

      serverProcess?.stdout?.on('data', onData);

      if (serverProcess?.stdin?.writable) {
        serverProcess.stdin.write(`${json}\n`);
      }
    });
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
   * registers a handler for server-initiated requests
   *
   * when the server sends a request (message with both method and id),
   * the handler is called and its return value is sent back as the response.
   * @param handler function that processes server requests and returns results
   */
  function onServerRequest(handler: ServerRequestHandler): void {
    serverRequestHandler = handler;
  }

  /**
   * registers a handler for server-initiated notifications
   *
   * when the server sends a notification (message with method but no id),
   * the handler is called. notifications are fire-and-forget, so no response
   * is sent back to the server.
   * @param handler function that processes server notifications
   */
  function onServerNotification(handler: ServerNotificationHandler): void {
    serverNotificationHandler = handler;
  }

  /**
   * closes the session by terminating the child process
   *
   * sends SIGTERM first, then SIGKILL after the grace period if the
   * process has not exited.
   */
  async function close(): Promise<void> {
    if (!serverProcess || serverProcess.killed) {
      return;
    }

    // reject all pending requests
    for (const [id, pending] of pendingRequests) {
      pending.reject(new Error('Session closed'));
      pendingRequests.delete(id);
    }

    serverProcess.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const onExit = (): void => {
        resolve();
      };

      serverProcess?.once('exit', onExit);

      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }

        resolve();
      }, KILL_GRACE_PERIOD_MS);
    });

    serverProcess = null;
  }

  // spawn the test server process
  serverProcess = spawn(config.command, config.args, {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // set up stdout data handling
  serverProcess.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    processBuffer();
  });

  // perform initialization handshake
  await send('initialize', {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: { roots: { listChanged: true }, sampling: { context: {}, tools: {} } },
    clientInfo: CLIENT_INFO,
  });

  // send initialized notification (fire-and-forget)
  writeMessage({
    jsonrpc: JSONRPC_VERSION,
    method: 'notifications/initialized',
  });

  return {
    get lastRequestId() {
      return lastRequestId;
    },
    send,
    sendNotification,
    sendRawMessage,
    callToolWithTask,
    onServerRequest,
    onServerNotification,
    close,
  };
}
