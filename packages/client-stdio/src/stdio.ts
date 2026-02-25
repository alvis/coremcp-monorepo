import { spawn } from 'node:child_process';

import {
  McpConnector,
  connect,
  disconnect,
  initializeRequest,
  onMessage,
  send,
  status,
} from '@coremcp/client/connector';

import { jsonifyError } from '@coremcp/core';

import { GRACEFUL_TIMEOUT_MS, SIGTERM_TIMEOUT_MS } from '#constants';

import type { ChildProcess } from 'node:child_process';

import type { JsonRpcMessage } from '@coremcp/protocol';

import type { StdioConnectorParams } from '#types';

/**
 * stdio transport implementation for MCP communication
 * This connector spawns a child process and communicates with it via stdin/stdout
 * using line-delimited JSON (JSON-RPC 2.0). It handles process lifecycle management
 * including graceful shutdown with a fallback escalation sequence: stdin close →
 * SIGTERM → SIGKILL.
 * @example
 * ```typescript
 * const connector = new StdioConnector({
 *   name: 'my-server',
 *   command: 'node',
 *   args: ['server.js'],
 *   clientInfo: { name: 'my-client', version: '1.0.0' },
 *   capabilities: { roots: { listChanged: true } }
 * });
 *
 * await connector.connect();
 * const tools = await connector.listTools();
 * await connector.disconnect();
 * ```
 */
export class StdioConnector extends McpConnector {
  #command: string;
  #args: string[];
  #env?: Record<string, string>;

  /** spawned child server process for server communication */
  #serverProcess?: ChildProcess;

  /**
   * creates a new stdio transport connector
   * @param params - Configuration object containing command and arguments
   * @param params.command - Command to spawn (e.g., 'node', '/usr/bin/python')
   * @param params.args - Optional command-line arguments for the spawned process
   * @param params.env - Optional environment variables to pass to the spawned process
   * @param params.name - Connector name for identification
   * @param params.clientInfo - Client information for the MCP protocol
   * @param params.capabilities - Client capabilities for the MCP protocol
   * @param params.log - Optional logging function
   * The command will be spawned when {@link connect} is called, not during construction.
   */
  constructor(params: StdioConnectorParams) {
    super(params);

    this.#command = params.command;
    this.#args = params.args ?? [];
    this.#env = params.env;
  }

  /**
   * sends a message through stdin to the spawned process
   * @param message - JSON-RPC 2.0 message to send to the server
   * @returns Promise that resolves when the message is written to stdin
   * @throws {Error} when writing to stdin fails
   * Messages are serialized as line-delimited JSON (JSONL format).
   * This method is only called after the connection is established.
   * @internal
   */
  public async [send](message: JsonRpcMessage): Promise<void> {
    // NOTE: the only places that call [send] are connect (after spawning the process) and the public send method in the base class (which checks status === 'connected' first)

    const jsonl = JSON.stringify(message) + '\n';

    return new Promise<void>((resolve, reject) => {
      this.#serverProcess!.stdin?.write(jsonl, (error) => {
        if (error) {
          this.info.log?.(
            'error',
            'Failed to write message to child process stdin',
            jsonifyError(error),
          );
          reject(error);
        } else {
          this.info.log?.('debug', 'Message sent to child process stdin');
          resolve();
        }
      });
    });
  }

  /**
   * establishes connection by spawning child process and sending initialization request
   * @returns Promise that resolves when the server responds to initialization
   * @throws {Error} when the command fails to spawn or initialization times out
   * This method:
   * 1. Spawns the configured command as a child process with piped stdin/stdout
   * 2. Sets up message handling for line-delimited JSON from stdout
   * 3. Sets up error and close event handlers
   * 4. Sends the MCP initialization request
   * 5. Waits for the initialization response (handled by base class)
   *
   * The spawned process will inherit stderr for debugging output.
   * @internal
   */
  public async [connect](): Promise<void> {
    this.#serverProcess = spawn(this.#command, this.#args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: this.#env ?? process.env,
    });

    /** buffer for accumulating partial json messages */
    let buffer = '';

    this.#serverProcess.stdout?.setEncoding('utf8');
    this.#serverProcess.stdout?.on('data', async (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete line in buffer

      for (const line of lines) {
        const message = this.#parseLine(line.trim());
        if (message) {
          await this[onMessage](message);
        }
      }
    });

    this.#serverProcess.on('error', (error) => {
      this.info.log?.(
        'error',
        'Failed to communicate with the child process',
        jsonifyError(error),
      );
    });

    this.#serverProcess.on('close', (code) => {
      this[status] = 'disconnected';
      this.info.log?.('info', 'MCP server process terminated', {
        exitCode: code,
      });
    });

    // send the initialize message

    await this[send](this[initializeRequest]);
  }

  /**
   * parses a line of JSON text into a JSON-RPC message
   * @param line - Raw JSON string to parse (without newline)
   * @returns Parsed JSON-RPC message, or undefined if parsing fails
   * Malformed JSON is logged as a warning but does not throw an error.
   * This allows the connection to continue even if individual messages are corrupted.
   */
  #parseLine(line: string): JsonRpcMessage | void {
    try {
      return JSON.parse(line) as JsonRpcMessage;
    } catch (error) {
      this.info.log?.(
        'warn',
        'Received malformed JSON message from child process',
        {
          line,
          error: jsonifyError(error),
        },
      );
    }
  }

  /**
   * creates a promise that resolves when the process exits or times out
   * @param serverProcess - the child process to wait for
   * @param timeoutMs - maximum time to wait in milliseconds
   * @returns promise resolving to true if process exited, false if timed out
   */
  async #waitForProcessExit(
    serverProcess: ChildProcess,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      serverProcess.once('close', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /**
   * attempts to close the stdin stream of the child process
   * @param serverProcess - the child process whose stdin to close
   */
  #closeStdin(serverProcess: ChildProcess): void {
    try {
      serverProcess.stdin?.end();
      this.info.log?.(
        'debug',
        'Closed stdin stream to initiate graceful shutdown',
      );
    } catch (error) {
      this.info.log?.(
        'warn',
        'Failed to close stdin stream',
        jsonifyError(error),
      );
    }
  }

  /**
   * sends a signal to the child process
   * @param serverProcess - the child process to signal
   * @param signal - the signal to send (SIGTERM or SIGKILL)
   * @throws {Error} when sending SIGKILL fails
   */
  #sendSignal(
    serverProcess: ChildProcess,
    signal: 'SIGTERM' | 'SIGKILL',
  ): void {
    try {
      serverProcess.kill(signal);
      const level = signal === 'SIGKILL' ? 'warn' : 'debug';
      const message =
        signal === 'SIGKILL'
          ? 'Force killed process with SIGKILL'
          : `Sent ${signal} to process`;
      this.info.log?.(level, message);
    } catch (error) {
      const level = signal === 'SIGKILL' ? 'error' : 'warn';
      const message =
        signal === 'SIGKILL'
          ? 'Failed to force kill child process'
          : `Failed to send ${signal}`;
      this.info.log?.(level, message, jsonifyError(error));

      if (signal === 'SIGKILL') {
        throw error;
      }
    }
  }

  /**
   * terminates the spawned process and cleans up resources
   * @returns Promise that resolves when the process is terminated
   * @throws {Error} when force killing the process fails (only in final SIGKILL stage)
   * Implements a graceful shutdown sequence with escalating termination signals:
   *
   * 1. **Stage 1: Stdin close (3 second timeout)**
   *    - Closes the stdin stream to signal the server to exit gracefully
   *    - Many well-behaved servers will exit when stdin is closed
   *
   * 2. **Stage 2: SIGTERM (5 second timeout)**
   *    - Sends SIGTERM signal for normal termination
   *    - Allows the server to perform cleanup operations
   *
   * 3. **Stage 3: SIGKILL (immediate)**
   *    - Force kills the process if it hasn't responded to previous signals
   *    - This stage will throw if it fails
   *
   * Errors during stdin close or SIGTERM are logged but don't prevent
   * escalation to the next stage.
   * @internal
   */
  public async [disconnect](): Promise<void> {
    const serverProcess = this.#serverProcess;

    if (!serverProcess) {
      return; // already disconnected
    }

    // stop processing events BEFORE clearing process reference
    // this prevents race conditions where buffered stdout data triggers
    // message handling after #serverProcess is cleared
    serverProcess.stdout?.removeAllListeners('data');
    serverProcess.removeAllListeners('close');
    serverProcess.removeAllListeners('error');

    // clear reference to prevent double disconnect attempts
    this.#serverProcess = undefined;
    this[status] = 'disconnecting';

    // stage 1: close stdin to signal graceful shutdown
    const gracefulExitPromise = this.#waitForProcessExit(
      serverProcess,
      GRACEFUL_TIMEOUT_MS,
    );
    this.#closeStdin(serverProcess);

    if (await gracefulExitPromise) {
      this.info.log?.('debug', 'Process exited gracefully after stdin close');
      this[status] = 'disconnected';

      return;
    }

    // stage 2: send SIGTERM
    const sigtermExitPromise = this.#waitForProcessExit(
      serverProcess,
      SIGTERM_TIMEOUT_MS,
    );
    this.#sendSignal(serverProcess, 'SIGTERM');

    if (await sigtermExitPromise) {
      this.info.log?.('debug', 'Process exited after SIGTERM');
      this[status] = 'disconnected';

      return;
    }

    // stage 3: force kill with SIGKILL
    this.#sendSignal(serverProcess, 'SIGKILL');
    this[status] = 'disconnected';
  }
}
