import {
  JSONRPC_VERSION,
  MCP_ERROR_CODES,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@coremcp/protocol';

import { handleConnectionError } from '#connector/error';
import { sendNotification } from '#connector/notification';
import { complete, getPrompt, listPrompts } from '#connector/prompts';
import {
  listResources,
  listResourceTemplates,
  readResource,
  subscribeToResource,
  unsubscribeFromResource,
} from '#connector/resources';
import { callTool, listTools, ping, setLogLevel } from '#connector/tools';
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
  CancelTaskResult,
  CallToolResult,
  CompleteResult,
  CreateTaskResult,
  GetTaskPayloadResult,
  GetPromptResult,
  GetTaskResult,
  Implementation,
  InitializeRequest,
  InitializeResult,
  JsonifibleObject,
  JsonRpcMessage,
  JsonRpcNotificationData,
  JsonRpcRequestEnvelope,
  ListTasksResult,
  McpLogLevel,
  Prompt,
  PromptReference,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ResourceTemplateReference,
  ServerCapabilities,
  TaskMetadata,
  Tool,
} from '@coremcp/protocol';

import type { MessageHandlers } from '#message-handlers';

import type {
  ConnectorInfo,
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

    this.#messageHandlers = createMessageHandlers({
      requestManager: this.#requestManager,
      log: this.#log,
      onRequest: this.#onRequest,
      onNotification: this.#onNotification,
      send: this[send].bind(this),
    });
  }

  /** unified connector information */
  public get info(): ConnectorInfo {
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
    if (this[status] !== 'disconnected') {
      this.#log?.(
        'warn',
        'Another active connection is on the way, ignoring connect request',
      );
      const existing = this.#requestManager.getRequest(0);

      return existing!.promise as Promise<InitializeResult>;
    }

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
      handleConnectionError(exception, {
        log: this.#log,
        name: this.#name,
        onDisconnect: () => {
          this[status] = 'disconnected';
        },
      });
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
   * @param request json-rpc request object
   * @returns promise resolving to response result
   * @throws {Error} if not connected or request fails
   * @template T the expected response type
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
   * @param ref reference to the prompt or resource template
   * @param argument argument to autocomplete
   * @param argument.name name of the argument to complete
   * @param argument.value partial value to complete from
   * @returns completion suggestions
   */
  public async complete(
    ref: PromptReference | ResourceTemplateReference,
    argument: { name: string; value: string },
  ): Promise<CompleteResult> {
    return complete(this.sendRequest.bind(this), ref, argument);
  }

  /**
   * retrieves a specific prompt by name with optional arguments
   * @param name name of the prompt to retrieve
   * @param args optional arguments to pass to the prompt
   * @returns prompt content and metadata
   */
  public async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    return getPrompt(this.sendRequest.bind(this), name, args);
  }

  /**
   * lists all prompts available from this server
   * @returns array of all available prompts
   */
  public async listPrompts(): Promise<Prompt[]> {
    return listPrompts(this.sendRequest.bind(this));
  }

  /**
   * reads the content of a specific resource by uri
   * @param uri unique identifier for the resource
   * @returns resource content and metadata
   */
  public async readResource(uri: string): Promise<ReadResourceResult> {
    return readResource(this.sendRequest.bind(this), uri);
  }

  /**
   * lists all resources available from this server
   * @returns array of all available resources
   */
  public async listResources(): Promise<Resource[]> {
    return listResources(this.sendRequest.bind(this));
  }

  /**
   * lists all resource templates available from this server
   * @returns array of all available resource templates
   */
  public async listResourceTemplates(): Promise<ResourceTemplate[]> {
    return listResourceTemplates(this.sendRequest.bind(this));
  }

  /**
   * lists all tools available from this server
   * @returns array of all available tools
   */
  public async listTools(): Promise<Tool[]> {
    return listTools(this.sendRequest.bind(this));
  }

  /**
   * sets the logging level for this server
   * @param level desired log level (error, warn, info, debug)
   */
  public async setLogLevel(level: McpLogLevel): Promise<void> {
    await setLogLevel(this.sendRequest.bind(this), level);
  }

  /**
   * calls a tool on this server
   * @param name name of the tool to invoke
   * @param args optional arguments to pass to the tool
   * @returns tool execution result
   */
  public async callTool(
    name: string,
    args?: JsonifibleObject,
    task?: TaskMetadata,
  ): Promise<CallToolResult | CreateTaskResult> {
    return callTool(this.sendRequest.bind(this), name, args, task);
  }

  /**
   * retrieves the current state of a task
   * @param taskId unique identifier for the task
   * @returns task state reported by the server
   */
  public async getTask(taskId: string): Promise<GetTaskResult> {
    return this.sendRequest<GetTaskResult>({
      method: 'tasks/get',
      params: { taskId },
    });
  }

  /**
   * retrieves the final payload of a completed task
   * @param taskId unique identifier for the task
   * @returns task payload reported by the server
   */
  public async getTaskResult(taskId: string): Promise<GetTaskPayloadResult> {
    return this.sendRequest<GetTaskPayloadResult>({
      method: 'tasks/result',
      params: { taskId },
    });
  }

  /**
   * lists tasks available on this server
   * @returns paginated task list
   */
  public async listTasks(): Promise<ListTasksResult> {
    return this.sendRequest<ListTasksResult>({
      method: 'tasks/list',
      params: undefined,
    });
  }

  /**
   * cancels a task on this server
   * @param taskId unique identifier for the task to cancel
   * @returns updated task state
   */
  public async cancelTask(taskId: string): Promise<CancelTaskResult> {
    return this.sendRequest<CancelTaskResult>({
      method: 'tasks/cancel',
      params: { taskId },
    });
  }

  /**
   * subscribes to updates for a specific resource
   * @param uri unique identifier for the resource to subscribe to
   */
  public async subscribeToResource(uri: string): Promise<void> {
    await subscribeToResource(this.sendRequest.bind(this), uri);
  }

  /**
   * unsubscribes from resource updates
   * @param uri unique identifier for the resource to unsubscribe from
   */
  public async unsubscribeFromResource(uri: string): Promise<void> {
    await unsubscribeFromResource(this.sendRequest.bind(this), uri);
  }

  /** sends a ping request to check server health */
  public async ping(): Promise<void> {
    await ping(this.sendRequest.bind(this));
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
    await sendNotification(method, params, {
      isConnected: this[status] === 'connected',
      name: this.#name,
      log: this.#log,
      send: this[send].bind(this),
    });
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
}
