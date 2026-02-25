import type { FastifyPluginAsync } from 'fastify';

import { HTTP_OK } from '#constants/http';

/**
 * registers utility routes like health check
 * @returns fastify plugin async function
 */
export function registerUtilityRoutes(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/health', async (_request, reply) =>
      reply.status(HTTP_OK).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
      }),
    );
  };
}
