/**
 * @module middleware/proxy-auth
 * @description creates Fastify preHandler middleware for OAuth proxy mode token validation.
 * Validates tokens issued through the proxy by checking local token mappings.
 */

import { createHash } from 'node:crypto';

import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from '#constants/http';
import { extractBearerToken as extractToken } from '#oauth/resource-server/validation';

import type {
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';

import type { ProxyStorageAdapter, TokenMapping } from '#oauth/proxy/adapter';

/** paths that should be excluded from proxy token validation */
const EXCLUDED_PATH_PREFIXES = [
  '/oauth/',
  '/.well-known/',
  '/health',
  '/management/',
];

/**
 * checks if a URL path should be excluded from token validation
 * @param url request URL to check
 * @returns true if the path should skip token validation
 */
function isExcludedPath(url: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? url.startsWith(prefix)
      : url === prefix || url.startsWith(prefix + '/'),
  );
}

/**
 * sends OAuth error response for invalid tokens
 * @param reply fastify reply object
 * @param statusCode HTTP status code
 * @param errorCode OAuth error code
 * @param description error description message
 */
function sendTokenError(
  reply: FastifyReply,
  statusCode: number,
  errorCode: string,
  description: string,
): void {
  void reply
    .code(statusCode)
    .send({ error: errorCode, error_description: description });
}

/**
 * computes SHA256 hash of a token for secure storage lookup
 * @param token token string to hash
 * @returns hex-encoded SHA256 hash
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * validates token mapping exists and is not expired
 * @param storage proxy storage adapter
 * @param tokenHash hashed token to lookup
 * @param reply fastify reply for sending errors
 * @returns token mapping if valid, null otherwise
 */
async function validateTokenMapping(
  storage: ProxyStorageAdapter,
  tokenHash: string,
  reply: FastifyReply,
): Promise<TokenMapping | null> {
  const mapping = await storage.findTokenMapping(tokenHash);
  if (!mapping) {
    sendTokenError(
      reply,
      HTTP_UNAUTHORIZED,
      'invalid_token',
      'token not recognized',
    );

    return null;
  }
  if (mapping.expiresAt && Date.now() > mapping.expiresAt) {
    sendTokenError(reply, HTTP_UNAUTHORIZED, 'invalid_token', 'token expired');

    return null;
  }

  return mapping;
}

/**
 * validates client exists and has required scopes
 * @param storage proxy storage adapter
 * @param clientId client identifier to validate
 * @param requiredScopes scopes that must be present
 * @param reply fastify reply for sending errors
 * @returns true if valid, false otherwise
 */
async function validateClientScopes(
  storage: ProxyStorageAdapter,
  clientId: string,
  requiredScopes: string[],
  reply: FastifyReply,
): Promise<boolean> {
  const client = await storage.findClient(clientId);
  if (!client) {
    sendTokenError(
      reply,
      HTTP_UNAUTHORIZED,
      'invalid_token',
      'token client not found',
    );

    return false;
  }
  if (requiredScopes.length > 0 && client.scope) {
    const clientScopes = client.scope.split(' ');
    if (!requiredScopes.every((scope) => clientScopes.includes(scope))) {
      sendTokenError(
        reply,
        HTTP_FORBIDDEN,
        'insufficient_scope',
        `required scopes: ${requiredScopes.join(' ')}`,
      );

      return false;
    }
  }

  return true;
}

/**
 * creates proxy oauth token validation middleware
 * validates tokens by checking local token mappings and verifying client ownership
 * @param storage proxy storage adapter for token and client lookups
 * @param requiredScopes scopes required for access (default: ['mcp'])
 * @returns fastify preHandler hook that validates proxy-issued tokens
 */
export function createProxyAuthMiddleware(
  storage: ProxyStorageAdapter,
  requiredScopes: string[],
): preHandlerAsyncHookHandler {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (isExcludedPath(request.url)) {
      return;
    }

    const token = extractToken(request.headers.authorization);
    if (!token) {
      sendTokenError(
        reply,
        HTTP_UNAUTHORIZED,
        'invalid_token',
        'Bearer token required',
      );

      return;
    }

    const mapping = await validateTokenMapping(
      storage,
      hashToken(token),
      reply,
    );
    if (!mapping) {
      return;
    }

    await validateClientScopes(
      storage,
      mapping.clientId,
      requiredScopes,
      reply,
    );
  };
}
