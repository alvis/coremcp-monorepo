import { HTTP_BAD_REQUEST, HTTP_UNAUTHORIZED } from '#constants/http';

import { extractBearerToken, lastHeader } from '#request-context';

import type { Log } from '@coremcp/core';
import type { McpServer } from '@coremcp/server';
import type { FastifyPluginAsync } from 'fastify';

/**
 * registers management routes for administrative operations
 * provides secure endpoints for server management tasks like session cleanup.
 * all endpoints require Bearer token authentication.
 * @param server mcp server instance
 * @param managementToken token for authentication (or undefined to use env var)
 * @param log optional logging function
 * @returns fastify plugin async function
 */
export function registerManagementRoutes(
  server: McpServer,
  managementToken: string | undefined,
  log?: Log,
): FastifyPluginAsync {
  return async (fastify) => {
    /**
     * POST /management/cleanup - cleanup inactive sessions
     * requires Bearer token authentication. removes sessions inactive for
     * specified duration. default timeout is 5 minutes (300000ms).
     * request body:
     * - inactivityTimeoutMs?: number - timeout in milliseconds
     * response:
     * - success: boolean
     * - sessionsCleanedUp: number
     * - inactivityTimeoutMs: number
     * - timestamp: string (ISO 8601)
     * @returns 200 with cleanup results
     * @returns 401 if token invalid or missing
     */
    fastify.post<{
      Body: { inactivityTimeoutMs?: number };
    }>('/management/cleanup', async (request, reply) => {
      // extract and validate authentication token
      const token = extractBearerToken(
        lastHeader(request.headers, 'authorization'),
      );

      const expectedToken =
        managementToken ?? process.env.COREMCP_MANAGEMENT_TOKEN;

      if (!expectedToken || token !== expectedToken) {
        log?.('warn', 'Unauthorized management endpoint access attempt', {
          endpoint: '/management/cleanup',
          hasToken: !!token,
        });

        return reply.code(HTTP_UNAUTHORIZED).send({
          error: 'unauthorized',
          message: 'Invalid or missing management token',
        });
      }

      // parse inactivity timeout from request body
      const { inactivityTimeoutMs } = request.body;

      // validate timeout if provided
      if (
        inactivityTimeoutMs !== undefined &&
        (typeof inactivityTimeoutMs !== 'number' || inactivityTimeoutMs < 0)
      ) {
        return reply.code(HTTP_BAD_REQUEST).send({
          error: 'invalid_request',
          message: 'inactivityTimeoutMs must be a positive number',
        });
      }

      // trigger cleanup
      const timeout = inactivityTimeoutMs;

      const count = server.cleanupInactiveSessions();

      log?.('info', 'Management cleanup completed', {
        sessionsCleanedUp: count,
        inactivityTimeoutMs: timeout,
      });

      return reply.send({
        success: true,
        sessionsCleanedUp: count,
        inactivityTimeoutMs: timeout,
        timestamp: new Date().toISOString(),
      });
    });
  };
}
