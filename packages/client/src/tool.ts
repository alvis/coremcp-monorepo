import type { CallToolResult, JsonifibleObject, Tool } from '@coremcp/protocol';

import type { CacheManager } from '#cache';
import type { ConnectionManager } from '#connection';

/**
 *
 */
class ServerNotFoundError extends Error {
  /**
   *
   * @param serverName
   */
  constructor(serverName: string) {
    super(`Server ${serverName} not found`);
    this.name = 'ServerNotFoundError';
  }
}

/** client-side representation of a tool */
export interface ClientTool extends Tool {
  /** server name this tool belongs to */
  serverName: string;
}

/** handles tool-related operations for mcp client */
export class ToolManager {
  /** connection manager for server access */
  #connectionManager: ConnectionManager;
  /** optional cache manager for list operations */
  #cacheManager?: CacheManager;

  /**
   * creates a new tool manager
   * @param connectionManager connection manager for server access
   * @param cacheManager optional cache manager for list operations
   */
  constructor(
    connectionManager: ConnectionManager,
    cacheManager?: CacheManager,
  ) {
    this.#connectionManager = connectionManager;
    this.#cacheManager = cacheManager;
  }

  /**
   * calls a tool on a specific server
   * @param serverName name of the server hosting the tool
   * @param toolName name of the tool to execute
   * @param args optional key-value arguments for tool execution
   * @returns promise resolving to tool execution results
   * @throws {Error} if server not found or not connected
   */
  public async callTool(
    serverName: string,
    toolName: string,
    args?: JsonifibleObject,
  ): Promise<CallToolResult> {
    const server = this.#connectionManager.connectors.get(serverName);

    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    return server.callTool(toolName, args);
  }

  /**
   * lists all tools from all connected servers
   * @returns promise resolving to array of tools with server names
   */
  public async listTools(): Promise<ClientTool[]> {
    const allTools: ClientTool[] = [];

    for (const [serverName, server] of this.#connectionManager.connectors) {
      try {
        // check cache first if available
        const cached = this.#cacheManager?.get<Tool>(serverName, 'tools');
        if (cached) {
          const toolsWithServerName = cached.map((tool) => ({
            ...tool,
            serverName,
          }));
          allTools.push(...toolsWithServerName);
          continue;
        }

        // fetch from server
        const tools = await server.listTools();
        const toolsWithServerName = tools.map((tool) => ({
          ...tool,
          serverName,
        }));
        allTools.push(...toolsWithServerName);

        // update cache if available
        this.#cacheManager?.set(serverName, 'tools', tools);
      } catch (error) {
        // intentional: graceful degradation pattern - skip failed server and continue with others
        // error is handled by skipping this server; alternatives would break the entire operation
        continue;
      }
    }

    return allTools;
  }

  /**
   * lists tools from a specific server
   * @param serverName name of the server to query
   * @returns promise resolving to array of tools from the server
   * @throws {Error} if server not found or not connected
   */
  public async listToolsFromServer(serverName: string): Promise<Tool[]> {
    const server = this.#connectionManager.connectors.get(serverName);

    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    // check cache first if available
    const cached = this.#cacheManager?.get<Tool>(serverName, 'tools');
    if (cached) {
      return cached;
    }

    // fetch from server
    const tools = await server.listTools();

    // update cache if available
    this.#cacheManager?.set(serverName, 'tools', tools);

    return tools;
  }

  /**
   * gets tool by name from a specific server
   * @param serverName name of the server to query
   * @param toolName name of the tool to retrieve
   * @returns promise resolving to tool definition or undefined if not found
   * @throws {Error} if server not found or not connected
   */
  public async getTool(
    serverName: string,
    toolName: string,
  ): Promise<Tool | undefined> {
    const server = this.#connectionManager.connectors.get(serverName);

    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    const tools = await server.listTools();

    return tools.find((tool) => tool.name === toolName);
  }

  /**
   * finds a tool by name across all servers
   * @param toolName name of the tool to find
   * @returns promise resolving to tool with server name or undefined if not found
   */
  public async findTool(toolName: string): Promise<ClientTool | undefined> {
    const allTools = await this.listTools();

    return allTools.find((tool) => tool.name === toolName);
  }
}
