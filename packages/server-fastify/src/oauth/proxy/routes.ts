/**
 * OAuth Proxy Route Registration
 * Registers all OAuth proxy routes for Fastify server
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type {
  ProxyAuthServerConfig,
  ProxyAuthorizeRequestWire,
  ProxyCallbackRequest,
  ProxyClientRegistrationRequestWire,
  ProxyIntrospectionRequestWire,
  ProxyRevocationRequestWire,
  ProxyTokenRequestWire,
} from './types';

// ROUTE PATH CONSTANTS //

/** oauth proxy route paths */
export const PROXY_ROUTES = {
  /** client registration endpoint (local) */
  register: '/oauth/register',

  /** client info endpoint (local) */
  clientInfo: '/oauth/clients/:client_id',

  /** authorization endpoint (proxy) */
  authorize: '/oauth/authorize',

  /** callback endpoint (proxy callback) */
  callback: '/oauth/callback',

  /** token endpoint (proxy) */
  token: '/oauth/token',

  /** introspection endpoint (proxy) */
  introspect: '/oauth/introspect',

  /** revocation endpoint (proxy) */
  revoke: '/oauth/revoke',

  /** authorization server metadata (merge) */
  metadata: '/.well-known/oauth-authorization-server',
} as const;

// FASTIFY GENERIC TYPE HELPERS //
// NOTE: Body, Querystring, Params are Fastify's built-in generic type parameter conventions

/** route parameters for client info endpoint */
interface ClientInfoParams {
  /** OAuth client identifier - required by OAuth spec (RFC 6749) */
  client_id: string;
}

/** fastify request type for client registration */
type ClientRegistrationRequest = FastifyRequest<{
  Body: ProxyClientRegistrationRequestWire;
}>;

/** fastify request type for client info */
type ClientInfoRequest = FastifyRequest<{
  Params: ClientInfoParams;
}>;

/** fastify request type for authorization */
type AuthorizeRequest = FastifyRequest<{
  Querystring: ProxyAuthorizeRequestWire;
}>;

/** fastify request type for callback */
type CallbackRequest = FastifyRequest<{
  Querystring: ProxyCallbackRequest;
}>;

/** fastify request type for token */
type TokenRequest = FastifyRequest<{
  Body: ProxyTokenRequestWire;
}>;

/** fastify request type for introspection */
type IntrospectionRequest = FastifyRequest<{
  Body: ProxyIntrospectionRequestWire;
}>;

/** fastify request type for revocation */
type RevocationRequest = FastifyRequest<{
  Body: ProxyRevocationRequestWire;
}>;

// HANDLER FUNCTION SIGNATURES //

/**
 * handles POST /oauth/register - local client registration
 * @param request fastify request with client registration body
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when response is sent
 */
export type HandleClientRegistration = (
  request: ClientRegistrationRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles GET /oauth/clients/:client_id - get client info
 * @param request fastify request with client_id param and authorization header
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when response is sent
 */
export type HandleClientInfo = (
  request: ClientInfoRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles GET /oauth/authorize - proxy authorization to external AS
 * @param request fastify request with authorization query params
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when redirect is sent
 */
export type HandleAuthorize = (
  request: AuthorizeRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles GET /oauth/callback - receive auth code from external AS
 * @param request fastify request with auth code and state
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when redirect is sent
 */
export type HandleCallback = (
  request: CallbackRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles POST /oauth/token - proxy token request to external AS
 * @param request fastify request with token request body
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when response is sent
 */
export type HandleToken = (
  request: TokenRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles POST /oauth/introspect - proxy introspection with enrichment
 * @param request fastify request with introspection request body
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when response is sent
 */
export type HandleIntrospection = (
  request: IntrospectionRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles POST /oauth/revoke - proxy revocation to external AS
 * @param request fastify request with revocation request body
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when response is sent
 */
export type HandleRevocation = (
  request: RevocationRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

/**
 * handles GET /.well-known/oauth-authorization-server - merged metadata
 * @param request fastify request object
 * @param reply fastify reply object
 * @param config proxy configuration
 * @returns promise that resolves when response is sent
 */
export type HandleMetadata = (
  request: FastifyRequest,
  reply: FastifyReply,
  config: ProxyAuthServerConfig,
) => Promise<void>;

// ROUTE REGISTRATION //

/**
 * creates fastify plugin that registers all oauth proxy routes
 * @param config proxy configuration
 * @param handlers route handler implementations
 * @returns fastify plugin async function
 */
export function registerProxyRoutes(
  config: ProxyAuthServerConfig,
  handlers: ProxyRouteHandlers,
): FastifyPluginAsync {
  return async (fastify) => {
    // local client management endpoints //

    // POST /oauth/register - dynamic client registration
    fastify.post(PROXY_ROUTES.register, async (request, reply) =>
      handlers.handleClientRegistration(
        request as ClientRegistrationRequest,
        reply,
        config,
      ),
    );

    // GET /oauth/clients/:client_id - get client info
    fastify.get<{
      Params: ClientInfoParams;
    }>(PROXY_ROUTES.clientInfo, async (request, reply) =>
      handlers.handleClientInfo(request, reply, config),
    );

    // proxy endpoints //

    // GET /oauth/authorize - proxy to external AS
    fastify.get(PROXY_ROUTES.authorize, async (request, reply) =>
      handlers.handleAuthorize(request as AuthorizeRequest, reply, config),
    );

    // GET /oauth/callback - receive auth code from external AS
    fastify.get(PROXY_ROUTES.callback, async (request, reply) =>
      handlers.handleCallback(request as CallbackRequest, reply, config),
    );

    // POST /oauth/token - proxy token exchange
    fastify.post(PROXY_ROUTES.token, async (request, reply) =>
      handlers.handleToken(request as TokenRequest, reply, config),
    );

    // POST /oauth/introspect - proxy introspection with enrichment
    fastify.post(PROXY_ROUTES.introspect, async (request, reply) =>
      handlers.handleIntrospection(
        request as IntrospectionRequest,
        reply,
        config,
      ),
    );

    // POST /oauth/revoke - proxy revocation
    fastify.post(PROXY_ROUTES.revoke, async (request, reply) =>
      handlers.handleRevocation(request as RevocationRequest, reply, config),
    );

    // metadata endpoint //

    // GET /.well-known/oauth-authorization-server - merged metadata
    fastify.get(PROXY_ROUTES.metadata, async (request, reply) =>
      handlers.handleMetadata(request, reply, config),
    );
  };
}

/**
 * collection of all proxy route handlers
 */
export interface ProxyRouteHandlers {
  /** handles client registration */
  handleClientRegistration: HandleClientRegistration;

  /** handles client info retrieval */
  handleClientInfo: HandleClientInfo;

  /** handles authorization redirect */
  handleAuthorize: HandleAuthorize;

  /** handles callback from external AS */
  handleCallback: HandleCallback;

  /** handles token exchange */
  handleToken: HandleToken;

  /** handles token introspection */
  handleIntrospection: HandleIntrospection;

  /** handles token revocation */
  handleRevocation: HandleRevocation;

  /** handles metadata discovery */
  handleMetadata: HandleMetadata;
}
