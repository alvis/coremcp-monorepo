/**
 * @module oauth/proxy/handlers/revoke
 * @description Revocation handler for the OAuth proxy.
 * Forwards revocation to external AS and cleans up local token mappings.
 */

import { HTTP_UNAUTHORIZED, HTTP_OK } from '#constants/http';

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
import type { ProxyRevocationRequestWire } from '../types';

// REVOCATION HANDLER //

/**
 * handles POST /oauth/revoke - proxies revocation to external AS.
 * @param request fastify request with revocation body
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 */
export async function handleRevoke(
  request: FastifyRequest<{
    Body: ProxyRevocationRequestWire;
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
  const revocationEndpoint =
    config.externalAS.revocationEndpoint ??
    `${config.externalAS.issuer}/oauth/revoke`;

  const authHeader = createBasicAuthHeader(
    config.proxyClient.clientId,
    config.proxyClient.clientSecret,
  );

  // forward revocation request (we don't care about the result per RFC 7009)
  await forwardFormRequest(
    revocationEndpoint,
    { Authorization: authHeader },
    {
      token,
      token_type_hint: tokenTypeHint,
    },
  );

  // delete local token mapping if it exists
  const tokenHash = hashToken(token);

  await storage.destroyTokenMapping(tokenHash);

  // RFC 7009: always return 200 OK for revocation
  void reply.status(HTTP_OK).send();
}
