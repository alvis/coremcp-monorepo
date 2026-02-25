/**
 * @module oauth/proxy/setup
 * @description OAuth proxy setup for HTTPTransport integration.
 * Provides functions to register proxy routes and create middleware.
 */

import { createHash } from 'node:crypto';

import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from '#constants/http';

import { MemoryProxyStorageAdapter } from './adapter';
import { validateProxyConfig } from './config';
import { createProxyHandlers } from './handlers';
import { handleClientInfo } from './handlers/client-info';
import { handleMetadata } from './handlers/metadata';
import { handleProxyClientRegistration } from './handlers/registration';
import { PROXY_ROUTES } from './routes';

import type { IncomingHttpHeaders } from 'node:http';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ResolveUserId } from '#types';

import type { ProxyAuthOptions } from '../types';

import type { OAuthProxyConfig } from './config';

// CONSTANTS //

/** length of 'Bearer ' prefix */
const BEARER_PREFIX_LENGTH = 7;

// TYPES //

/**
 * options for setting up proxy auth
 */
export interface ProxyAuthSetupOptions {
  /** fastify instance to register routes on */
  fastify: FastifyInstance;
  /** proxy auth configuration */
  auth: ProxyAuthOptions;
  /** optional base URL override */
  baseUrl?: string;
  /** function to infer base URL from request */
  inferBaseUrl: (request: FastifyRequest) => string;
  /** function to create unauthorized error */
  createUnauthorizedError: () => Error;
  /** function to extract bearer token from header */
  extractBearerToken: (header: string | undefined) => string | undefined;
  /** function to get last header value */
  lastHeader: (
    headers: IncomingHttpHeaders,
    header: string,
  ) => string | undefined;
}

// HELPER FUNCTIONS //

/**
 * hashes a token using SHA-256 for storage lookup
 * @param token token to hash
 * @returns hex-encoded hash
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * extracts bearer token from authorization header
 * @param authHeader authorization header value
 * @returns token string or null if not valid bearer token
 */
function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authHeader.slice(BEARER_PREFIX_LENGTH);
}

/**
 * builds OAuth proxy config from ProxyAuthOptions
 * @param config proxy auth server config
 * @param storage storage adapter
 * @returns OAuth proxy config
 */
function buildProxyConfig(
  config: ProxyAuthOptions['config'],
  storage: MemoryProxyStorageAdapter,
): OAuthProxyConfig {
  return {
    externalAS: {
      issuer: config.issuer,
      authorizationEndpoint: config.endpoints?.authorization,
      tokenEndpoint: config.endpoints?.token,
      introspectionEndpoint: config.endpoints?.introspection,
      revocationEndpoint: config.endpoints?.revocation,
    },
    proxyClient: {
      clientId: config.proxyCredentials.clientId,
      clientSecret: config.proxyCredentials.clientSecret,
      redirectUri: config.proxyCredentials.redirectUri,
    },
    storage,
    stateSecret: config.stateJwt.secret,
    stateExpirySeconds: config.stateJwt.expirySeconds,
    allowedScopes: config.proxyCredentials.allowedScopes,
  };
}

// MIDDLEWARE FUNCTIONS //

/**
 * creates preHandler middleware for token validation
 * @param storage storage adapter
 * @param requiredScopes scopes required for access
 * @returns preHandler hook function
 */
function createTokenValidationMiddleware(
  storage: MemoryProxyStorageAdapter,
  requiredScopes: string[],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    // skip oauth, well-known, health, and management endpoints
    if (shouldSkipAuth(request.url)) {
      return;
    }

    // extract bearer token
    const token = extractTokenFromHeader(request.headers.authorization);
    if (!token) {
      void reply.code(HTTP_UNAUTHORIZED).send({
        error: 'invalid_token',
        error_description: 'Bearer token required',
      });

      return;
    }

    // validate token and get client
    const validationResult = await validateToken(token, storage);
    if (!validationResult.valid) {
      void reply.code(validationResult.statusCode).send({
        error: validationResult.error,
        error_description: validationResult.description,
      });

      return;
    }

    // validate scopes
    if (!validateScopes(validationResult.clientScope, requiredScopes)) {
      void reply.code(HTTP_FORBIDDEN).send({
        error: 'insufficient_scope',
        error_description: `Required scopes: ${requiredScopes.join(' ')}`,
      });
    }
  };
}

/**
 * checks if the request URL should skip authentication
 * @param url request URL
 * @returns true if auth should be skipped
 */
function shouldSkipAuth(url: string): boolean {
  return (
    url.startsWith('/oauth/') ||
    url.startsWith('/.well-known/') ||
    url === '/health' ||
    url.startsWith('/management/')
  );
}

/**
 * token validation result
 */
interface TokenValidationResult {
  valid: boolean;
  statusCode: number;
  error: string;
  description: string;
  clientScope?: string;
}

/**
 * validates a token against storage
 * @param token bearer token
 * @param storage proxy storage adapter
 * @returns validation result
 */
async function validateToken(
  token: string,
  storage: MemoryProxyStorageAdapter,
): Promise<TokenValidationResult> {
  // lookup token mapping
  const tokenHash = hashToken(token);
  const mapping = await storage.findTokenMapping(tokenHash);

  if (!mapping) {
    return {
      valid: false,
      statusCode: HTTP_UNAUTHORIZED,
      error: 'invalid_token',
      description: 'Token not recognized',
    };
  }

  // verify client exists
  const client = await storage.findClient(mapping.clientId);
  if (!client) {
    return {
      valid: false,
      statusCode: HTTP_UNAUTHORIZED,
      error: 'invalid_token',
      description: 'Token client not found',
    };
  }

  // check token expiry
  if (mapping.expiresAt && Date.now() > mapping.expiresAt) {
    return {
      valid: false,
      statusCode: HTTP_UNAUTHORIZED,
      error: 'invalid_token',
      description: 'Token expired',
    };
  }

  return {
    valid: true,
    statusCode: 200,
    error: '',
    description: '',
    clientScope: client.scope,
  };
}

/**
 * validates that client has required scopes
 * @param clientScope client's granted scopes
 * @param requiredScopes scopes required for access
 * @returns true if client has all required scopes
 */
function validateScopes(
  clientScope: string | undefined,
  requiredScopes: string[],
): boolean {
  if (requiredScopes.length === 0) {
    return true;
  }

  if (!clientScope) {
    return false;
  }

  const clientScopes = clientScope.split(' ');

  return requiredScopes.every((scope) => clientScopes.includes(scope));
}

// USER ID RESOLVER //

/**
 * creates user ID resolver function for proxy mode
 * @param storage storage adapter
 * @param extractBearerToken function to extract bearer token
 * @param lastHeader function to get last header value
 * @param createUnauthorizedError function to create unauthorized error
 * @returns resolveUserId function
 */
function createProxyUserIdResolver(
  storage: MemoryProxyStorageAdapter,
  extractBearerToken: (header: string | undefined) => string | undefined,
  lastHeader: (
    headers: IncomingHttpHeaders,
    header: string,
  ) => string | undefined,
  createUnauthorizedError: () => Error,
): ResolveUserId {
  return async (request) => {
    const token = extractBearerToken(
      lastHeader(request.headers, 'authorization'),
    );

    if (!token) {
      throw createUnauthorizedError();
    }

    // lookup token mapping
    const tokenHash = hashToken(token);
    const mapping = await storage.findTokenMapping(tokenHash);

    if (!mapping) {
      throw createUnauthorizedError();
    }

    // return the client ID as the user identifier
    return mapping.clientId;
  };
}

// ROUTE REGISTRATION //

/**
 * registers proxy OAuth routes on fastify instance
 * @param fastify fastify instance
 * @param proxyConfig proxy configuration
 * @param storage storage adapter
 * @param getBaseUrl function to get base URL from request
 */
function registerRoutes(
  fastify: FastifyInstance,
  proxyConfig: OAuthProxyConfig,
  storage: MemoryProxyStorageAdapter,
  getBaseUrl: (request: FastifyRequest) => string,
): void {
  // get bound handlers for authorization flow
  const handlers = createProxyHandlers(proxyConfig, storage);

  void fastify.register(async (instance) => {
    // local client management //

    instance.post(PROXY_ROUTES.register, async (request, reply) => {
      const baseUrl = getBaseUrl(request);
      await handleProxyClientRegistration(
        request as Parameters<typeof handleProxyClientRegistration>[0],
        reply,
        proxyConfig,
        storage,
        baseUrl,
      );
    });

    instance.get(PROXY_ROUTES.clientInfo, async (request, reply) => {
      await handleClientInfo(
        request as Parameters<typeof handleClientInfo>[0],
        reply,
        storage,
      );
    });

    // proxy OAuth endpoints //

    instance.get(PROXY_ROUTES.authorize, handlers.authorize);
    instance.get(PROXY_ROUTES.callback, handlers.callback);
    instance.post(PROXY_ROUTES.token, handlers.token);
    instance.post(PROXY_ROUTES.introspect, handlers.introspect);
    instance.post(PROXY_ROUTES.revoke, handlers.revoke);

    // metadata endpoint //

    instance.get(PROXY_ROUTES.metadata, async (request, reply) => {
      const baseUrl = getBaseUrl(request);
      await handleMetadata(request, reply, proxyConfig, baseUrl);
    });
  });
}

// MAIN SETUP FUNCTION //

/**
 * sets up OAuth proxy mode for external AS without dynamic client registration
 * handles client registration locally while proxying OAuth flows to external AS
 * @param options setup options
 * @returns resolveUserId function for extracting user ID from requests
 */
export function setupProxyAuth(options: ProxyAuthSetupOptions): ResolveUserId {
  const {
    fastify,
    auth,
    baseUrl,
    inferBaseUrl,
    createUnauthorizedError,
    extractBearerToken,
    lastHeader,
  } = options;

  const { config } = auth;

  // create storage adapter
  const storage = new MemoryProxyStorageAdapter();

  // build and validate proxy config
  const proxyConfig = buildProxyConfig(config, storage);
  validateProxyConfig(proxyConfig);

  // helper to get base URL
  const getBaseUrl = (request: FastifyRequest): string =>
    baseUrl ?? inferBaseUrl(request);

  // register routes
  registerRoutes(fastify, proxyConfig, storage, getBaseUrl);

  // add token validation middleware
  const requiredScopes = auth.requiredScopes ?? ['mcp'];
  const middleware = createTokenValidationMiddleware(storage, requiredScopes);
  fastify.addHook('preHandler', middleware);

  // return user ID resolver
  return createProxyUserIdResolver(
    storage,
    extractBearerToken,
    lastHeader,
    createUnauthorizedError,
  );
}
