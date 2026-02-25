import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from '#constants/http';
import { MS_PER_SECOND } from '#constants/time';

import { extractBearerToken, inferBaseUrlFromRequest } from '#request-context';

import type { FastifyReply, RouteHandlerMethod } from 'fastify';

import type { TokenInfo } from '../types';

import type { TokenIntrospector } from './types';

/**
 * validates token expiry and required scopes
 * @param tokenInfo token information from introspection
 * @param requiredScopes required OAuth scopes
 * @returns validation result with error details if invalid
 */
function validateTokenClaims(
  tokenInfo: TokenInfo,
  requiredScopes?: string[],
): { valid: boolean; error?: string; errorDescription?: string } {
  // check if token has expired
  if (tokenInfo.exp && tokenInfo.exp < Math.floor(Date.now() / MS_PER_SECOND)) {
    return {
      valid: false,
      error: 'invalid_token',
      errorDescription:
        'The access token has expired. Obtain a new token from the authorization server.',
    };
  }

  // validate required scopes
  if (requiredScopes && requiredScopes.length > 0) {
    const tokenScopes = tokenInfo.scope?.split(' ') ?? [];
    const hasRequiredScopes = requiredScopes.every((scope) =>
      tokenScopes.includes(scope),
    );

    if (!hasRequiredScopes) {
      return {
        valid: false,
        error: 'insufficient_scope',
        errorDescription: `Required scope(s): ${requiredScopes.join(' ')}`,
      };
    }
  }

  return { valid: true };
}

/**
 * extracts and validates bearer token from authorization header
 * @param authHeader authorization header value
 * @param reply fastify reply object
 * @param issuer authorization server issuer URL
 * @returns token string or null if invalid (response already sent)
 */
function extractAndValidateToken(
  authHeader: string | undefined,
  reply: FastifyReply,
  issuer: string,
): string | null {
  const token = extractBearerToken(authHeader);
  if (!token) {
    const error = !authHeader ? 'missing_token' : 'invalid_request';
    const description = !authHeader
      ? 'No authorization header present. Include "Authorization: Bearer <token>" header.'
      : 'Invalid authorization header format. Use "Authorization: Bearer <token>" format.';
    sendUnauthorizedResponse(reply, issuer, error, description);

    return null;
  }

  return token;
}

/**
 * handles validation errors by sending appropriate response
 * @param reply fastify reply object
 * @param issuer authorization server issuer URL
 * @param validation validation result with error details
 * @param validation.error OAuth error code
 * @param validation.errorDescription human readable error description
 */
function handleValidationError(
  reply: FastifyReply,
  issuer: string,
  validation: { error?: string; errorDescription?: string },
): void {
  if (validation.error === 'insufficient_scope') {
    sendForbiddenResponse(
      reply,
      issuer,
      validation.error,
      validation.errorDescription!,
    );
  } else {
    sendUnauthorizedResponse(
      reply,
      issuer,
      validation.error!,
      validation.errorDescription!,
    );
  }
}

/**
 * creates authentication middleware that requires valid OAuth tokens
 * @param params configuration parameters for authentication
 * @param params.introspect token introspection function
 * @param params.issuer optional authorization server issuer url
 * @param params.requiredScopes optional array of required OAuth scopes
 * @returns fastify route handler method for OAuth authentication
 * @throws {Error} when token introspection fails or network errors occur
 */
export function createRequireAuth(params: {
  introspect: TokenIntrospector;
  issuer?: string;
  requiredScopes?: string[];
}): RouteHandlerMethod {
  const { introspect, requiredScopes = [] } = params;

  return async (request, reply) => {
    const issuer = params.issuer ?? inferBaseUrlFromRequest(request);
    const token = extractAndValidateToken(
      request.headers.authorization,
      reply,
      issuer,
    );
    if (!token) {
      return;
    }

    try {
      const tokenInfo = await introspect(token);
      if (!tokenInfo.active) {
        return sendUnauthorizedResponse(
          reply,
          issuer,
          'invalid_token',
          'The access token is invalid or has been revoked. Obtain a new token from the authorization server.',
        );
      }

      const validation = validateTokenClaims(tokenInfo, requiredScopes);
      if (!validation.valid) {
        return handleValidationError(reply, issuer, validation);
      }
    } catch (error) {
      request.log.error(
        { error, issuer, hasToken: !!token, url: request.url },
        'Failed to introspect token during OAuth validation',
      );

      return sendUnauthorizedResponse(
        reply,
        issuer,
        'invalid_token',
        'Token validation failed due to introspection error. Check authorization server connectivity.',
      );
    }
  };
}

/**
 * sends a 401 Unauthorized response with proper WWW-Authenticate header
 * Following RFC 6750 Bearer Token Usage
 * @param reply fastify reply object
 * @param issuer optional authorization server issuer URL
 * @param error oauth error code
 * @param errorDescription human readable error description
 */
function sendUnauthorizedResponse(
  reply: FastifyReply,
  issuer: string | undefined,
  error: string,
  errorDescription: string,
): void {
  // build WWW-Authenticate header parts
  const parts = [`Bearer realm="MCP Server"`];

  if (error) {
    parts.push(`error="${error}"`);
  }

  if (errorDescription) {
    parts.push(`error_description="${errorDescription}"`);
  }

  // add authorization server URL if configured
  if (issuer) {
    parts.push(`authz_server="${issuer}"`);
  }

  reply
    .code(HTTP_UNAUTHORIZED)
    .header('WWW-Authenticate', parts.join(', '))
    .send({
      error: 'unauthorized',
      error_description: errorDescription,
    });
}

/**
 * sends a 403 Forbidden response with proper WWW-Authenticate header
 * Following RFC 6750 Section 3.1 for insufficient_scope errors
 * @param reply fastify reply object
 * @param issuer optional authorization server issuer URL
 * @param error oauth error code (typically 'insufficient_scope')
 * @param errorDescription human readable error description
 */
function sendForbiddenResponse(
  reply: FastifyReply,
  issuer: string | undefined,
  error: string,
  errorDescription: string,
): void {
  // build WWW-Authenticate header parts
  const parts = [`Bearer realm="MCP Server"`];

  if (error) {
    parts.push(`error="${error}"`);
  }

  if (errorDescription) {
    parts.push(`error_description="${errorDescription}"`);
  }

  // add authorization server URL if configured
  if (issuer) {
    parts.push(`authz_server="${issuer}"`);
  }

  reply.code(HTTP_FORBIDDEN).header('WWW-Authenticate', parts.join(', ')).send({
    error: 'forbidden',
    error_description: errorDescription,
  });
}

/**
 * creates OAuth authentication hook for fastify route handlers
 * @param _params configuration parameters for authentication hook
 * @param _params.introspect token introspection function
 * @param _params.issuer optional authorization server issuer url
 * @param _params.requiredScopes optional array of required OAuth scopes
 * @returns fastify route handler method for OAuth authentication hook
 */
export function createAuthHook(_params: {
  introspect: TokenIntrospector;
  issuer?: string;
  requiredScopes?: string[];
}): RouteHandlerMethod {
  // NOTE: stub implementation - authentication hook logic to be implemented
  return async (_request, _reply) => {
    // placeholder for authentication logic
  };
}
