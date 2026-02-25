/**
 * @module middleware/external-auth
 * @description creates Fastify preHandler middleware for external OAuth authorization server
 * token validation. Validates Bearer tokens against an external AS via introspection.
 */

import { HTTP_UNAUTHORIZED } from '#constants/http';
import {
  validateBearerToken,
  extractBearerToken as extractToken,
} from '#oauth/resource-server/validation';

import type {
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';

import type { TokenIntrospector } from '#oauth/resource-server/types';

/** paths that should be excluded from token validation */
const EXCLUDED_PATH_PREFIXES = ['/oauth/', '/.well-known/'];

/**
 * checks if a URL path should be excluded from token validation
 * @param url request URL to check
 * @returns true if the path should skip token validation
 */
function isExcludedPath(url: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * sends OAuth error response for invalid or missing tokens
 * @param reply fastify reply object
 * @param statusCode HTTP status code
 * @param description error description message
 */
function sendTokenError(
  reply: FastifyReply,
  statusCode: number,
  description: string,
): void {
  void reply.code(statusCode).send({
    error: 'invalid_token',

    error_description: description,
  });
}

/**
 * creates external authorization server token validation middleware
 * validates Bearer tokens via introspection endpoint with caching support
 * @param requiredScopes scopes required for access (default: ['mcp'])
 * @param introspect token introspection function
 * @returns fastify preHandler hook that validates tokens
 * @example
 * ```typescript
 * const introspect = createCachingTokenIntrospector(config);
 * const middleware = createExternalAuthMiddleware(['mcp:read'], introspect);
 * fastify.addHook('preHandler', middleware);
 * ```
 */
export function createExternalAuthMiddleware(
  requiredScopes: string[],
  introspect: TokenIntrospector,
): preHandlerAsyncHookHandler {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    // skip OAuth and well-known endpoints
    if (isExcludedPath(request.url)) {
      return;
    }

    const token = extractToken(request.headers.authorization);
    if (!token) {
      sendTokenError(reply, HTTP_UNAUTHORIZED, 'Bearer token required');

      return;
    }

    const result = await validateBearerToken(
      { token, requiredScopes },
      introspect,
    );

    if (!result.valid) {
      // use the status code from validation result
      // defaults to 401 unauthorized if not specified
      const statusCode = result.statusCode ?? HTTP_UNAUTHORIZED;
      sendTokenError(
        reply,
        statusCode,
        result.error ?? 'Token validation failed',
      );
    }
  };
}
