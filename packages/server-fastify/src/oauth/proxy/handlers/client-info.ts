/**
 * @module oauth/proxy/handlers/client-info
 * @description client info handler for the OAuth proxy (RFC 7592).
 * Returns public client information for registered clients.
 */

import { HTTP_NOT_FOUND } from '#constants/http';
import { MS_PER_SECOND } from '#constants/time';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProxyStorageAdapter } from '../adapter';
import type { ProxyClientInfoResponseWire } from '../types';

// TYPES //

/** Route parameters for client info endpoint */
interface ClientInfoParams {
  /** OAuth client identifier */
  client_id: string;
}

// ERROR RESPONSE HELPERS //

/**
 * sends an error response as JSON.
 * @param reply fastify reply object
 * @param statusCode HTTP status code
 * @param error OAuth error code
 * @param errorDescription human readable error description
 */
function sendErrorResponse(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  errorDescription: string,
): void {
  void reply.status(statusCode).send({
    error,
    error_description: errorDescription,
  });
}

// CLIENT INFO HANDLER //

/**
 * handles GET /oauth/clients/:client_id - returns client info.
 * Per RFC 7592, this endpoint returns public client information.
 * @param request fastify request with client_id param
 * @param reply fastify reply object
 * @param storage proxy storage adapter
 */
export async function handleClientInfo(
  request: FastifyRequest<{
    Params: ClientInfoParams;
  }>,
  reply: FastifyReply,
  storage: ProxyStorageAdapter,
): Promise<void> {
  const { client_id: clientId } = request.params;

  // validate client_id is provided
  if (!clientId) {
    sendErrorResponse(
      reply,
      HTTP_NOT_FOUND,
      'invalid_request',
      'client_id is required',
    );

    return;
  }

  // lookup client in local storage
  const client = await storage.findClient(clientId);

  if (!client) {
    sendErrorResponse(
      reply,
      HTTP_NOT_FOUND,
      'invalid_client',
      'Client not found',
    );

    return;
  }

  // for RFC 7592 compliance, the client info endpoint should be protected
  // by the registration_access_token. For simplicity, we allow access
  // to public client info without authentication.
  // In a production system, you would validate the registration_access_token here.

  // build public client info response (exclude secret hash)
  const response: ProxyClientInfoResponseWire = {
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types:
      client.grant_types as ProxyClientInfoResponseWire['grant_types'],
    response_types:
      client.response_types as ProxyClientInfoResponseWire['response_types'],
    scope: client.scope ?? 'mcp',
    token_endpoint_auth_method:
      client.token_endpoint_auth_method as ProxyClientInfoResponseWire['token_endpoint_auth_method'],
    client_id_issued_at: Math.floor(client.created_at / MS_PER_SECOND),
  };

  // add optional metadata
  if (client.metadata) {
    const meta = client.metadata;

    if (typeof meta.client_uri === 'string') {
      response.client_uri = meta.client_uri;
    }
    if (typeof meta.logo_uri === 'string') {
      response.logo_uri = meta.logo_uri;
    }
    if (typeof meta.tos_uri === 'string') {
      response.tos_uri = meta.tos_uri;
    }
    if (typeof meta.policy_uri === 'string') {
      response.policy_uri = meta.policy_uri;
    }
  }

  void reply.send(response);
}
