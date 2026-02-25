/**
 * @module oauth/proxy/handlers
 * @description OAuth proxy handler implementations.
 * Provides handlers for authorization, callback, token, introspection, and revocation.
 */

export { handleAuthorize } from './authorize';
export { handleCallback } from './callback';
export { handleClientInfo } from './client-info';
export { handleIntrospect } from './introspect';
export { handleMetadata } from './metadata';
export { handleProxyClientRegistration } from './registration';
export { handleRevoke } from './revoke';
export { handleToken } from './token';
export * from './proxy-handlers';
