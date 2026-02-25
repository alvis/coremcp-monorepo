export { HTTPTransport } from '#http';

export type { HTTPTransportOptions } from '#http';

// OAuth exports from this package

export {
  buildWWWAuthenticateHeader,
  createOAuthError,
  createRequireAuth,
  createTokenInspector,
  OAuthErrorCode,
} from './oauth';

export type {
  OAuthContext,
  ProtectedResourceMetadata,
  ResourceServerConfig,
  // Auth options
  AuthOptions as OAuthOptions,
  ProxyAuthServerConfig,
  ProxyStorageAdapter,
} from './oauth';
