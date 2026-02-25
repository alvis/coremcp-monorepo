import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { vi } from 'vitest';

import type {
  InitializeResult,
  JsonRpcMessage,
  ListToolsResult,
} from '@coremcp/protocol';

import type { StdioConnectorParams } from '#types';

export class FakeProcess extends EventEmitter {
  public readonly stdin: PassThrough & {
    written: string[];
    getMessages: () => JsonRpcMessage[];
    clear: () => void;
  };
  public readonly stdout: PassThrough & {
    emitMessage: (message: JsonRpcMessage) => void;
    emitRaw: (data: string) => void;
    emitMessages: (...messages: JsonRpcMessage[]) => void;
    emitPartial: (data: string) => void;
  };
  public readonly stderr: PassThrough | null;
  public readonly pid: number;
  public killed = false;
  public exitCode: number | null = null;

  constructor(command?: string, args?: readonly string[]) {
    super();

    // create stdin with message capture
    const stdin = new PassThrough() as typeof this.stdin;
    stdin.written = [];
    stdin.on('data', (chunk: Buffer) => {
      stdin.written.push(chunk.toString());
    });
    stdin.on('close', () => {
      this.killed = true;
      this.emit('close', this.exitCode ?? 0, null);
    });
    stdin.getMessages = () => {
      return stdin.written
        .flatMap((data) => data.split('\n'))
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    };
    stdin.clear = () => {
      stdin.written = [];
    };
    this.stdin = stdin;

    // create stdout with emit helpers
    const stdout = new PassThrough() as typeof this.stdout;
    stdout.emitMessage = (message: JsonRpcMessage) => {
      stdout.push(JSON.stringify(message) + '\n');
    };
    stdout.emitRaw = (data: string) => {
      stdout.push(data);
    };
    stdout.emitMessages = (...messages: JsonRpcMessage[]) => {
      for (const message of messages) {
        stdout.emitMessage(message);
      }
    };
    stdout.emitPartial = (data: string) => {
      stdout.push(data); // no newline
    };
    this.stdout = stdout;

    this.stderr = null;
    this.pid = Math.floor(Math.random() * 10000);

    // initialize self-driving behavior if command/args provided
    if (command !== undefined || args !== undefined) {
      this.initializeDrivingBehavior(command ?? '', args);
    }
  }

  public kill(_signal?: NodeJS.Signals | number): boolean {
    if (this.killed) {
      return true; // Already killed
    }
    this.killed = true;
    // Use queueMicrotask for more immediate response
    queueMicrotask(() => {
      try {
        this.stdin.end();
      } catch {
        // Ignore errors when ending stdin
      }
      try {
        this.stdout.end();
      } catch {
        // Ignore errors when ending stdout
      }
    });

    return true;
  }

  public simulateCrash(code = 1): void {
    this.exitCode = code;
    this.killed = true;
    queueMicrotask(() => {
      try {
        this.stdin.end();
      } catch {
        // Ignore errors
      }
      try {
        this.stdout.end();
      } catch {
        // Ignore errors
      }
      this.emit('close', code, null);
    });
  }

  public simulateError(error: Error): void {
    this.emit('error', error);
  }

  public simulateExit(code = 0): void {
    this.exitCode = code;
    queueMicrotask(() => {
      try {
        this.stdin.end();
      } catch {
        // Ignore errors
      }
      try {
        this.stdout.end();
      } catch {
        // Ignore errors
      }
    });
  }

  /**
   * Initialize self-driving mock behavior based on command arguments
   * @param _command - The command used to spawn the process (unused)
   * @param args - Command-line arguments that control mock behavior
   */
  private initializeDrivingBehavior(
    _command: string,
    args: readonly string[] | undefined,
  ): void {
    const arr = args ?? [];
    const has = (flag: string): boolean => arr.includes(flag);

    // Drive behavior after listeners attach
    queueMicrotask(() => {
      // test scenario: spawn error
      if (has('--spawn-error')) {
        this.simulateError(new Error('ENOENT: command not found'));

        return;
      }

      // test scenario: crash before initialization
      if (has('--crash-before-init')) {
        this.simulateCrash(1);

        return;
      }

      // test scenario: malformed JSON before valid response
      if (has('--malformed-json')) {
        this.stdout.emitRaw('{"invalid": json}\n');
        // Then emit valid response
        this.stdout.emitMessage(sampleMessages.initializeResponse);
      }
      // test scenario: no response (for timeout tests)
      else if (has('--no-response')) {
        // Don't respond - for timeout tests
        return;
      }
      // test scenario: partial JSON messages
      else if (has('--partial-json')) {
        const response = sampleMessages.initializeResponse;
        const json = JSON.stringify(response);
        // Emit in chunks with a slight delay
        this.stdout.emitPartial(json.slice(0, 20));
        queueMicrotask(() => {
          this.stdout.emitRaw(json.slice(20) + '\n');
        });

        return;
      }
      // test scenario: multiple messages at once
      else if (has('--multiple-messages')) {
        this.stdout.emitMessages(
          {
            jsonrpc: '2.0',
            method: 'notifications/resources/list_changed',
            params: {},
          },
          sampleMessages.initializeResponse,
        );
      }
      // default: successful initialization
      else if (!has('--no-auto-init')) {
        this.stdout.emitMessage(sampleMessages.initializeResponse);
      }

      // Set up auto-responder for subsequent requests
      this.setupAutoResponder(arr);
    });
  }

  /**
   * set up auto-responder for incoming requests
   * @param args - Command-line arguments that control mock behavior
   */
  private setupAutoResponder(args: readonly string[]): void {
    const has = (flag: string): boolean => args.includes(flag);

    this.stdin.on('data', (chunk: Buffer) => {
      const lines = chunk
        .toString()
        .split('\n')
        .filter((line) => line.trim());

      for (const line of lines) {
        try {
          const msg = JSON.parse(line);

          // skip initialize requests (already handled)
          if ('method' in msg && msg.method === 'initialize') {
            continue;
          }

          // auto-respond based on method
          queueMicrotask(() => {
            if (!('method' in msg)) {
              return;
            }

            if (msg.method === 'tools/list') {
              this.stdout.emitMessage({
                jsonrpc: '2.0',
                id: msg.id,
                result: {
                  tools: has('--return-test-tool')
                    ? [
                        {
                          name: 'test_tool',
                          description: 'A test tool',
                          inputSchema: {
                            type: 'object',
                            properties: {},
                            required: [],
                          },
                        },
                      ]
                    : [],
                },
              });
            } else if (msg.method === 'tools/call') {
              if (
                'params' in msg &&
                msg.params &&
                typeof msg.params === 'object' &&
                'name' in msg.params
              ) {
                const params = msg.params as {
                  name: string;
                  arguments?: Record<string, unknown>;
                };
                this.stdout.emitMessage({
                  jsonrpc: '2.0',
                  id: msg.id,
                  result: {
                    content: [
                      {
                        type: 'text',
                        text:
                          (params.arguments?.message as string | undefined) ??
                          'echo',
                      },
                    ],
                  },
                });
              }
            } else if (msg.method === 'ping') {
              this.stdout.emitMessage({
                jsonrpc: '2.0',
                id: msg.id,
                result: {},
              });
            } else if (msg.method === 'prompts/list') {
              this.stdout.emitMessage({
                jsonrpc: '2.0',
                id: msg.id,
                result: { prompts: [] },
              });
            } else if (msg.method === 'resources/list') {
              this.stdout.emitMessage({
                jsonrpc: '2.0',
                id: msg.id,
                result: { resources: [] },
              });
            } else if (
              msg.method === 'unknown/method' ||
              has('--error-response')
            ) {
              this.stdout.emitMessage({
                jsonrpc: '2.0',
                id: msg.id,
                error: {
                  code: -32601,
                  message: 'Method not found',
                },
              });
            }
          });
        } catch {
          // Ignore parse errors
        }
      }
    });

    // special behavior for crash-after-connect test
    if (has('--crash-after-connect')) {
      // Wait a bit for connection to establish, then crash
      setTimeout(() => {
        this.simulateCrash(1);
      }, 100);
    }

    // special behavior for graceful exit after stdin close
    if (has('--graceful-exit-on-stdin-close')) {
      this.stdin.on('end', () => {
        setTimeout(() => {
          this.simulateExit(0);
        }, 50);
      });
    }

    // special behavior for exit after SIGTERM
    if (has('--exit-on-sigterm')) {
      // Prevent graceful exit by preventing stdin close from emitting 'close'
      this.stdin.removeAllListeners('close');

      const originalKill = this.kill.bind(this);
      this.kill = vi.fn((signal?: NodeJS.Signals | number) => {
        if (signal === 'SIGTERM') {
          this.exitCode = 0;
          setTimeout(() => {
            this.emit('close', 0, null);
          }, 50);

          return true;
        }

        return originalKill(signal);
      }) as unknown as typeof this.kill;
    }

    // special behavior for stdin close error
    if (has('--stdin-close-error')) {
      this.stdin.end = vi.fn((..._args: unknown[]) => {
        // Emit close event after throwing error so disconnect completes
        setTimeout(() => {
          this.emit('close', 0, null);
        }, 10);
        throw new Error('Stream already closed');
      }) as unknown as typeof this.stdin.end;
    }

    // special behavior for kill error
    if (has('--kill-error')) {
      // Prevent graceful exit by preventing stdin close from emitting 'close'
      this.stdin.removeAllListeners('close');

      // Mock kill to throw error on SIGKILL only (let SIGTERM pass)
      const originalKill = this.kill.bind(this);
      this.kill = vi.fn((signal?: NodeJS.Signals | number) => {
        if (signal === 'SIGTERM') {
          // Don't exit on SIGTERM - this forces SIGKILL attempt
          return true;
        }
        if (signal === 'SIGKILL') {
          // Throw error on SIGKILL to test error handling
          throw new Error('Failed to send SIGKILL: Process already terminated');
        }

        return originalKill(signal);
      }) as unknown as typeof this.kill;
    }
  }
}

/**
 * sample JSON-RPC messages for testing
 * All result objects properly extend JsonRpcResultData
 */
export const sampleMessages = {
  initializeRequest: {
    jsonrpc: '2.0' as const,
    id: 0,
    method: 'initialize' as const,
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  },

  initializeResponse: {
    jsonrpc: '2.0' as const,
    id: 0,
    result: {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
      },
      serverInfo: { name: 'test-server', version: '1.0.0' },
    } satisfies InitializeResult,
  },

  toolsListRequest: {
    jsonrpc: '2.0' as const,
    id: 2,
    method: 'tools/list' as const,
    params: {},
  },

  toolsListResponse: {
    jsonrpc: '2.0' as const,
    id: 2,
    result: {
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          } as import('@coremcp/protocol').Tool['inputSchema'],
        },
      ],
    } satisfies ListToolsResult,
  },

  notification: {
    jsonrpc: '2.0' as const,
    method: 'notifications/resources/list_changed' as const,
    params: {},
  },

  errorResponse: {
    jsonrpc: '2.0' as const,
    id: 3,
    error: {
      code: -32600,
      message: 'Invalid request',
    },
  },
};

/**
 * Helper to create test connector params
 * @param overrides optional parameter overrides to merge with defaults
 * @returns complete connector parameters for testing
 */
export function createTestParams(
  overrides: Partial<StdioConnectorParams> = {},
): StdioConnectorParams {
  return {
    name: 'test-connector',
    command: 'node',
    args: ['test-server.js'],
    clientInfo: { name: 'test-client', version: '1.0.0' },
    capabilities: {
      roots: { listChanged: true },
      sampling: {},
    },
    ...overrides,
  };
}
