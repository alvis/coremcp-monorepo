import type { Root } from '@coremcp/protocol';

import type { ConnectionManager } from '#connection';

/**
 * manages root directories for mcp client
 * handles root list operations and notifies connected servers of changes
 */
export class RootManager {
  #roots: Root[];
  #connectionManager: ConnectionManager;

  /**
   * creates a new root manager instance
   * @param roots initial list of root directories
   * @param connectionManager connection manager for server access
   */
  constructor(roots: Root[], connectionManager: ConnectionManager) {
    this.#roots = [...roots];
    this.#connectionManager = connectionManager;
  }

  /**
   * gets the current list of root directories
   * @returns copy of the roots array
   */
  public getRoots(): Root[] {
    return [...this.#roots];
  }

  /**
   * adds a new root directory to be exposed to servers
   * @param root the root directory to add
   * @returns true if the root was added, false if it already exists
   */
  public async addRoot(root: Root): Promise<boolean> {
    const existingIndex = this.#roots.findIndex((r) => r.uri === root.uri);
    if (existingIndex === -1) {
      this.#roots.push(root);
      await this.#notifyRootsChanged();

      return true;
    }

    return false;
  }

  /**
   * removes a root directory by uri
   * @param uri the uri of the root directory to remove
   * @returns true if the root was removed, false if not found
   */
  public async removeRoot(uri: string): Promise<boolean> {
    const index = this.#roots.findIndex((root) => root.uri === uri);
    if (index === -1) {
      return false;
    }
    this.#roots.splice(index, 1);
    await this.#notifyRootsChanged();

    return true;
  }

  /**
   * notifies all connected servers that the roots list has changed
   * @returns promise that resolves when all servers are notified
   */
  async #notifyRootsChanged(): Promise<void> {
    const promises = Array.from(
      this.#connectionManager.connectors.values(),
    ).map(async (server) =>
      server.sendNotification('notifications/roots/list_changed'),
    );
    await Promise.all(promises);
  }
}
