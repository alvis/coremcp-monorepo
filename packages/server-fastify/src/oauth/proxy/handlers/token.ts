/**
 * @module oauth/proxy/handlers/token
 * @description Token handler for the OAuth proxy.
 * Validates local client, verifies PKCE, and forwards token request to external AS.
 */

import { HTTP_BAD_REQUEST, HTTP_UNAUTHORIZED } from '#constants/http';
import { MS_PER_SECOND } from '#constants/time';

import {
  createBasicAuthHeader,
  forwardFormRequest,
  ForwarderError,
} from '../forwarder';
import { validateClientCredentials } from '../registration';
import {
  extractClientCredentials,
  hashToken,
  sendErrorResponse,
  validateCodeMapping,
  validateCodeVerifier,
} from '../proxy-crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProxyStorageAdapter } from '../adapter';
import type { OAuthProxyConfig } from '../config';
import type { ForwardResult } from '../forwarder';
import type { ProxyTokenRequestWire, ProxyTokenResponseWire } from '../types';
import type { ClientCredentials } from '../proxy-crypto';

/**
 * stores access and refresh token mappings after successful token exchange.
 * @param storage proxy storage adapter
 * @param tokenResponse token response from external AS
 * @param clientId client identifier for mapping
 */
async function storeTokenMappings(
  storage: ProxyStorageAdapter,
  tokenResponse: ProxyTokenResponseWire,
  clientId: string,
): Promise<void> {
  const now = Date.now();
  await storage.upsertTokenMapping(hashToken(tokenResponse.access_token), {
    clientId,
    tokenType: 'access_token',
    issuedAt: now,
    expiresAt: now + tokenResponse.expires_in * MS_PER_SECOND,
  });
  if (tokenResponse.refresh_token) {
    await storage.upsertTokenMapping(hashToken(tokenResponse.refresh_token), {
      clientId,
      tokenType: 'refresh_token',
      issuedAt: now,
    });
  }
}

/**
 * forwards token request to external AS.
 * @param config OAuth proxy configuration
 * @param params form parameters to forward
 * @returns forward result with token response
 */
async function forwardTokenRequest(
  config: OAuthProxyConfig,
  params: Record<string, string | undefined>,
): Promise<ForwardResult<ProxyTokenResponseWire>> {
  const tokenEndpoint =
    config.externalAS.tokenEndpoint ??
    `${config.externalAS.issuer}/oauth/token`;
  const authHeader = createBasicAuthHeader(
    config.proxyClient.clientId,
    config.proxyClient.clientSecret,
  );

  return forwardFormRequest<ProxyTokenResponseWire>(
    tokenEndpoint,
    { Authorization: authHeader },
    params,
  );
}

/**
 * handles the forward result and stores token mappings.
 * @param reply fastify reply object
 * @param result forward result from external AS
 * @param storage proxy storage adapter
 * @param clientId client identifier for token mapping
 * @returns true if successful, false otherwise
 */
async function handleForwardResult(
  reply: FastifyReply,
  result: ForwardResult<ProxyTokenResponseWire>,
  storage: ProxyStorageAdapter,
  clientId: string,
): Promise<boolean> {
  if (!result.success || !result.data) {
    const error =
      result.error ??
      new ForwarderError({
        message: 'token exchange failed',
        statusCode: HTTP_BAD_REQUEST,
        errorCode: 'server_error',
        errorDescription: 'token exchange failed',
      });
    void reply.status(result.statusCode).send(error.toWireFormat());

    return false;
  }
  await storeTokenMappings(storage, result.data, clientId);
  void reply.status(result.statusCode).send(result.data);

  return true;
}

/**
 * handles authorization_code grant type.
 * @param code authorization code
 * @param redirectUri redirect URI from request
 * @param codeVerifier PKCE code verifier
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 * @param credentials validated client credentials
 * @returns true if grant succeeded, false otherwise
 */
async function handleAuthorizationCodeGrant(
  code: string,
  redirectUri: string | undefined,
  codeVerifier: string | undefined,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  credentials: ClientCredentials,
): Promise<boolean> {
  const codeMapping = await storage.consumeAuthCodeMapping(code);
  if (!codeMapping) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_grant',
      'invalid or expired authorization code',
    );

    return false;
  }
  if (!validateCodeMapping(codeMapping, credentials, redirectUri, reply)) {
    return false;
  }
  if (!validateCodeVerifier(codeMapping, codeVerifier, reply)) {
    return false;
  }
  const result = await forwardTokenRequest(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.proxyClient.redirectUri,
    code_verifier: codeVerifier,
  });

  return handleForwardResult(reply, result, storage, credentials.clientId);
}

/**
 * handles refresh_token grant type.
 * @param refreshToken refresh token
 * @param scope requested scope
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 * @param credentials validated client credentials
 * @returns true if grant succeeded, false otherwise
 */
async function handleRefreshTokenGrant(
  refreshToken: string,
  scope: string | undefined,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  credentials: ClientCredentials,
): Promise<boolean> {
  const result = await forwardTokenRequest(config, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope,
  });

  return handleForwardResult(reply, result, storage, credentials.clientId);
}

/**
 * validates client credentials and returns them if valid.
 * @param request fastify request with token body
 * @param reply fastify reply object
 * @param storage proxy storage adapter
 * @returns validated credentials or null if invalid
 */
async function validateAndExtractCredentials(
  // NOTE: Body is Fastify generic type parameter convention
  // eslint-disable-next-line @typescript-eslint/naming-convention
  request: FastifyRequest<{ Body: ProxyTokenRequestWire }>,
  reply: FastifyReply,
  storage: ProxyStorageAdapter,
): Promise<ClientCredentials | null> {
  const credentials = extractClientCredentials(request);
  if (!credentials) {
    sendErrorResponse(
      reply,
      HTTP_UNAUTHORIZED,
      'invalid_client',
      'client authentication required',
    );

    return null;
  }
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
      'invalid client credentials',
    );

    return null;
  }

  return credentials;
}

/**
 * dispatches authorization_code grant.
 * @param body request body
 * @param reply fastify reply
 * @param config proxy config
 * @param storage storage adapter
 * @param credentials client credentials
 */
async function dispatchAuthCodeGrant(
  body: ProxyTokenRequestWire,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  credentials: ClientCredentials,
): Promise<void> {
  const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body;
  if (!code) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_request',
      'code is required',
    );

    return;
  }
  await handleAuthorizationCodeGrant(
    code,
    redirectUri,
    codeVerifier,
    reply,
    config,
    storage,
    credentials,
  );
}

/**
 * dispatches refresh_token grant.
 * @param body request body
 * @param reply fastify reply
 * @param config proxy config
 * @param storage storage adapter
 * @param credentials client credentials
 */
async function dispatchRefreshGrant(
  body: ProxyTokenRequestWire,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  credentials: ClientCredentials,
): Promise<void> {
  const { refresh_token: refreshToken, scope } = body;
  if (!refreshToken) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_request',
      'refresh_token is required',
    );

    return;
  }
  await handleRefreshTokenGrant(
    refreshToken,
    scope,
    reply,
    config,
    storage,
    credentials,
  );
}

/**
 * handles POST /oauth/token - proxies token request to external AS.
 * @param request fastify request with token body
 * @param reply fastify reply object
 * @param config OAuth proxy configuration
 * @param storage proxy storage adapter
 */
export async function handleToken(
  // NOTE: Body is Fastify generic type parameter convention
  // eslint-disable-next-line @typescript-eslint/naming-convention
  request: FastifyRequest<{ Body: ProxyTokenRequestWire }>,
  reply: FastifyReply,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
): Promise<void> {
  const credentials = await validateAndExtractCredentials(
    request,
    reply,
    storage,
  );
  if (!credentials) {
    return;
  }

  const { grant_type: grantType } = request.body;
  switch (grantType) {
    case 'authorization_code':
      await dispatchAuthCodeGrant(
        request.body,
        reply,
        config,
        storage,
        credentials,
      );
      break;
    case 'refresh_token':
      await dispatchRefreshGrant(
        request.body,
        reply,
        config,
        storage,
        credentials,
      );
      break;
    default:
      sendErrorResponse(
        reply,
        HTTP_BAD_REQUEST,
        'unsupported_grant_type',
        `unsupported grant_type: ${grantType}`,
      );
  }
}
