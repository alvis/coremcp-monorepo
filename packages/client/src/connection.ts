import type { Log, SessionStore } from '@coremcp/core';
import type {
  ClientCapabilities,
  Implementation,
  InitializeResult,
  JsonRpcErrorData,
  JsonRpcResultData,
  McpLogLevel,
  McpServerNotification,
  McpServerRequest,
} from '@coremcp/protocol';

import type { McpConnector, McpConnectorParams } from '#connector';

/** factory function that creates a connector instance */
export type CreateConnector = (
  params: Omit<McpConnectorParams, 'name'>,
) => McpConnector;

/** parameters for creating a connection manager */
export interface ConnectionManagerParams {
  info: Implementation;
  capabilities: ClientCapabilities;
  sessionStore?: SessionStore;
  log?: Log;
  onRequest: (
    request: McpServerRequest,
  ) => Promise<{ result: JsonRpcResultData } | { error: JsonRpcErrorData }>;
  onNotification: (
    connector: McpConnector,
    notification: McpServerNotification,
  ) => Promise<void>;
}

/**
 * manages server connections for an mcp client
 * handles connection lifecycle, initialization handshake, and server communication
 */
export class ConnectionManager {
  readonly #connectors = new Map<string, McpConnector>();
  readonly #info: Implementation;
  readonly #capabilities: ClientCapabilities;
  readonly #sessionStore: SessionStore | undefined;
  readonly #log: Log | undefined;
  readonly #onRequest: (
    request: McpServerRequest,
  ) => Promise<{ result: JsonRpcResultData } | { error: JsonRpcErrorData }>;
  readonly #onNotification: (
    connector: McpConnector,
    notification: McpServerNotification,
  ) => Promise<void>;

  /**
   * creates a new connection manager instance
   * @param params - configuration parameters for the connection manager
   */
  constructor(params: ConnectionManagerParams) {
    this.#info = params.info;
    this.#capabilities = params.capabilities;
    this.#sessionStore = params.sessionStore;
    this.#log = params.log;
    this.#onRequest = params.onRequest;
    this.#onNotification = params.onNotification;
  }

  /** exposes connectors map for shared access by other managers */
  public get connectors(): Map<string, McpConnector> {
    return this.#connectors;
  }

  /**
   * connects to a new server and performs initialization handshake
   * @param createConnector factory function that creates the connector instance
   * @returns the initialization result from the server
   * @throws {Error} if server is already connected
   */
  public async connect(
    createConnector: CreateConnector,
  ): Promise<InitializeResult> {
    using connector = createConnector({
      clientInfo: this.#info,
      capabilities: this.#capabilities,
      sessionStore: this.#sessionStore,
      log: this.#log,
      onRequest: this.#onRequest,
      onNotification: async (notification) =>
        this.#onNotification(connector, notification),
    });

    if (this.#connectors.has(connector.info.name)) {
      throw new Error(
        `Cannot connect to ${connector.info.name}: server is already connected`,
      );
    }
    const result = await connector.connect();
    this.#connectors.set(connector.info.name, connector);

    return result;
  }

  /**
   * disconnects from a server by name
   * @param name the name of the server to disconnect from
   * @throws {Error} if server not found
   */
  public async disconnect(name: string): Promise<void> {
    const server = this.#connectors.get(name);
    if (!server) {
      throw new Error(`Cannot disconnect from ${name}: server not found`);
    }
    await server.disconnect();
    this.#connectors.delete(name);
  }

  /** disconnects from all connected servers and cleans up resources */
  public async disconnectAll(): Promise<void> {
    const promises = Array.from(this.#connectors.values()).map(async (server) =>
      server.disconnect(),
    );
    await Promise.all(promises);
    this.#connectors.clear();
  }

  /**
   * gets a connected server instance by name
   * @param name the name of the server to get
   * @returns the server connector if found, undefined otherwise
   */
  public getServer(name: string): McpConnector | undefined {
    return this.#connectors.get(name);
  }

  /**
   * lists all connected servers
   * @returns a record of server names to connector instances
   */
  public listServers(): Record<string, McpConnector> {
    return Object.fromEntries(this.#connectors.entries());
  }

  /**
   * sets log level for all connected servers
   * @param level the log level to set
   */
  public async setLogLevel(level: McpLogLevel): Promise<void> {
    const promises = Array.from(this.#connectors.values()).map(async (server) =>
      server.setLogLevel(level),
    );
    await Promise.all(promises);
  }
}
