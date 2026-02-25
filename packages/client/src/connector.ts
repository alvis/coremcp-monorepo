import {
  JSONRPC_VERSION,
  MCP_ERROR_CODES,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@coremcp/protocol';

import {
  initializeRequest,
  status,
  onMessage,
  connect,
  disconnect,
  send,
} from '#constants';

import { createMessageHandlers } from '#message-handlers';
import { RequestManager } from '#request-manager';

import type { Log } from '@coremcp/core';
import type {
  CallToolResult,
  CompleteResult,
  GetPromptResult,
  Implementation,
  InitializeRequest,
  InitializeResult,
  JsonifibleObject,
  JsonRpcMessage,
  JsonRpcNotificationData,
  JsonRpcNotificationEnvelope,
  JsonRpcRequestEnvelope,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  McpLogLevel,
  PingRequest,
  Prompt,
  PromptReference,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ResourceTemplateReference,
  ServerCapabilities,
  Tool,
} from '@coremcp/protocol';

import type { MessageHandlers } from '#message-handlers';
import type {
  McpConnectorParams,
  OnConnect,
  OnNotification,
  OnRequest,
  Status,
  StatusInfo,
} from '#types';

// Re-export symbols for testing
export { initializeRequest, status, onMessage, connect, disconnect, send };

export type {
  McpConnectorParams,
  Status,
  StatusInfo,
  OnConnect,
  OnMessage,
  OnRequest,
  OnNotification,
} from '#types';

/** manages connection to a single mcp server */
export abstract class McpConnector {
  /** name of the connector */
  #name: string;
  /** manages pending request lifecycle */
  #requestManager = new RequestManager();
  /** message handlers for routing incoming messages */
  #messageHandlers: MessageHandlers;
  /** server implementation information received during initialization */
  #serverInfo: Implementation | null = null;
  /** server capabilities received during initialization */
  #serverCapabilities: ServerCapabilities | null = null;
  /** negotiated protocol version */
  #protocolVersion: string | null = null;
  /** optional logger for debugging */
  #log?: Log;
  /** callback when connection is established */
  #onConnect?: OnConnect;
  /** handler for server-to-client requests */
  #onRequest: OnRequest;
  /** handler for server notifications */
  #onNotification?: OnNotification;

  protected [initializeRequest]: JsonRpcRequestEnvelope<InitializeRequest>;

  protected [status]: Status = 'disconnected';

  /**
   * creates a new client server instance
   * @param params configuration object for the connector
   * @param params.name name of the connector
   * @param params.clientInfo client implementation details
   * @param params.capabilities client supported capabilities
   * @param params.sessionStore optional session store for persistence
   * @param params.log optional logger for debugging
   * @param params.onRequest optional handler for server-to-client requests
   * @param params.onNotification optional handler for server notifications
   */
  constructor(params: McpConnectorParams) {
    const { clientInfo, capabilities, onRequest, onNotification, onConnect } =
      params;

    this.#name = params.name;
    this.#log = params.log;
    this.#onConnect = onConnect;
    this[initializeRequest] = {
      jsonrpc: JSONRPC_VERSION,
      id: 0, // set it to 0 such that #nextId can be 1
      method: 'initialize',
      params: {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
        clientInfo,
        capabilities,
      },
    };
    this.#onRequest =
      onRequest ??
      (async () => ({
        error: {
          code: MCP_ERROR_CODES.INVALID_REQUEST,
          message: 'client side request handling is not enabled',
        },
      }));
    this.#onNotification = onNotification;

    // Initialize message handlers
    this.#messageHandlers = createMessageHandlers({
      requestManager: this.#requestManager,
      log: this.#log,
      onRequest: this.#onRequest,
      onNotification: this.#onNotification,
      send: this[send].bind(this),
    });
  }

  /** unified connector information */
  public get info(): {
    name: string;
    serverInfo: Implementation | null;
    capabilities: ServerCapabilities | null;
    protocolVersion: string | null;
    isConnected: boolean;
    log: Log | undefined;
  } {
    return {
      name: this.#name,
      serverInfo: this.#serverInfo,
      capabilities: this.#serverCapabilities,
      protocolVersion: this.#protocolVersion,
      isConnected: this[status] === 'connected',
      log: this.#log,
    };
  }

  /** gets current transport status information */
  public get status(): StatusInfo {
    return {
      status: this[status],
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

  /**
   * cleanup method called when using 'using' declarations
   * note: signal listener cleanup is disabled as client may run in browser environments
   */
  public [Symbol.dispose](): void {
    // Signal listener cleanup intentionally disabled for browser compatibility
  }

  /**
   * establishes connection to the server and performs initialization handshake
   * @returns promise resolving to server initialization result
   */
  public async connect(): Promise<InitializeResult> {
    // if already connected, return existing promise
    if (this[status] !== 'disconnected') {
      this.#log?.(
        'warn',
        'Another active connection is on the way, ignoring connect request',
      );
      const existing = this.#requestManager.getRequest(0);

      return existing!.promise as Promise<InitializeResult>;
    }

    // register initialize request before connecting
    const promise = this.#requestManager.registerRequest<InitializeResult>(
      this[initializeRequest].id,
      this[initializeRequest].method,
    );

    try {
      this.#log?.('debug', `Connecting to ${this.#name}`);
      this[status] = 'connecting';
      await this[connect]();
      this.#log?.('info', `Successfully connected to ${this.#name}`);

      this.#onConnect?.();

      const result = await promise;

      this.#serverInfo = result.serverInfo;
      this.#serverCapabilities = result.capabilities;
      this.#protocolVersion = result.protocolVersion;
      this[status] = 'connected';

      void this.sendNotification('notifications/initialized');

      return result;
    } catch (exception) {
      this.#handleConnectionError(exception);
    }
  }

  /** disconnects from the server and cleans up resources */
  public async disconnect(): Promise<void> {
    if (this[status] === 'disconnected') {
      this.#log?.(
        'warn',
        `${this.#name} is not connected, ignoring stop request`,
      );

      return;
    }

    if (this[status] === 'connecting') {
      this.#requestManager.rejectRequest(
        0,
        new Error('Disconnection initiated while connection was in progress'),
      );
    }

    this.#log?.('debug', `Disconnecting ${this.#name}`);
    await this[disconnect]();
    this.#requestManager.clear();
    this.#requestManager.resetIdCounter();
    this.#serverInfo = null;
    this.#serverCapabilities = null;
    this.#protocolVersion = null;
    this[status] = 'disconnected';
    this.#log?.('info', `Disconnected ${this.#name} successfully`);
  }

  /**
   * sends a request to the server and waits for response
   * @param request - json-rpc request object
   * @returns promise resolving to response result
   * @throws {Error} if not connected or request fails
   * @template T - the expected response type
   */
  public async sendRequest<T = unknown>(
    request: Pick<JsonRpcRequestEnvelope, 'method' | 'params'>,
  ): Promise<T> {
    if (this[status] !== 'connected') {
      throw new Error(`Cannot send request to ${this.#name}: not connected`);
    }

    const { message, promise } = this.#requestManager.createRequest<T>(
      request.method,
      request.params,
    );

    this.#log?.('debug', 'sending a request to the server', message);
    this[send](message).catch((error: unknown) =>
      this.#requestManager.rejectRequest(
        message.id,
        error instanceof Error ? error : new Error(String(error)),
      ),
    );

    return promise;
  }

  /**
   * requests autocompletion for prompt or resource arguments
   * @param ref - reference to the prompt or resource template
   * @param argument - argument to autocomplete
   * @param argument.name - name of the argument to complete
   * @param argument.value - partial value to complete from
   * @returns completion suggestions
   */
  public async complete(
    ref: PromptReference | ResourceTemplateReference,
    argument: { name: string; value: string },
  ): Promise<CompleteResult> {
    return this.sendRequest<CompleteResult>({
      method: 'completion/complete',
      params: { ref, argument },
    });
  }

  /**
   * retrieves a specific prompt by name with optional arguments
   * @param name - name of the prompt to retrieve
   * @param args - optional arguments to pass to the prompt
   * @returns prompt content and metadata
   */
  public async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    return this.sendRequest<GetPromptResult>({
      method: 'prompts/get',
      params: { name, arguments: args },
    });
  }

  /**
   * lists all prompts available from this server
   * @returns array of all available prompts
   */
  public async listPrompts(): Promise<Prompt[]> {
    return this.#fetchAllPaginated<ListPromptsResult, Prompt>(
      'prompts/list',
      (result) => result.prompts,
      (result) => result.nextCursor,
    );
  }

  /**
   * reads the content of a specific resource by uri
   * @param uri - unique identifier for the resource
   * @returns resource content and metadata
   */
  public async readResource(uri: string): Promise<ReadResourceResult> {
    return this.sendRequest<ReadResourceResult>({
      method: 'resources/read',
      params: { uri },
    });
  }

  /**
   * lists all resources available from this server
   * @returns array of all available resources
   */
  public async listResources(): Promise<Resource[]> {
    return this.#fetchAllPaginated<ListResourcesResult, Resource>(
      'resources/list',
      (result) => result.resources,
      (result) => result.nextCursor,
    );
  }

  /**
   * lists all resource templates available from this server
   * @returns array of all available resource templates
   */
  public async listResourceTemplates(): Promise<ResourceTemplate[]> {
    return this.#fetchAllPaginated<
      ListResourceTemplatesResult,
      ResourceTemplate
    >(
      'resources/templates/list',
      (result) => result.resourceTemplates,
      (result) => result.nextCursor,
    );
  }

  /**
   * lists all tools available from this server
   * @returns array of all available tools
   */
  public async listTools(): Promise<Tool[]> {
    return this.#fetchAllPaginated<ListToolsResult, Tool>(
      'tools/list',
      ({ tools }) => tools,
      ({ nextCursor }) => nextCursor,
    );
  }

  /**
   * sets the logging level for this server
   * @param level - desired log level (error, warn, info, debug)
   */
  public async setLogLevel(level: McpLogLevel): Promise<void> {
    await this.sendRequest<void>({
      method: 'logging/setLevel',
      params: { level },
    });
  }

  /**
   * calls a tool on this server
   * @param name - name of the tool to invoke
   * @param args - optional arguments to pass to the tool
   * @returns tool execution result
   */
  public async callTool(
    name: string,
    args?: JsonifibleObject,
  ): Promise<CallToolResult> {
    return this.sendRequest<CallToolResult>({
      method: 'tools/call',
      params: { name, arguments: args },
    });
  }

  /**
   * subscribes to updates for a specific resource
   * @param uri - unique identifier for the resource to subscribe to
   */
  public async subscribeToResource(uri: string): Promise<void> {
    await this.sendRequest<void>({
      method: 'resources/subscribe',
      params: { uri },
    });
  }

  /**
   * unsubscribes from resource updates
   * @param uri - unique identifier for the resource to unsubscribe from
   */
  public async unsubscribeFromResource(uri: string): Promise<void> {
    await this.sendRequest<void>({
      method: 'resources/unsubscribe',
      params: { uri },
    });
  }

  /** sends a ping request to check server health */
  public async ping(): Promise<void> {
    await this.sendRequest<void>({
      method: 'ping',
      params: undefined,
    } satisfies PingRequest);
  }

  /**
   * sends a notification to the server without expecting a response
   * @param method notification method name
   * @param params json-rpc notification object
   * @throws {Error} if not connected
   */
  public async sendNotification(
    method: `notifications/${string}`,
    params?: JsonRpcNotificationData,
  ): Promise<void> {
    if (this[status] !== 'connected') {
      throw new Error(
        `Cannot send notification to ${this.#name}: not connected`,
      );
    }

    const message: JsonRpcNotificationEnvelope = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    };

    this.#log?.('debug', 'sending a notification to the server', message);

    await this[send](message);
  }

  /**
   * handles incoming messages from the server
   * @param message json-rpc message received from server
   */
  protected async [onMessage](message: JsonRpcMessage): Promise<void> {
    if (message.error) {
      this.#messageHandlers.handleError(message);
    } else if (message.id !== undefined) {
      if (message.result) {
        this.#messageHandlers.handleSuccess(message);
      } else {
        await this.#messageHandlers.handleRequest(message);
      }
    } else {
      this.#messageHandlers.handleNotification(message);
    }
  }

  protected abstract [connect](): Promise<void>;
  protected abstract [disconnect](): Promise<void>;
  protected abstract [send](message: JsonRpcMessage): Promise<void>;

  /**
   * recursively fetches all paginated results using nextcursor
   * @param method the method to call for fetching results
   * @param extractItems function to extract items from the result
   * @param extractNextCursor function to extract next cursor from the result
   * @param cursor optional starting cursor
   * @returns promise resolving to all items across all pages
   */
  async #fetchAllPaginated<TResult, TItem>(
    method: `${string}/list`,
    extractItems: (result: TResult) => TItem[],
    extractNextCursor: (result: TResult) => string | undefined,
    cursor?: string,
  ): Promise<TItem[]> {
    const allItems: TItem[] = [];
    let currentCursor = cursor;

    do {
      const request = {
        method,
        params: { cursor: currentCursor },
      };

      const result = await this.sendRequest<TResult>(request);
      const items = extractItems(result);
      allItems.push(...items);
      currentCursor = extractNextCursor(result);
    } while (currentCursor);

    return allItems;
  }

  /**
   * handles connection errors and cleanup
   * @param exception - the error that occurred during connection
   */
  #handleConnectionError(exception: unknown): never {
    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    this.#log?.('error', `Failed to connect to ${this.#name}`, {
      message: error.message,
      stack: error.stack,
    });
    this[status] = 'disconnected';
    throw exception;
  }
}
