import { HTTP_OK } from '#constants/http';
import { inferBaseUrlFromRequest } from '#request-context';

import { createProtectedResourceMetadata } from '../resource-server/discovery';

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

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
    const sendProtectedResourceMetadata = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> => {
      const authServerUrl = inferBaseUrlFromRequest(request);
      const requestPath = request.url.split('?')[0];
      const resourcePath =
        requestPath.replace('/.well-known/oauth-protected-resource', '') || '';
      const resourceUrl = `${authServerUrl}${resourcePath}`;
      const metadata = createProtectedResourceMetadata(
        resourceUrl,
        options,
        authServerUrl,
      );

      void reply.code(HTTP_OK).send(metadata);
    };

    fastify.get(
      '/.well-known/oauth-protected-resource',
      sendProtectedResourceMetadata,
    );
    fastify.get(
      '/.well-known/oauth-protected-resource/*',
      sendProtectedResourceMetadata,
    );

    // note: OAuth 2.0 Authorization Server Metadata for proxy mode
    // is registered separately in the proxy route handlers
  };
}
