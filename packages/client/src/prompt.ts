import type {
  CompleteResult,
  GetPromptResult,
  Prompt,
  PromptReference,
} from '@coremcp/protocol';

import type { CacheManager } from '#cache';
import type { ConnectionManager } from '#connection';

/** client-side representation of a prompt */
export interface ClientPrompt extends Prompt {
  /** server name this prompt belongs to */
  serverName: string;
}

/** handles prompt-related operations for mcp client */
export class PromptManager {
  /** connection manager for server access */
  #connectionManager: ConnectionManager;
  /** optional cache manager for list operations */
  #cacheManager?: CacheManager;

  /**
   * creates a new prompt manager
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
   * gets a specific prompt from a server
   * @param serverName name of the server to query
   * @param promptName name of the prompt to retrieve
   * @param args optional key-value arguments for prompt templating
   * @returns promise resolving to prompt result with processed messages
   * @throws {Error} if server not found or not connected
   */
  public async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    return server.getPrompt(promptName, args);
  }

  /**
   * lists all prompts from all connected servers
   * @returns promise resolving to array of prompts with server names
   */
  public async listPrompts(): Promise<ClientPrompt[]> {
    const allPrompts: ClientPrompt[] = [];

    for (const [serverName, server] of this.#connectionManager.connectors) {
      try {
        // check cache first if available
        const cached = this.#cacheManager?.get<Prompt>(serverName, 'prompts');
        if (cached) {
          const promptsWithServerName = cached.map((prompt) => ({
            ...prompt,
            serverName,
          }));
          allPrompts.push(...promptsWithServerName);
          continue;
        }

        // fetch from server
        const prompts = await server.listPrompts();
        const promptsWithServerName = prompts.map((prompt) => ({
          ...prompt,
          serverName,
        }));
        allPrompts.push(...promptsWithServerName);

        // update cache if available
        this.#cacheManager?.set(serverName, 'prompts', prompts);
      } catch (error) {
        // intentional: graceful degradation pattern - skip failed server and continue with others
        // error is handled by skipping this server; alternatives would break the entire operation
        continue;
      }
    }

    return allPrompts;
  }

  /**
   * lists prompts from a specific server
   * @param serverName name of the server to query
   * @returns promise resolving to array of prompts from the server
   * @throws {Error} if server not found or not connected
   */
  public async listPromptsFromServer(serverName: string): Promise<Prompt[]> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    // check cache first if available
    const cached = this.#cacheManager?.get<Prompt>(serverName, 'prompts');
    if (cached) {
      return cached;
    }

    // fetch from server
    const prompts = await server.listPrompts();

    // update cache if available
    this.#cacheManager?.set(serverName, 'prompts', prompts);

    return prompts;
  }

  /**
   * requests autocompletion for a prompt from a specific server
   * @param serverName name of the server to query
   * @param promptName name of the prompt for completion
   * @param argument argument information with name and partial value
   * @param argument.name name of the argument
   * @param argument.value partial value to complete
   * @returns promise resolving to completion suggestions
   * @throws {Error} if server not found or not connected
   */
  public async completePrompt(
    serverName: string,
    promptName: string,
    argument: { name: string; value: string },
  ): Promise<CompleteResult> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    const ref: PromptReference = {
      type: 'ref/prompt',
      name: promptName,
    };

    return server.complete(ref, argument);
  }

  /**
   * finds a prompt by name across all servers
   * @param promptName name of the prompt to find
   * @returns promise resolving to prompt with server name or undefined if not found
   */
  public async findPrompt(
    promptName: string,
  ): Promise<ClientPrompt | undefined> {
    const allPrompts = await this.listPrompts();

    return allPrompts.find((prompt) => prompt.name === promptName);
  }
}
