/**
 * @module oauth/proxy/handlers/authorize
 * @description authorization handler for the OAuth proxy.
 * Validates local client, encodes proxy state, and redirects to external AS.
 */

import { HTTP_BAD_REQUEST } from '#constants/http';

import { encodeProxyState } from '../state';
import { sendErrorResponse } from '../proxy-crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProxyStorageAdapter } from '../adapter';
import type { OAuthProxyConfig } from '../config';
import type { ProxyAuthorizeRequestWire } from '../types';

// ERROR RESPONSE HELPERS //

/**
 * sends an OAuth error response by redirecting to the client's redirect_uri.
 * @param reply fastify reply object
 * @param redirectUri client redirect URI
 * @param error OAuth error code
 * @param errorDescription human readable error description
 * @param state optional client state parameter
 */
function sendErrorRedirect(
  reply: FastifyReply,
  redirectUri: string,
  error: string,
  errorDescription: string,
  state?: string,
): void {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);

  if (state) {
    url.searchParams.set('state', state);
  }

  void reply.redirect(url.toString());
}

// VALIDATION HELPERS //

/**
 * validates the authorization request parameters.
 * @param query authorization request query parameters
 * @param reply fastify reply object
 * @returns error response if validation fails, null if valid
 */
function validateAuthRequest(
  query: ProxyAuthorizeRequestWire,
  reply: FastifyReply,
): { clientId: string; redirectUri: string } | null {
  const { client_id: clientId, redirect_uri: redirectUri } = query;

  // validate client_id is provided
  if (!clientId) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_request',
      'client_id is required',
    );

    return null;
  }

  // validate redirect_uri is provided
  if (!redirectUri) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_request',
      'redirect_uri is required',
    );

    return null;
  }

  return { clientId, redirectUri };
}

/**
 * builds the external AS authorization URL with proxy parameters.
 * @param config OAuth proxy configuration
 * @param proxyState encoded proxy state JWT
 * @param query authorization request query parameters
 * @returns constructed URL for external AS authorization endpoint
 */
function buildExternalAuthUrl(
  config: OAuthProxyConfig,
  proxyState: string,
  query: ProxyAuthorizeRequestWire,
): URL {
  const externalAuthUrl = new URL(
    config.externalAS.authorizationEndpoint ??
      `${config.externalAS.issuer}/oauth/authorize`,
  );

  // set proxy client credentials
  externalAuthUrl.searchParams.set('client_id', config.proxyClient.clientId);
  externalAuthUrl.searchParams.set(
    'redirect_uri',
    config.proxyClient.redirectUri,
  );
  externalAuthUrl.searchParams.set('response_type', 'code');
  externalAuthUrl.searchParams.set('state', proxyState);

  // copy scope if provided
  if (query.scope) {
    externalAuthUrl.searchParams.set('scope', query.scope);
  }

  // copy PKCE parameters (external AS may or may not support them)
  if (query.code_challenge) {
    externalAuthUrl.searchParams.set('code_challenge', query.code_challenge);
    externalAuthUrl.searchParams.set(
      'code_challenge_method',
      query.code_challenge_method ?? 'S256',
    );
  }

  // copy nonce if provided (OpenID Connect)
  if (query.nonce) {
    externalAuthUrl.searchParams.set('nonce', query.nonce);
  }

  return externalAuthUrl;
}

// AUTHORIZATION HANDLER //

/**
 * handles GET /oauth/authorize - proxies authorization to external AS.
 * @param request fastify request with authorization query parameters
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 */
export async function handleAuthorize(
  request: FastifyRequest<{
    Querystring: ProxyAuthorizeRequestWire;
  }>,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
): Promise<void> {
  const query = request.query;

  // validate basic request parameters
  const validated = validateAuthRequest(query, reply);

  if (!validated) {
    return;
  }

  const { clientId, redirectUri } = validated;
  const state = query.state;

  // lookup client in local storage
  const client = await storage.findClient(clientId);

  if (!client) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_client',
      'Client not found',
    );

    return;
  }

  // validate redirect_uri matches registered URIs
  if (!client.redirect_uris.includes(redirectUri)) {
    // security: do not redirect to unregistered URIs
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_redirect_uri',
      'redirect_uri not registered for this client',
    );

    return;
  }

  // validate scope if allowedScopes is configured
  if (query.scope && config.allowedScopes) {
    const requestedScopes = query.scope.split(' ');
    const invalidScopes = requestedScopes.filter(
      (s) => !config.allowedScopes?.includes(s),
    );

    if (invalidScopes.length > 0) {
      sendErrorRedirect(
        reply,
        redirectUri,
        'invalid_scope',
        `Invalid scope(s): ${invalidScopes.join(', ')}`,
        state,
      );

      return;
    }
  }

  // encode proxy state
  const proxyState = await encodeProxyState(
    {
      clientId,
      redirectUri,
      originalState: state,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method ?? 'S256',
      scope: query.scope,
      timestamp: Date.now(),
    },
    config.stateSecret,
    config.stateExpirySeconds,
  );

  // build and redirect to external AS
  const externalAuthUrl = buildExternalAuthUrl(config, proxyState, query);

  void reply.redirect(externalAuthUrl.toString());
}
