/**
 * @module oauth/proxy/handlers/registration
 * @description Client registration handler for the OAuth proxy (RFC 7591).
 * Handles dynamic client registration requests locally.
 */

import { HTTP_BAD_REQUEST, HTTP_CREATED } from '#constants/http';
import { MS_PER_SECOND } from '#constants/time';

import {
  ClientRegistrationError,
  handleClientRegistration,
} from '../registration';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProxyStorageAdapter } from '../adapter';
import type { OAuthProxyConfig } from '../config';
import type { ClientRegistrationResponse } from '../registration';
import type {
  ProxyClientRegistrationRequestWire,
  ProxyClientRegistrationResponseWire,
} from '../types';

// HELPER FUNCTIONS //

/**
 * validates the registration request body.
 * @param body request body to validate
 * @returns error response or null if valid
 */
function validateRequestBody(
  body: ProxyClientRegistrationRequestWire,
): { error: string; description: string } | null {
  // redirect_uris must have at least one entry
  if (body.redirect_uris.length === 0) {
    return {
      error: 'invalid_redirect_uri',
      description: 'redirect_uris must contain at least one URI',
    };
  }

  return null;
}

/**
 * builds the RFC 7591 compliant registration response.
 * @param result registration result from handler
 * @param baseUrl base URL for client URI
 * @returns wire format response
 */
function buildRegistrationResponse(
  result: ClientRegistrationResponse,
  baseUrl: string,
): ProxyClientRegistrationResponseWire {
  return {
    client_id: result.client_id,
    client_secret: result.client_secret,
    registration_access_token: result.client_secret,
    registration_client_uri: `${baseUrl}/oauth/clients/${result.client_id}`,
    client_name: result.client_name,
    redirect_uris: result.redirect_uris,
    grant_types:
      result.grant_types as ProxyClientRegistrationResponseWire['grant_types'],
    response_types:
      result.response_types as ProxyClientRegistrationResponseWire['response_types'],
    scope: result.scope ?? 'mcp',
    token_endpoint_auth_method:
      result.token_endpoint_auth_method as ProxyClientRegistrationResponseWire['token_endpoint_auth_method'],
    client_id_issued_at: Math.floor(Date.now() / MS_PER_SECOND),
    client_secret_expires_at: result.client_secret_expires_at,
  };
}

// REGISTRATION HANDLER //

/**
 * handles POST /oauth/register - dynamic client registration.
 * Stores clients locally since external AS does not support RFC 7591.
 * @param request fastify request with registration body
 * @param reply fastify reply object
 * @param config proxy configuration
 * @param storage storage adapter for client data
 * @param baseUrl base URL for registration client URI
 */
export async function handleProxyClientRegistration(
  request: FastifyRequest<{
    Body: ProxyClientRegistrationRequestWire;
  }>,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  baseUrl: string,
): Promise<void> {
  const body = request.body;

  // validate request body
  const validationError = validateRequestBody(body);

  if (validationError) {
    void reply.status(HTTP_BAD_REQUEST).send({
      error: validationError.error,
      error_description: validationError.description,
    });

    return;
  }

  try {
    // delegate to registration handler
    const result = await handleClientRegistration(
      {
        client_name: body.client_name,
        redirect_uris: body.redirect_uris,
        grant_types: body.grant_types,
        response_types: body.response_types,
        token_endpoint_auth_method: body.token_endpoint_auth_method,
        scope: body.scope,
        contacts: body.contacts,
        logo_uri: body.logo_uri,
        client_uri: body.client_uri,
        policy_uri: body.policy_uri,
        tos_uri: body.tos_uri,
      },
      storage,
      config.allowedScopes,
    );

    const response = buildRegistrationResponse(result, baseUrl);

    void reply.status(HTTP_CREATED).send(response);
  } catch (error) {
    if (error instanceof ClientRegistrationError) {
      void reply.status(HTTP_BAD_REQUEST).send({
        error: error.code,
        error_description: error.message,
      });

      return;
    }

    void reply.status(HTTP_BAD_REQUEST).send({
      error: 'server_error',
      error_description:
        error instanceof Error ? error.message : 'Registration failed',
    });
  }
}
