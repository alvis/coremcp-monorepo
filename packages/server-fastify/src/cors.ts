import { HTTP_OK } from '#constants/http';

import type { FastifyInstance } from 'fastify';

/**
 * configures cors headers for cross-origin mcp requests
 * @param server the fastify server instance to configure
 */
export function setupCORS(server: FastifyInstance): void {
  server.addHook('preHandler', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    reply.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
    );

    if (request.method === 'OPTIONS') {
      reply.code(HTTP_OK).send();
    }
  });
}
