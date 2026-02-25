import { HTTP_OK } from '#constants/http';
import { inferBaseUrlFromRequest } from '#request-context';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthOptions } from '../types';

import type { ProtectedResourceMetadata } from './types';

/**
 * creates protected resource metadata for resource server
 * @param baseUrl base url of the resource server
 * @param options OAuth configuration options
 * @returns protected resource metadata
 */
export function createProtectedResourceMetadata(
  baseUrl: string,
  options: AuthOptions,
): ProtectedResourceMetadata {
  const metadata: ProtectedResourceMetadata = {
    resource: baseUrl,
    bearer_methods_supported: ['header'],
    scopes_supported: [],
  };

  // determine authorization servers based on mode
  if (options.mode === 'proxy') {
    // proxy mode: this server acts as proxy, so it's the authorization server
    metadata.authorization_servers = [baseUrl];
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
 * @param options.baseUrl optional base URL override, defaults to inferring from request
 * @param options.auth authentication configuration for the resource server
 */
export async function handleProtectedResourceMetadata(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    baseUrl?: string;
    auth: AuthOptions;
  },
): Promise<void> {
  const baseUrl = options.baseUrl ?? inferBaseUrlFromRequest(request);
  const metadata = createProtectedResourceMetadata(baseUrl, options.auth);

  reply.code(HTTP_OK).send(metadata);
}
