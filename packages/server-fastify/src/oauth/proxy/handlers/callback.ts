/**
 * @module oauth/proxy/handlers/callback
 * @description callback handler for the OAuth proxy.
 * Receives authorization code from external AS and redirects to original client.
 */

import { HTTP_BAD_REQUEST } from '#constants/http';

import { decodeProxyState, ProxyStateError } from '../state';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthCodeMapping, ProxyStorageAdapter } from '../adapter';
import type { OAuthProxyConfig } from '../config';
import type { ProxyState } from '../state';

// CONSTANTS //

/** Authorization code expiry: 10 minutes in milliseconds */
const AUTH_CODE_EXPIRY_MS = 600_000;

// TYPES //

/** Query parameters for callback request (OAuth wire format) */
interface CallbackQueryWire {
  /** Authorization code from external AS */
  code?: string;
  /** Encoded proxy state */
  state?: string;
  /** OAuth error code (if authorization failed) */
  error?: string;
  /** OAuth error description */
  error_description?: string;
  /** OAuth error URI */
  error_uri?: string;
}

// HELPER FUNCTIONS //

/**
 * sends an error redirect to the original client.
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
  state: string | undefined,
): void {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);

  if (state) {
    url.searchParams.set('state', state);
  }

  void reply.redirect(url.toString());
}

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

/**
 * stores the auth code mapping and redirects to original client.
 * @param reply fastify reply object
 * @param storage proxy storage adapter
 * @param code authorization code from external AS
 * @param proxyState decoded proxy state containing original client info
 */
async function storeAndRedirect(
  reply: FastifyReply,
  storage: ProxyStorageAdapter,
  code: string,
  proxyState: ProxyState,
): Promise<void> {
  const now = Date.now();
  const authCodeMapping: AuthCodeMapping = {
    clientId: proxyState.clientId,
    redirectUri: proxyState.redirectUri,
    codeChallenge: proxyState.codeChallenge,
    codeChallengeMethod: proxyState.codeChallengeMethod,
    scope: proxyState.scope,
    issuedAt: now,
    expiresAt: now + AUTH_CODE_EXPIRY_MS,
  };

  await storage.upsertAuthCodeMapping(code, authCodeMapping);

  // redirect to original client with authorization code
  const clientUrl = new URL(proxyState.redirectUri);
  clientUrl.searchParams.set('code', code);

  if (proxyState.originalState) {
    clientUrl.searchParams.set('state', proxyState.originalState);
  }

  void reply.redirect(clientUrl.toString());
}

// CALLBACK HANDLER //

/**
 * handles GET /oauth/callback - receives auth code from external AS.
 * @param request fastify request with callback query parameters
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 */
export async function handleCallback(
  request: FastifyRequest<{
    Querystring: CallbackQueryWire;
  }>,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
): Promise<void> {
  const query = request.query;
  const stateParam = query.state;

  // validate state is present
  if (!stateParam) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_request',
      'Missing state parameter',
    );

    return;
  }

  // decode and verify proxy state
  let proxyState: ProxyState;

  try {
    proxyState = await decodeProxyState(stateParam, config.stateSecret);
  } catch (stateError) {
    if (stateError instanceof ProxyStateError) {
      sendErrorResponse(
        reply,
        HTTP_BAD_REQUEST,
        'invalid_request',
        `Invalid state: ${stateError.message}`,
      );

      return;
    }

    throw stateError;
  }

  // if external AS returned an error, forward it to the original client
  if (query.error) {
    sendErrorRedirect(
      reply,
      proxyState.redirectUri,
      query.error,
      query.error_description ?? 'Authorization failed',
      proxyState.originalState,
    );

    return;
  }

  // validate authorization code is present
  if (!query.code) {
    sendErrorRedirect(
      reply,
      proxyState.redirectUri,
      'server_error',
      'Missing authorization code from authorization server',
      proxyState.originalState,
    );

    return;
  }

  // store auth code mapping and redirect to original client
  await storeAndRedirect(reply, storage, query.code, proxyState);
}
