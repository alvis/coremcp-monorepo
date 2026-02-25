import { MS_PER_SECOND } from '#constants/time';

import type { ExternalAuthServerConfig, TokenInfo } from '../types';

import type { TokenIntrospector } from './types';

// time constants
const DEFAULT_CACHE_TTL_SECONDS = 60;
const DEFAULT_CACHE_MAX_SIZE = 10000;

// cache for discovered endpoints
const endpointCache = new Map<string, string>();

/**
 * lru cache entry with value and access timestamp
 * tracks when entry was last accessed for eviction decisions
 */
interface LRUCacheEntry<V> {
  /** cached value */
  value: V;
  /** timestamp of last access in milliseconds since epoch */
  timestamp: number;
}

/**
 * least recently used (LRU) cache with configurable size limits
 * evicts least recently accessed entries when max size is reached
 * prevents unbounded memory growth in long-running servers
 */
class LRUCache<K, V> {
  #cache = new Map<K, LRUCacheEntry<V>>();
  readonly #maxSize!: number;

  /**
   * creates a new LRU cache with specified max size
   * @param maxSize maximum number of entries to cache
   */
  constructor(maxSize: number) {
    this.#maxSize = maxSize;
  }

  /**
   * sets a value in the cache, evicting LRU entry if at capacity
   * @param key cache key
   * @param value value to cache
   */
  public set(key: K, value: V): void {
    // if cache is at capacity, evict least recently used entry
    if (this.#cache.size >= this.#maxSize && !this.#cache.has(key)) {
      const lruKey = this.#findLRUKey();
      if (lruKey !== undefined) {
        this.#cache.delete(lruKey);
      }
    }

    // store entry with current timestamp
    this.#cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * gets a value from the cache, updating its access time
   * @param key cache key
   * @returns cached value or undefined if not found
   */
  public get(key: K): V | undefined {
    const entry = this.#cache.get(key);
    if (!entry) {
      return undefined;
    }

    // update access time to mark as recently used
    entry.timestamp = Date.now();

    return entry.value;
  }

  /**
   * clears all entries from the cache
   */
  public clear(): void {
    this.#cache.clear();
  }

  /**
   * returns the current number of cached entries
   * @returns cache size
   */
  public size(): number {
    return this.#cache.size;
  }

  /**
   * returns cache statistics for monitoring
   * @returns object with size and max size metrics
   */
  public getStats(): { size: number; maxSize: number } {
    return {
      size: this.#cache.size,
      maxSize: this.#maxSize,
    };
  }

  /**
   * finds the least recently used key for eviction
   * @returns key with oldest timestamp or undefined if cache is empty
   */
  #findLRUKey(): K | undefined {
    let lruKey: K | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;

    // scan cache to find entry with oldest timestamp
    for (const [key, entry] of this.#cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        lruKey = key;
      }
    }

    return lruKey;
  }
}

/** additional options for the introspection client */
interface TokenInspectorOptions {
  /** the web fetcher used by the client */
  fetch?: typeof global.fetch;
  /** optional additional parameters to send with introspection request */
  additionalParams?: Record<string, string>;
  /** cache time-to-live in seconds (default: 60) */
  ttl?: number;
}

/**
 * cached introspection result with expiration time
 */
interface CachedIntrospection {
  /** introspection result */
  info: TokenInfo;
  /** expiration timestamp in milliseconds since epoch */
  expires: number;
}

/**
 * creates a caching introspection client that caches valid tokens
 * to reduce load on the introspection endpoint
 * uses LRU eviction to prevent unbounded memory growth
 * @param config external authorization server configuration
 * @param options additional options for token introspection
 * @returns async function that introspects tokens with caching
 */
export function createCachingTokenIntrospector(
  config: ExternalAuthServerConfig,
  options?: TokenInspectorOptions,
): TokenIntrospector {
  const { ttl = DEFAULT_CACHE_TTL_SECONDS } = { ...options };

  // extract cache configuration from config with defaults
  const maxSize = config.introspectionCache?.maxSize ?? DEFAULT_CACHE_MAX_SIZE;
  const ttlMs = config.introspectionCache?.ttlMs ?? ttl * MS_PER_SECOND;

  const introspect = createTokenInspector(config, options);

  // initialize LRU cache with configured max size
  const cache = new LRUCache<string, CachedIntrospection>(maxSize);

  // return a wrapped function that includes cleanup
  return async (token) => {
    const now = Date.now();
    const cached = cache.get(token);

    // check if we have a valid cached entry
    if (cached && cached.expires > now) {
      return cached.info;
    }

    // introspect the token
    const info = await introspect(token);

    if (info.active) {
      // cache the result with TTL-based expiration
      const expires = now + ttlMs;
      cache.set(token, { info, expires });
    }

    return info;
  };
}

/**
 * creates a token introspection client for validating tokens with an external AS
 * @param config external authorization server configuration
 * @param options additional options
 * @returns async function that introspects tokens
 */
export function createTokenInspector(
  config: ExternalAuthServerConfig,
  options?: TokenInspectorOptions,
): (token: string) => Promise<TokenInfo> {
  const { clientId, clientSecret } = { ...config.clientCredentials };
  const { fetch = global.fetch, additionalParams = {} } = { ...options };

  return async (token: string): Promise<TokenInfo> => {
    const endpoint = await getEndpoint(config, fetch);

    // prepare the introspection request
    const params = new URLSearchParams({
      token,
      token_type_hint: 'access_token',
      ...additionalParams,
    });

    // create Basic auth header
    const credentials = `${clientId}:${clientSecret}`;
    const authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;

    // make introspection request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      // introspection failed - token is considered invalid
      // error details are not exposed to client for security

      return { active: false };
    }

    const data = await response.json();

    // validate response has required active property
    if (typeof data !== 'object' || data === null || !('active' in data)) {
      return { active: false };
    }

    const tokenInfo = data as TokenInfo;

    // if token is not active, return null
    if (!tokenInfo.active) {
      return { active: false };
    }

    // convert introspection response to TokenInfo
    return tokenInfo;
  };
}

/**
 * discovers the introspection endpoint from the AS well-known configuration
 * @param config external authorization server configuration containing issuer URL
 * @param fetch the fetch function to use for HTTP requests
 * @returns the introspection endpoint URL
 */
export async function getEndpoint(
  config: ExternalAuthServerConfig,
  fetch: typeof global.fetch,
): Promise<string> {
  // if endpoint is explicitly configured, use it
  if (config.endpoints?.introspection) {
    return new URL(config.endpoints.introspection, config.issuer).toString();
  }

  // check cache first
  const cacheKey = config.issuer;
  const cached = endpointCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // try oauth-authorization-server well-known first
  const wellKnownUrls = [
    `${config.issuer}/.well-known/oauth-authorization-server`,
    `${config.issuer}/.well-known/openid-configuration`,
  ];

  for (const wellKnownUrl of wellKnownUrls) {
    try {
      const response = await fetch(wellKnownUrl, {
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        // NOTE: introspection_endpoint is OAuth spec property name (RFC 8414)
        const metadata = (await response.json()) as {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          introspection_endpoint?: string;
        };

        if (metadata.introspection_endpoint) {
          const endpoint = metadata.introspection_endpoint;
          // cache the discovered endpoint
          endpointCache.set(cacheKey, endpoint);

          return endpoint;
        }
      }
    } catch {
      // continue to next well-known URL
    }
  }

  throw new Error(
    `No introspection endpoint found for issuer ${config.issuer}. ` +
      'Either configure it explicitly in config.endpoints.introspection ' +
      'or ensure the authorization server exposes it via well-known configuration.',
  );
}
