/**
 * @module oauth/proxy/route-register
 * @description OAuth proxy route registration utility.
 * Registers all OAuth proxy endpoints on a Fastify instance with configured handlers.
 */

import {
  handleAuthorize,
  handleCallback,
  handleClientInfo,
  handleIntrospect,
  handleMetadata,
  handleProxyClientRegistration,
  handleRevoke,
  handleToken,
} from './handlers/index';
import { PROXY_ROUTES } from './routes';

import type { FastifyInstance } from 'fastify';

import type { ProxyStorageAdapter } from './adapter';
import type { OAuthProxyConfig } from './config';

/** configuration for registering proxy OAuth routes */
export interface RegisterProxyRoutesOptions {
  /** OAuth proxy configuration */
  config: OAuthProxyConfig;
  /** storage adapter for clients and tokens */
  storage: ProxyStorageAdapter;
  /** base URL of the server for generating metadata URLs */
  baseUrl: string;
}

/**
 * registers local client management routes
 * @param fastify fastify instance
 * @param config OAuth proxy configuration
 * @param storage storage adapter for clients
 * @param baseUrl server base URL
 */
function registerLocalRoutes(
  fastify: FastifyInstance,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  baseUrl: string,
): void {
  fastify.post(PROXY_ROUTES.register, async (req, reply) => {
    await handleProxyClientRegistration(
      req as Parameters<typeof handleProxyClientRegistration>[0],
      reply,
      config,
      storage,
      baseUrl,
    );
  });

  fastify.get(PROXY_ROUTES.clientInfo, async (req, reply) => {
    await handleClientInfo(
      req as Parameters<typeof handleClientInfo>[0],
      reply,
      storage,
    );
  });
}

/**
 * registers proxy routes for external AS
 * @param fastify fastify instance
 * @param config OAuth proxy configuration
 * @param storage storage adapter for tokens
 * @param baseUrl server base URL
 */
function registerProxyRoutes(
  fastify: FastifyInstance,
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
  baseUrl: string,
): void {
  fastify.get(PROXY_ROUTES.authorize, async (req, reply) => {
    await handleAuthorize(
      req as Parameters<typeof handleAuthorize>[0],
      reply,
      config,
      storage,
    );
  });

  fastify.get(PROXY_ROUTES.callback, async (req, reply) => {
    await handleCallback(
      req as Parameters<typeof handleCallback>[0],
      reply,
      config,
      storage,
    );
  });

  fastify.post(PROXY_ROUTES.token, async (req, reply) => {
    await handleToken(
      req as Parameters<typeof handleToken>[0],
      reply,
      config,
      storage,
    );
  });

  fastify.post(PROXY_ROUTES.introspect, async (req, reply) => {
    await handleIntrospect(
      req as Parameters<typeof handleIntrospect>[0],
      reply,
      config,
      storage,
    );
  });

  fastify.post(PROXY_ROUTES.revoke, async (req, reply) => {
    await handleRevoke(
      req as Parameters<typeof handleRevoke>[0],
      reply,
      config,
      storage,
    );
  });

  fastify.get(PROXY_ROUTES.metadata, async (req, reply) => {
    await handleMetadata(req, reply, config, baseUrl);
  });
}

/**
 * registers all OAuth proxy routes on a fastify instance
 * @param fastify fastify instance to register routes on
 * @param options route registration options
 */
export async function registerProxyOAuthRoutes(
  fastify: FastifyInstance,
  options: RegisterProxyRoutesOptions,
): Promise<void> {
  const { config, storage, baseUrl } = options;
  registerLocalRoutes(fastify, config, storage, baseUrl);
  registerProxyRoutes(fastify, config, storage, baseUrl);
}
