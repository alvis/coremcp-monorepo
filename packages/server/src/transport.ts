import type { Log } from '@coremcp/core';

import type { McpMessage } from '@coremcp/protocol';

import type { McpServer } from '#server';

export type { ConnectionContext } from '#types/connection';

/** handles messages received from a client */
export type OnMessage = (
  message: McpMessage['message'],
) => Promise<McpMessage['reply']>;

/** symbol for the protected start method that initializes the transport */
export const start = Symbol('start');

/** symbol for the protected stop method that shuts down the transport */
export const stop = Symbol('stop');

/** symbol for the protected log method that handles transport logging */
export const log = Symbol('log');

/** symbol for the protected handleMessage method that processes incoming messages */
export const handleMessage = Symbol('handleMessage');

/** symbol for the protected initializeSession method that sets up client sessions */
export const initializeSession = Symbol('initializeSession');

/** symbol for the protected terminateSession method that cleans up client sessions */
export const terminateSession = Symbol('terminateSession');

/** configuration options for initializing a server transport */
export interface ServerTransportOptions {
  /** logs transport operations */
  log?: Log;
  /** the MCP server instance that will handle protocol messages */
  mcpServer: McpServer;
}

/** abstract base class for mcp transport implementations */
export abstract class ServerTransport {
  #server: McpServer;
  #isServerStarted: boolean;
  #log?: Log;

  /**
   * creates a new transport instance with the specified configuration
   * @param options transport configuration options including MCP server and optional logger
   */
  constructor(options: ServerTransportOptions) {
    this.#isServerStarted = false;
    this.#log = options.log;
    this.#server = options.mcpServer;

    // handle clean shutdown with enhanced logging
    process.on('SIGINT', async () => {
      this.#log?.(
        'info',
        'received SIGINT signal, initiating graceful shutdown',
      );
      await this.stop();
    });

    process.on('SIGTERM', async () => {
      this.#log?.(
        'info',
        'received SIGTERM signal, initiating graceful shutdown',
      );
      await this.stop();
    });
  }

  /** the underlying MCP server instance */
  public get server(): McpServer {
    return this.#server;
  }

  /** optional logger for transport operations */
  public get log(): Log | undefined {
    return this.#log;
  }

  /**
   * gets transport status and diagnostic information
   * @returns transport status object with detailed information
   */
  public get status(): {
    started: boolean;
    transport: string;
    processInfo: {
      pid: number;
      nodeVersion: string;
      platform: string;
      arch: string;
      uptime: number;
    };
    timestamp: string;
  } {
    return {
      started: this.#isServerStarted,
      transport: this.constructor.name,
      processInfo: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  public abstract [start](): Promise<void>;

  public abstract [stop](): Promise<void>;

  /** starts the transport and begins listening for messages */
  public async start(): Promise<void> {
    if (this.#isServerStarted) {
      this.#log?.(
        'warn',
        'transport server already started, ignoring start request',
      );

      return;
    }

    this.#log?.('info', 'initializing transport server startup sequence');

    await this[start]();
    this.#isServerStarted = true;

    this.#log?.(
      'info',
      'transport server started successfully and ready for connections',
    );
  }

  /** stops the transport and releases resources */
  public async stop(): Promise<void> {
    if (!this.#isServerStarted) {
      this.#log?.(
        'warn',
        'transport server not currently running, ignoring stop request',
      );

      return;
    }

    this.#log?.('info', 'initiating transport server shutdown sequence');

    await this[stop]();
    this.#isServerStarted = false;

    this.#log?.('info', 'transport server shutdown completed successfully');
  }
}
