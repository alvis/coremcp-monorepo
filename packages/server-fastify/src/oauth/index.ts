/**
 * @module oauth
 * @description OAuth 2.1 implementation for MCP server transport over HTTP.
 * Provides comprehensive OAuth support including resource server,
 * proxy mode, and token introspection capabilities.
 */

// resource server exports

export { createRequireAuth } from './resource-server/middleware';

export {
  createCachingTokenIntrospector,
  createTokenInspector,
} from './resource-server/introspection';

export type {
  OAuthContext,
  ProtectedResourceMetadata,
  ResourceServerConfig,
} from './resource-server/types';

export {
  buildWWWAuthenticateHeader,
  createOAuthError,
  OAuthErrorCode,
} from './resource-server/errors';

// proxy mode exports

export {
  MemoryProxyStorageAdapter,
  PROXY_ROUTES,
  validateProxyConfig,
} from './proxy/index';

export type { ProxyAuthServerConfig } from './proxy/types';

export type { ProxyStorageAdapter } from './proxy/adapter';

// shared types

export type * from './types';

// route registration

export { registerWellKnownRoutes } from './routes/well-known';
