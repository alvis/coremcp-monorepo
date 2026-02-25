import { createInterface } from 'node:readline';

import { generateBase62Uuid, jsonifyError } from '@coremcp/core';

import {
  JSONRPC_VERSION,
  JsonRpcError,
  MCP_ERROR_CODES,
  validateJsonRpcMessage,
} from '@coremcp/protocol';

import { ServerTransport, start, stop } from '@coremcp/server/transport';

import type { Interface } from 'node:readline';

import type { Session } from '@coremcp/core';

import type { JsonRpcMessage } from '@coremcp/protocol';
import type {
  ConnectionContext,
  ServerTransportOptions,
} from '@coremcp/server/transport';

export interface StdioServerTransportOptions extends ServerTransportOptions {}

/** maximum characters for message preview */
const PREVIEW_MAX_LENGTH = 30;

const controller = new AbortController();
const { signal: shutdownSignal } = controller;

process.once('SIGINT', () => controller.abort('aborted by SIGINT'));

process.once('SIGTERM', () => controller.abort('aborted by SIGTERM'));

/** STDIO transport implementation for MCP communication */
export class McpStdioServerTransport extends ServerTransport {
  /** readline interface for processing stdin */
  #rl: Interface;
  #session?: Session;

  /**
   * creates a new STDIO transport instance
   * @param options configuration options for the STDIO transport
   */
  constructor(options: StdioServerTransportOptions) {
    super(options);

    this.#rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
  }

  /**
   * parses and validates a JSON-RPC message from a raw input line
   * @param line the raw JSON string to parse and validate
   * @returns the validated JsonRpcMessage or void if parsing fails
   */
  #parseLine(line: string): JsonRpcMessage | void {
    try {
      // parse and validate the JSON-RPC message format
      const message = validateJsonRpcMessage(JSON.parse(line));

      this.log?.('debug', `request method: ${message.method}`);
      this.log?.('trace', 'receiving message', { payload: message });

      return message;
    } catch (error) {
      // log parsing errors with context for debugging
      this.log?.('error', 'failed to parse or process JSON-RPC message', {
        error: jsonifyError(error),
        rawMessage: line,
        messageLength: line.length,
      });
    }
  }

  /** starts listening for messages on stdin */
  public async [start](): Promise<void> {
    const { promise: waitUntilClosed, resolve } = Promise.withResolvers<void>();
    shutdownSignal.addEventListener('abort', () => resolve(), {
      once: true, // remove the listener when the process is terminated
    });

    const context: ConnectionContext = {
      channelId: generateBase62Uuid(),
      transport: 'stdio',
      abortSignal: shutdownSignal,
      waitUntilClosed,
      write: this.#send.bind(this),
    };

    this.#rl.on('line', async (line) => {
      this.log?.('debug', `message arrived on stdin`, {
        rawLength: line.length,
        hasContent: line.trim().length > 0,
      });

      const trimmedLine = line.trim();

      // skip empty lines to avoid parsing errors
      if (trimmedLine === '') {
        return;
      }

      const message = this.#parseLine(trimmedLine);

      // if (message.method  context.sessionId === undefined) {
      //   await this.#send({
      //     jsonrpc: JSONRPC_VERSION,
      //     id: message.id,
      //     error: {
      //       code: MCP_ERROR_CODES.INVALID_REQUEST,
      //       message: `Session not initialized: received '${message.method}' before 'initialize' request. Send 'initialize' request first to establish session.`,
      //     },
      //   });
      // } else {

      if (message) {
        try {
          await this.server.handleMessage(message, context, {
            onInitialize: (session) => {
              // update the session id such that it can be used for the next message
              context.sessionId = session.id;
            },
          });
        } catch (exception) {
          this.log?.(
            'error',
            'failed to handle message',
            jsonifyError(exception),
          );

          if (exception instanceof JsonRpcError) {
            // send error response for messages received before initialization
            await this.#send({
              jsonrpc: JSONRPC_VERSION,
              id: message.id,
              error: {
                code: exception.code,
                message:
                  exception.code === MCP_ERROR_CODES.INVALID_REQUEST &&
                  exception.message === 'Session ID is required' // an exception case to indicate why session id could be missing
                    ? `Session not initialized: received '${message.method}' before 'initialize' request. Send 'initialize' request first to establish session.`
                    : exception.message,
              },
            });
          }
        }
      }
    });

    this.log?.('info', 'STDIO transport listener started successfully');
  }

  /**
   * stops the transport and closes the readline interface
   */
  public async [stop](): Promise<void> {
    this.log?.('info', 'stopping STDIO transport', {
      hasActiveSession: !!this.#session,
      sessionId: this.#session?.id,
    });

    this.#rl.close();
    this.#session = undefined;

    this.log?.('info', 'STDIO transport stopped successfully');
  }

  /**
   * sends a json-rpc message to stdout
   * @param message the message to send
   * @throws {TypeError} when message cannot be serialized (e.g., circular references)
   */
  async #send(message: JsonRpcMessage): Promise<void> {
    this.log?.('debug', 'Preparing to send message', {
      messageType:
        'error' in message
          ? 'error'
          : 'result' in message
            ? 'response'
            : 'id' in message
              ? 'request'
              : 'notification',
      messageId: message.id,
      method: message.method,
    });

    this.log?.('trace', 'Sending message', { payload: message });

    const json = JSON.stringify(message);

    this.log?.('debug', 'Sending message to stdout', {
      messageSize: json.length,
      preview:
        json.substring(0, PREVIEW_MAX_LENGTH) +
        (json.length > PREVIEW_MAX_LENGTH ? '...' : ''),
    });

    // write message followed by newline delimiter
    return new Promise((resolve, reject) => {
      process.stdout.write(json + '\n', (error) => {
        if (error) {
          this.log?.(
            'error',
            'Failed to write message to stdout',
            jsonifyError(error),
          );
          reject(error);
        } else {
          this.log?.('debug', 'Message sent to stdout successfully');
          resolve();
        }
      });
    });
  }
}
