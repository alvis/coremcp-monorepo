import { CacheManager } from '#cache';
import { ConnectionManager } from '#connection';
import {
  createServerNotificationHandler,
  createServerRequestHandler,
} from '#handler';
import { PromptManager } from '#prompt';
import { ResourceManager } from '#resource';
import { RootManager } from '#roots';
import { ToolManager } from '#tool';

import type { Log, SessionStore } from '@coremcp/core';
import type {
  CallToolResult,
  ClientCapabilities,
  CompleteResult,
  CreateMessageRequest,
  CreateMessageResult,
  ElicitRequest,
  ElicitResult,
  Implementation,
  InitializeResult,
  JsonifibleObject,
  McpLogLevel,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Root,
  Tool,
} from '@coremcp/protocol';

import type { CreateConnector } from '#connection';
import type { McpConnector } from '#connector';
import type { ElicitationCallback, SamplingCallback } from '#handler';
import type { ClientPrompt } from '#prompt';
import type { ClientResource, ClientResourceTemplate } from '#resource';
import type { ClientTool } from '#tool';
import type {
  OnCancelled,
  OnListChange,
  OnLogMessage,
  OnProgress,
  OnResourceChange,
} from '#types';

export type { CreateConnector } from '#connection';

/** configuration options for initializing an mcp client */
export interface McpClientOptions {
  /** client application name used in server handshake */
  name: string;
  /** client application version used in server handshake */
  version: string;
  /** optional list of servers to connect to during initialization */
  connectors?: CreateConnector[];
  /** optional root directories to expose to connected servers */
  roots?: Root[];
  /** handles elicitation requests from servers */
  onElicitation?: ElicitationCallback;
  /** handles sampling requests from servers */
  onSampling?: SamplingCallback;
  /** callback for list change notifications (tools, resources, prompts) */
  onListChange?: OnListChange;
  /** callback for resource updated notifications */
  onResourceChange?: OnResourceChange;
  /** callback for progress notifications */
  onProgress?: OnProgress;
  /** callback for cancelled notifications */
  onCancelled?: OnCancelled;
  /** callback for log message notifications */
  onLogMessage?: OnLogMessage;
  /** optional logger for debugging */
  log?: Log;
  /** optional session store for persistence */
  sessionStore?: SessionStore;
  /** cache configuration for listXXX operations */
  cache?: { ttl?: number };
}

/** manages multiple mcp server connections */
export class McpClient {
  #cacheManager?: CacheManager;
  #promptManager: PromptManager;
  #resourceManager: ResourceManager;
  #toolManager: ToolManager;
  #rootManager: RootManager;
  #connectionManager: ConnectionManager;
  #onElicitation?: ElicitationCallback;
  #onSampling?: SamplingCallback;
  #log?: Log;

  /**
   * creates a new mcp client instance
   * @param options - configuration options for the client
   */
  constructor(options: McpClientOptions) {
    const info: Implementation = {
      name: options.name,
      version: options.version,
    };
    const roots = options.roots ?? [];
    const capabilities: ClientCapabilities = {
      elicitation: options.onElicitation ? {} : undefined,
      roots: { listChanged: true },
      sampling: options.onSampling ? {} : undefined,
    };
    this.#onElicitation = options.onElicitation;
    this.#onSampling = options.onSampling;
    this.#log = options.log;
    this.#cacheManager = new CacheManager(options.cache);

    const serverRequestHandler = createServerRequestHandler({
      onElicitation: this.#onElicitation,
      onSampling: this.#onSampling,
      roots,
      log: options.log,
    });
    const serverNotificationHandler = createServerNotificationHandler({
      onListChange: options.onListChange,
      onResourceChange: options.onResourceChange,
      onProgress: options.onProgress,
      onCancelled: options.onCancelled,
      onLogMessage: options.onLogMessage,
      log: options.log,
      cacheManager: this.#cacheManager,
      refreshList: this.#refreshList.bind(this),
    });
    this.#connectionManager = new ConnectionManager({
      info,
      capabilities,
      sessionStore: options.sessionStore,
      log: options.log,
      onRequest: serverRequestHandler,
      onNotification: serverNotificationHandler,
    });
    this.#promptManager = new PromptManager(
      this.#connectionManager,
      this.#cacheManager,
    );
    this.#resourceManager = new ResourceManager(
      this.#connectionManager,
      this.#cacheManager,
    );
    this.#toolManager = new ToolManager(
      this.#connectionManager,
      this.#cacheManager,
    );
    this.#rootManager = new RootManager(roots, this.#connectionManager);
  }

  /**
   * refreshes list cache from server after list change notification
   * @param server - the name of the server to refresh cache for
   * @param listType - the type of list to refresh
   */
  async #refreshList(
    server: string,
    listType: 'prompts' | 'tools' | 'resources',
  ): Promise<void> {
    const connector = this.#connectionManager.connectors.get(server);
    if (!connector) {
      return;
    }

    try {
      switch (listType) {
        case 'prompts':
          this.#cacheManager?.set(
            server,
            'prompts',
            await connector.listPrompts(),
          );
          break;
        case 'tools':
          this.#cacheManager?.set(server, 'tools', await connector.listTools());
          break;
        case 'resources':
          this.#cacheManager?.set(
            server,
            'resources',
            await connector.listResources(),
          );
          this.#cacheManager?.set(
            server,
            'resourceTemplates',
            await connector.listResourceTemplates(),
          );
          break;
        default:
          throw new Error(`Unknown list type: ${listType}`);
      }
    } catch (error) {
      this.#log?.('error', 'Failed to refresh list cache', {
        serverName: server,
        listType,
        error,
      });
    }
  }

  /** gets the current list of root directories exposed to servers */
  public get roots(): Root[] {
    return this.#rootManager.getRoots();
  }

  /** gets all connected servers as a record */
  public get servers(): Record<string, McpConnector> {
    return Object.fromEntries(this.#connectionManager.connectors.entries());
  }

  /**
   * lists all prompts from all connected servers
   * @returns array of prompts from all connected servers
   */
  public async listPrompts(): Promise<ClientPrompt[]> {
    return this.#promptManager.listPrompts();
  }

  /**
   * requests autocompletion for a prompt argument
   * @param server - the name of the server hosting the prompt
   * @param promptName - the name of the prompt to complete
   * @param argument - the argument to complete with name and value
   * @param argument.name - the name of the argument
   * @param argument.value - the partial value to complete
   * @returns completion suggestions for the argument
   */
  public async completePrompt(
    server: string,
    promptName: string,
    argument: { name: string; value: string },
  ): Promise<CompleteResult> {
    return this.#promptManager.completePrompt(server, promptName, argument);
  }

  /**
   * finds a prompt by name across all connected servers
   * @param promptName - the name of the prompt to find
   * @returns the prompt if found, undefined otherwise
   */
  public async findPrompt(
    promptName: string,
  ): Promise<ClientPrompt | undefined> {
    return this.#promptManager.findPrompt(promptName);
  }

  /**
   * reads the content of a specific resource from a server
   * @param server - the name of the server hosting the resource
   * @param uri - the uri of the resource to read
   * @returns the resource content
   */
  public async readResource(
    server: string,
    uri: string,
  ): Promise<ReadResourceResult> {
    return this.#resourceManager.readResource(server, uri);
  }

  /**
   * lists all resources from all connected servers
   * @returns array of resources from all connected servers
   */
  public async listResources(): Promise<ClientResource[]> {
    return this.#resourceManager.listResources();
  }

  /**
   * lists resources from a specific server
   * @param server - the name of the server to list resources from
   * @returns array of resources from the specified server
   */
  public async listResourcesFromServer(server: string): Promise<Resource[]> {
    return this.#resourceManager.listResourcesFromServer(server);
  }

  /**
   * lists all resource templates from all connected servers
   * @returns array of resource templates from all connected servers
   */
  public async listResourceTemplates(): Promise<ClientResourceTemplate[]> {
    return this.#resourceManager.listResourceTemplates();
  }

  /**
   * lists resource templates from a specific server
   * @param server - the name of the server to list templates from
   * @returns array of resource templates from the specified server
   */
  public async listResourceTemplatesFromServer(
    server: string,
  ): Promise<ResourceTemplate[]> {
    return this.#resourceManager.listResourceTemplatesFromServer(server);
  }

  /**
   * requests autocompletion for a resource template argument
   * @param server - the name of the server hosting the template
   * @param uriTemplate - the uri template to complete
   * @param argument - the argument to complete with name and value
   * @param argument.name - the name of the argument
   * @param argument.value - the partial value to complete
   * @returns completion suggestions for the argument
   */
  public async completeResourceTemplate(
    server: string,
    uriTemplate: string,
    argument: { name: string; value: string },
  ): Promise<CompleteResult> {
    return this.#resourceManager.completeResourceTemplate(
      server,
      uriTemplate,
      argument,
    );
  }

  /**
   * finds a resource by uri across all connected servers
   * @param uri - the uri of the resource to find
   * @returns the resource if found, undefined otherwise
   */
  public async findResource(uri: string): Promise<ClientResource | undefined> {
    return this.#resourceManager.findResource(uri);
  }

  /**
   * subscribes to notifications when a resource changes
   * @param server - the name of the server hosting the resource
   * @param uri - the uri of the resource to subscribe to
   * @returns promise that resolves when subscription is established
   */
  public async subscribeToResource(server: string, uri: string): Promise<void> {
    return this.#resourceManager.subscribeToResource(server, uri);
  }

  /**
   * unsubscribes from resource change notifications
   * @param server - the name of the server hosting the resource
   * @param uri - the uri of the resource to unsubscribe from
   * @returns promise that resolves when unsubscription is complete
   */
  public async unsubscribeFromResource(
    server: string,
    uri: string,
  ): Promise<void> {
    return this.#resourceManager.unsubscribeFromResource(server, uri);
  }

  /**
   * calls a tool on a specific server with provided arguments
   * @param server - the name of the server hosting the tool
   * @param toolName - the name of the tool to call
   * @param args - optional arguments to pass to the tool
   * @returns the result of the tool invocation
   */
  public async callTool(
    server: string,
    toolName: string,
    args?: JsonifibleObject,
  ): Promise<CallToolResult> {
    return this.#toolManager.callTool(server, toolName, args);
  }

  /**
   * lists all tools from all connected servers
   * @returns array of tools from all connected servers
   */
  public async listTools(): Promise<ClientTool[]> {
    return this.#toolManager.listTools();
  }

  /**
   * lists tools from a specific server
   * @param server - the name of the server to list tools from
   * @returns array of tools from the specified server
   */
  public async listToolsFromServer(server: string): Promise<Tool[]> {
    return this.#toolManager.listToolsFromServer(server);
  }

  /**
   * gets a specific tool by name from a server
   * @param server - the name of the server hosting the tool
   * @param toolName - the name of the tool to get
   * @returns the tool if found, undefined otherwise
   */
  public async getTool(
    server: string,
    toolName: string,
  ): Promise<Tool | undefined> {
    return this.#toolManager.getTool(server, toolName);
  }

  /**
   * adds a new root directory to be exposed to servers
   * @param root - the root directory to add
   * @returns true if the root was added, false if it already exists
   */
  public async addRoot(root: Root): Promise<boolean> {
    return this.#rootManager.addRoot(root);
  }

  /**
   * removes a root directory by uri
   * @param uri - the uri of the root directory to remove
   * @returns true if the root was removed, false if not found
   */
  public async removeRoot(uri: string): Promise<boolean> {
    return this.#rootManager.removeRoot(uri);
  }

  /**
   * connects to a new server and performs initialization handshake
   * @param createConnector - factory function that creates the connector instance
   * @returns the initialization result from the server
   */
  public async connect(
    createConnector: CreateConnector,
  ): Promise<InitializeResult> {
    return this.#connectionManager.connect(createConnector);
  }

  /**
   * disconnects from a server by name
   * @param name - the name of the server to disconnect from
   * @returns promise that resolves when disconnection is complete
   */
  public async disconnect(name: string): Promise<void> {
    return this.#connectionManager.disconnect(name);
  }

  /**
   * disconnects from all connected servers and cleans up resources
   * @returns promise that resolves when all disconnections are complete
   */
  public async disconnectAll(): Promise<void> {
    return this.#connectionManager.disconnectAll();
  }

  /**
   * gets a connected server instance by name
   * @param name - the name of the server to get
   * @returns the server connector if found, undefined otherwise
   */
  public getServer(name: string): McpConnector | undefined {
    return this.#connectionManager.getServer(name);
  }

  /**
   * lists all connected servers
   * @returns a record of server names to connector instances
   */
  public listServers(): Record<string, McpConnector> {
    return this.#connectionManager.listServers();
  }

  /**
   * sets log level for all connected servers
   * @param level - the log level to set
   * @returns promise that resolves when log level is set on all servers
   */
  public async setLogLevel(level: McpLogLevel): Promise<void> {
    return this.#connectionManager.setLogLevel(level);
  }

  /**
   * handles elicitation request from server
   * @param params - the elicitation request parameters
   * @returns the elicitation result
   */
  public async handleElicitationRequest(
    params: ElicitRequest['params'],
  ): Promise<ElicitResult> {
    if (!this.#onElicitation) {
      throw new Error('Elicitation callback not configured');
    }

    return this.#onElicitation(params);
  }

  /**
   * handles sampling request from server
   * @param params - the sampling request parameters
   * @returns the sampling result
   */
  public async handleSamplingRequest(
    params: CreateMessageRequest['params'],
  ): Promise<CreateMessageResult> {
    if (!this.#onSampling) {
      throw new Error('Sampling callback not configured');
    }

    return this.#onSampling(params);
  }
}
