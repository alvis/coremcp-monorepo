/**
 * @module oauth/proxy/handlers/proxy-handlers
 * @description Proxy handler types and factory function.
 * Provides type aliases for each handler, the ProxyHandlers collection interface,
 * and the createProxyHandlers() factory that binds config and storage.
 */

import { handleAuthorize } from './authorize';
import { handleCallback } from './callback';
import { handleIntrospect } from './introspect';
import { handleRevoke } from './revoke';
import { handleToken } from './token';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ProxyStorageAdapter } from '../adapter';
import type { OAuthProxyConfig } from '../config';
import type {
  ProxyAuthorizeRequestWire,
  ProxyIntrospectionRequestWire,
  ProxyRevocationRequestWire,
  ProxyTokenRequestWire,
} from '../types';

// TYPES //

/** Query parameters for callback request (OAuth wire format) */
export interface CallbackQueryWire {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

/** Handler function type for authorization */
export type AuthorizeHandler = (
  request: FastifyRequest<{ Querystring: ProxyAuthorizeRequestWire }>,
  reply: FastifyReply,
) => Promise<void>;

/** Handler function type for callback */
export type CallbackHandler = (
  request: FastifyRequest<{ Querystring: CallbackQueryWire }>,
  reply: FastifyReply,
) => Promise<void>;

/** Handler function type for token */
export type TokenHandler = (
  request: FastifyRequest<{ Body: ProxyTokenRequestWire }>,
  reply: FastifyReply,
) => Promise<void>;

/** Handler function type for introspection */
export type IntrospectHandler = (
  request: FastifyRequest<{ Body: ProxyIntrospectionRequestWire }>,
  reply: FastifyReply,
) => Promise<void>;

/** Handler function type for revocation */
export type RevokeHandler = (
  request: FastifyRequest<{ Body: ProxyRevocationRequestWire }>,
  reply: FastifyReply,
) => Promise<void>;

/** Collection of all proxy handlers */
export interface ProxyHandlers {
  authorize: AuthorizeHandler;
  callback: CallbackHandler;
  token: TokenHandler;
  introspect: IntrospectHandler;
  revoke: RevokeHandler;
}

// FACTORY FUNCTION //

/**
 * creates proxy handlers bound to the given config and storage.
 * @param config OAuth proxy configuration
 * @param storage storage adapter for client and token data
 * @returns collection of bound handler functions
 */
export function createProxyHandlers(
  config: OAuthProxyConfig,
  storage: ProxyStorageAdapter,
): ProxyHandlers {
  return {
    authorize: async (request, reply) =>
      handleAuthorize(
        request as FastifyRequest<{ Querystring: ProxyAuthorizeRequestWire }>,
        reply,
        config,
        storage,
      ),

    callback: async (request, reply) =>
      handleCallback(
        request as FastifyRequest<{ Querystring: CallbackQueryWire }>,
        reply,
        config,
        storage,
      ),

    token: async (request, reply) =>
      handleToken(
        request as FastifyRequest<{ Body: ProxyTokenRequestWire }>,
        reply,
        config,
        storage,
      ),

    introspect: async (request, reply) =>
      handleIntrospect(
        request as FastifyRequest<{ Body: ProxyIntrospectionRequestWire }>,
        reply,
        config,
        storage,
      ),

    revoke: async (request, reply) =>
      handleRevoke(
        request as FastifyRequest<{ Body: ProxyRevocationRequestWire }>,
        reply,
        config,
        storage,
      ),
  };
}
