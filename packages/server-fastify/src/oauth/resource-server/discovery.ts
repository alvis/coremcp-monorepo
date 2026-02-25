import { HTTP_OK } from '#constants/http';
import { inferBaseUrlFromRequest } from '#request-context';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthOptions } from '../types';

import type { ProtectedResourceMetadata } from './types';

/**
 * creates protected resource metadata for resource server
 * @param resourceUrl full resource URL exposed by the protected resource server
 * @param options OAuth configuration options
 * @param authServerUrl base URL of the authorization server when this process also serves OAuth endpoints
 * @returns protected resource metadata
 */
export function createProtectedResourceMetadata(
  resourceUrl: string,
  options: AuthOptions,
  authServerUrl = resourceUrl,
): ProtectedResourceMetadata {
  const metadata: ProtectedResourceMetadata = {
    resource: resourceUrl,
    bearer_methods_supported: ['header'],
    scopes_supported: [],
  };

  // determine authorization servers based on mode
  if (options.mode === 'proxy') {
    // proxy mode: this server acts as proxy, so it's the authorization server
    metadata.authorization_servers = [authServerUrl];
    metadata.scopes_supported = options.requiredScopes ?? [];
  } else if (options.mode === 'external') {
    metadata.authorization_servers = [options.config.issuer];
    metadata.scopes_supported = options.requiredScopes ?? [];
  } else {
    // anonymous mode has no authorization servers
    metadata.authorization_servers = [];
  }

  return metadata;
}

/**
 * handles protected resource metadata endpoint request
 * @param request fastify request
 * @param reply fastify reply
 * @param options OAuth configuration options
 * @param options.resourceUrl optional resource URL override, defaults to inferring from request
 * @param options.authServerUrl optional auth server URL override, defaults to the resource URL
 * @param options.auth authentication configuration for the resource server
 */
export async function handleProtectedResourceMetadata(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    resourceUrl?: string;
    authServerUrl?: string;
    auth: AuthOptions;
  },
): Promise<void> {
  const resourceUrl = options.resourceUrl ?? inferBaseUrlFromRequest(request);
  const metadata = createProtectedResourceMetadata(
    resourceUrl,
    options.auth,
    options.authServerUrl ?? resourceUrl,
  );

  reply.code(HTTP_OK).send(metadata);
}
