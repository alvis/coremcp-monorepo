import { HTTP_OK } from '#constants/http';
import { inferBaseUrlFromRequest } from '#request-context';

import { createProtectedResourceMetadata } from '../resource-server/discovery';

import type { FastifyPluginAsync } from 'fastify';

import type { AuthOptions } from '../types';

/**
 * registers well-known discovery endpoints for resource server
 * @param options http transport options
 * @returns fastify plugin async function
 */
export function registerWellKnownRoutes(
  options: AuthOptions,
): FastifyPluginAsync {
  return async (fastify) => {
    // oAuth 2.0 Protected Resource Metadata
    // always available as this is a resource server
    fastify.get(
      '/.well-known/oauth-protected-resource',
      async (request, reply) => {
        const baseUrl = inferBaseUrlFromRequest(request);
        const metadata = createProtectedResourceMetadata(baseUrl, options);

        void reply.code(HTTP_OK).send(metadata);
      },
    );

    // note: OAuth 2.0 Authorization Server Metadata for proxy mode
    // is registered separately in the proxy route handlers
  };
}
