/**
 * @module oauth/proxy/handlers/metadata
 * @description Metadata handler for the OAuth proxy (RFC 8414).
 * Returns merged authorization server metadata combining proxy endpoints
 * with external AS capabilities.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OAuthProxyConfig } from '../config';
import type { ProxyAuthServerMetadataWire } from '../types';

// METADATA HANDLER //

/**
 * handles GET /.well-known/oauth-authorization-server - returns merged metadata.
 * Combines proxy endpoints with external AS metadata to present a unified view.
 * @param _request fastify request object (unused)
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param baseUrl server base URL for endpoint construction
 */
export async function handleMetadata(
  _request: FastifyRequest,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  baseUrl: string,
): Promise<void> {
  // build merged metadata response
  // the proxy presents itself as the authorization server to clients
  const metadata: ProxyAuthServerMetadataWire = {
    // proxy as issuer
    'issuer': baseUrl,

    // proxy endpoints
    'authorization_endpoint': `${baseUrl}/oauth/authorize`,
    'token_endpoint': `${baseUrl}/oauth/token`,
    'registration_endpoint': `${baseUrl}/oauth/register`,

    // optional proxy endpoints
    'introspection_endpoint': `${baseUrl}/oauth/introspect`,
    'revocation_endpoint': `${baseUrl}/oauth/revoke`,

    // supported features (proxy validates these)
    'response_types_supported': ['code'],
    'grant_types_supported': ['authorization_code', 'refresh_token'],
    'token_endpoint_auth_methods_supported': [
      'client_secret_basic',
      'client_secret_post',
    ],
    'code_challenge_methods_supported': ['S256', 'plain'],

    // scopes from config if available
    'scopes_supported': config.allowedScopes,

    // proxy-specific metadata extensions
    'x-proxy-mode': true,
    'x-upstream-issuer': config.externalAS.issuer,
  };

  void reply.send(metadata);
}
