import { MINUTES_TO_MS } from '#constants/time';

import type {
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
} from '@coremcp/protocol';

/** type of list that can be cached */
export type ListType = 'prompts' | 'tools' | 'resources' | 'resourceTemplates';

/** cache entry with data and expiration timestamp */
interface CacheEntry<T> {
  /** cached data */
  data: T[];
  /** timestamp when this entry expires (ms since epoch) */
  expiresAt: number;
}

/** cache configuration options */
export interface CacheConfig {
  /** time-to-live for cache entries in milliseconds (default: 30 minutes) */
  ttl?: number;
}

/** default cache ttl duration in minutes */
const DEFAULT_TTL_MINUTES = 30;
/** default cache ttl in milliseconds (30 minutes) */
const DEFAULT_TTL = DEFAULT_TTL_MINUTES * MINUTES_TO_MS;

/**
 * manages caching for mcp list operations
 * provides per-server, per-list-type caching with ttl-based expiration
 */
export class CacheManager {
  /** cache storage: serverName -> listType -> cache entry */
  #cache = new Map<string, Map<ListType, CacheEntry<unknown>>>();
  /** time-to-live for cache entries in milliseconds */
  #ttl: number;

  /**
   * creates a new cache manager
   * @param config cache configuration
   */
  constructor(config: CacheConfig = {}) {
    this.#ttl = config.ttl ?? DEFAULT_TTL;
  }

  /**
   * gets the configured ttl
   * @returns ttl in milliseconds
   */
  public get ttl(): number {
    return this.#ttl;
  }

  /**
   * gets cached data for a specific server and list type
   * @param serverName name of the server
   * @param listType type of list to retrieve
   * @returns cached data if valid, undefined if expired or not found
   */
  public get<T extends Prompt | Tool | Resource | ResourceTemplate>(
    serverName: string,
    listType: ListType,
  ): T[] | undefined {
    const serverCache = this.#cache.get(serverName);
    if (!serverCache) {
      return undefined;
    }

    const entry = serverCache.get(listType) as CacheEntry<T> | undefined;
    if (!entry) {
      return undefined;
    }

    // check if entry has expired
    if (Date.now() > entry.expiresAt) {
      // remove expired entry
      serverCache.delete(listType);

      return undefined;
    }

    return entry.data;
  }

  /**
   * sets cached data for a specific server and list type
   * @param serverName name of the server
   * @param listType type of list to cache
   * @param data data to cache
   */
  public set<T extends Prompt | Tool | Resource | ResourceTemplate>(
    serverName: string,
    listType: ListType,
    data: T[],
  ): void {
    let serverCache = this.#cache.get(serverName);
    if (!serverCache) {
      serverCache = new Map();
      this.#cache.set(serverName, serverCache);
    }

    serverCache.set(listType, {
      data,
      expiresAt: Date.now() + this.#ttl,
    });
  }

  /**
   * invalidates cached data for a specific server and list type
   * @param serverName name of the server
   * @param listType type of list to invalidate
   */
  public invalidate(serverName: string, listType: ListType): void {
    const serverCache = this.#cache.get(serverName);
    if (serverCache) {
      serverCache.delete(listType);
    }
  }

  /**
   * invalidates all cached data for a specific server
   * @param serverName name of the server
   */
  public invalidateServer(serverName: string): void {
    this.#cache.delete(serverName);
  }

  /**
   * clears all cached data
   */
  public clear(): void {
    this.#cache.clear();
  }

  /**
   * checks if a specific cache entry exists and is valid
   * @param serverName name of the server
   * @param listType type of list to check
   * @returns true if valid cache entry exists
   */
  public has(serverName: string, listType: ListType): boolean {
    const serverCache = this.#cache.get(serverName);
    if (!serverCache) {
      return false;
    }

    const entry = serverCache.get(listType);
    if (!entry) {
      return false;
    }

    // check if entry has expired
    if (Date.now() > entry.expiresAt) {
      serverCache.delete(listType);

      return false;
    }

    return true;
  }
}
