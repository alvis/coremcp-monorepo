/**
 * default introspection cache TTL in seconds
 * @description provides good balance between performance and token validity
 */
export const DEFAULT_INTROSPECTION_CACHE_TTL = 60;

/**
 * default HTTP server port
 * @description standard HTTP port used when no port is explicitly specified.
 * @example
 * ```typescript
 * const port = process.env.PORT || DEFAULT_PORT;
 * ```
 */
export const DEFAULT_HTTP_PORT = 80;
/**
 * default HTTPS server port
 * @description standard HTTPS port used for secure connections.
 */
export const DEFAULT_HTTPS_PORT = 443;
/**
 * default HTTP server host address
 * @description localhost address used when no host is explicitly specified.
 * @example
 * ```typescript
 * const host = process.env.HOST || DEFAULT_HOST;
 * ```
 */
export const DEFAULT_HOST = '0.0.0.0';
