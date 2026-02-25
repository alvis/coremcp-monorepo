/**
 * @module oauth/proxy/handlers/introspect
 * @description introspection handler for the OAuth proxy.
 * Forwards introspection to external AS and enriches response with local client info.
 */

import { HTTP_UNAUTHORIZED } from '#constants/http';

import { createBasicAuthHeader, forwardFormRequest } from '../forwarder';
import { validateClientCredentials } from '../registration';
import {
  extractClientCredentials,
  hashToken,
  sendErrorResponse,
} from '../proxy-crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProxyStorageAdapter } from '../adapter';
import type { OAuthProxyConfig } from '../config';
import type {
  ProxyIntrospectionRequestWire,
  ProxyIntrospectionResponseWire,
} from '../types';

/**
 * enriches introspection response with local client information.
 * @param response introspection response from external AS
 * @param token access token to lookup
 * @param storage proxy storage adapter
 * @returns enriched introspection response
 */
async function enrichIntrospectionResponse(
  response: ProxyIntrospectionResponseWire,
  token: string,
  storage: ProxyStorageAdapter,
): Promise<ProxyIntrospectionResponseWire> {
  // only enrich active tokens
  if (!response.active) {
    return response;
  }

  // lookup token mapping
  const tokenHash = hashToken(token);
  const mapping = await storage.findTokenMapping(tokenHash);

  if (mapping) {
    return {
      ...response,
      client_id: mapping.clientId,
    };
  }

  return response;
}

// INTROSPECTION HANDLER //

/**
 * handles POST /oauth/introspect - proxies introspection to external AS.
 * @param request fastify request with introspection body
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 */
export async function handleIntrospect(
  request: FastifyRequest<{
    Body: ProxyIntrospectionRequestWire;
  }>,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
): Promise<void> {
  const { token, token_type_hint: tokenTypeHint } = request.body;

  // extract and validate client credentials
  const credentials = extractClientCredentials(request);

  if (!credentials) {
    sendErrorResponse(
      reply,
      HTTP_UNAUTHORIZED,
      'invalid_client',
      'Client authentication required',
    );

    return;
  }

  // validate client credentials
  const client = await validateClientCredentials(
    credentials.clientId,
    credentials.clientSecret,
    storage,
  );

  if (!client) {
    sendErrorResponse(
      reply,
      HTTP_UNAUTHORIZED,
      'invalid_client',
      'Invalid client credentials',
    );

    return;
  }

  // forward to external AS
  const introspectionEndpoint =
    config.externalAS.introspectionEndpoint ??
    `${config.externalAS.issuer}/oauth/introspect`;

  const authHeader = createBasicAuthHeader(
    config.proxyClient.clientId,
    config.proxyClient.clientSecret,
  );

  const result = await forwardFormRequest<ProxyIntrospectionResponseWire>(
    introspectionEndpoint,
    { Authorization: authHeader },
    {
      token,
      token_type_hint: tokenTypeHint,
    },
  );

  if (!result.success || !result.data) {
    // return inactive token response on error (per RFC 7662)
    void reply.send({ active: false });

    return;
  }

  // enrich response with local client info
  const enrichedResponse = await enrichIntrospectionResponse(
    result.data,
    token,
    storage,
  );

  void reply.send(enrichedResponse);
}
