import type {
  CompleteResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ResourceTemplateReference,
} from '@coremcp/protocol';

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

/** client-side representation of a resource */
export interface ClientResource extends Resource {
  /** server name this resource belongs to */
  serverName: string;
}

/** client-side representation of a resource template */
export interface ClientResourceTemplate extends ResourceTemplate {
  /** server name this resource template belongs to */
  serverName: string;
}

/** handles resource-related operations for mcp client */
export class ResourceManager {
  /** connection manager for server access */
  #connectionManager: ConnectionManager;
  /** optional cache manager for list operations */
  #cacheManager?: CacheManager;

  /**
   * creates a new resource manager
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
   * reads a resource from a specific server
   * @param serverName name of the server hosting the resource
   * @param uri resource identifier to read
   * @returns promise resolving to resource contents (text or binary)
   * @throws {Error} if server not found or not connected
   */
  public async readResource(
    serverName: string,
    uri: string,
  ): Promise<ReadResourceResult> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    return server.readResource(uri);
  }

  /**
   * lists all resources from all connected servers
   * @returns promise resolving to array of resources with server names
   */
  public async listResources(): Promise<ClientResource[]> {
    const allResources: ClientResource[] = [];

    for (const [serverName, server] of this.#connectionManager.connectors) {
      try {
        // check cache first if available
        const cached = this.#cacheManager?.get<Resource>(
          serverName,
          'resources',
        );
        if (cached) {
          const resourcesWithServerName = cached.map((resource) => ({
            ...resource,
            serverName,
          }));
          allResources.push(...resourcesWithServerName);
          continue;
        }

        // fetch from server
        const resources = await server.listResources();
        const resourcesWithServerName = resources.map((resource) => ({
          ...resource,
          serverName,
        }));
        allResources.push(...resourcesWithServerName);

        // update cache if available
        this.#cacheManager?.set(serverName, 'resources', resources);
      } catch (error) {
        // intentional: graceful degradation pattern - skip failed server and continue with others
        // error is handled by skipping this server; alternatives would break the entire operation
        continue;
      }
    }

    return allResources;
  }

  /**
   * lists resources from a specific server
   * @param serverName name of the server to query
   * @returns promise resolving to array of resources from the server
   * @throws {Error} if server not found or not connected
   */
  public async listResourcesFromServer(
    serverName: string,
  ): Promise<Resource[]> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    // check cache first if available
    const cached = this.#cacheManager?.get<Resource>(serverName, 'resources');
    if (cached) {
      return cached;
    }

    // fetch from server
    const resources = await server.listResources();

    // update cache if available
    this.#cacheManager?.set(serverName, 'resources', resources);

    return resources;
  }

  /**
   * lists all resource templates from all connected servers
   * @returns promise resolving to array of resource templates with server names
   */
  public async listResourceTemplates(): Promise<ClientResourceTemplate[]> {
    const allTemplates: ClientResourceTemplate[] = [];

    for (const [serverName, server] of this.#connectionManager.connectors) {
      try {
        // check cache first if available
        const cached = this.#cacheManager?.get<ResourceTemplate>(
          serverName,
          'resourceTemplates',
        );
        if (cached) {
          const templatesWithServerName = cached.map((template) => ({
            ...template,
            serverName,
          }));
          allTemplates.push(...templatesWithServerName);
          continue;
        }

        // fetch from server
        const templates = await server.listResourceTemplates();
        const templatesWithServerName = templates.map((template) => ({
          ...template,
          serverName,
        }));
        allTemplates.push(...templatesWithServerName);

        // update cache if available
        this.#cacheManager?.set(serverName, 'resourceTemplates', templates);
      } catch (error) {
        // intentional: graceful degradation pattern - skip failed server and continue with others
        // error is handled by skipping this server; alternatives would break the entire operation
        continue;
      }
    }

    return allTemplates;
  }

  /**
   * lists resource templates from a specific server
   * @param serverName name of the server to query
   * @returns promise resolving to array of resource templates from the server
   * @throws {Error} if server not found or not connected
   */
  public async listResourceTemplatesFromServer(
    serverName: string,
  ): Promise<ResourceTemplate[]> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    // check cache first if available
    const cached = this.#cacheManager?.get<ResourceTemplate>(
      serverName,
      'resourceTemplates',
    );
    if (cached) {
      return cached;
    }

    // fetch from server
    const templates = await server.listResourceTemplates();

    // update cache if available
    this.#cacheManager?.set(serverName, 'resourceTemplates', templates);

    return templates;
  }

  /**
   * requests autocompletion for a resource template from a specific server
   * @param serverName name of the server to query
   * @param uri resource template uri for completion
   * @param argument argument information with name and partial value
   * @param argument.name name of the argument
   * @param argument.value partial value to complete
   * @returns promise resolving to completion suggestions
   * @throws {Error} if server not found or not connected
   */
  public async completeResourceTemplate(
    serverName: string,
    uri: string,
    argument: { name: string; value: string },
  ): Promise<CompleteResult> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    const ref: ResourceTemplateReference = {
      type: 'ref/resource',
      uri,
    };

    return server.complete(ref, argument);
  }

  /**
   * finds a resource by uri across all servers
   * @param uri resource identifier to find
   * @returns promise resolving to resource with server name or undefined if not found
   */
  public async findResource(uri: string): Promise<ClientResource | undefined> {
    const allResources = await this.listResources();

    return allResources.find((resource) => resource.uri === uri);
  }

  /**
   * subscribes to resource updates on a specific server
   * @param serverName name of the server hosting the resource
   * @param uri resource identifier to watch
   * @returns promise resolving when subscription is established
   * @throws {Error} if server not found or not connected
   */
  public async subscribeToResource(
    serverName: string,
    uri: string,
  ): Promise<void> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    await server.subscribeToResource(uri);
  }

  /**
   * unsubscribes from resource updates on a specific server
   * @param serverName name of the server hosting the resource
   * @param uri resource identifier to stop watching
   * @returns promise resolving when subscription is cancelled
   * @throws {Error} if server not found or not connected
   */
  public async unsubscribeFromResource(
    serverName: string,
    uri: string,
  ): Promise<void> {
    const server = this.#connectionManager.connectors.get(serverName);
    if (!server) {
      throw new ServerNotFoundError(serverName);
    }

    await server.unsubscribeFromResource(uri);
  }
}
