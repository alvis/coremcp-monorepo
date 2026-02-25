// phase 2: openid-client integration - Primary OAuth implementation
export { fetchResourceMetadata } from './resource-metadata';
export {
  createAuthorizationUrl,
  discoverFromChallenge,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from './openid-client-adapter';
export { TokenRefreshManager } from './token-refresh-manager';

// OAuth flow coordinators for testability
export { handleAuthorizationChallenge } from './authorization-flow';
export { exchangeCodeForTokens } from './token-exchange-flow';

// re-export WWW-Authenticate header parsing (still needed)
export * from './header-parser';

export type {
  AuthorizationFlowConfig,
  AuthorizationFlowResult,
} from './authorization-flow';
export type { DiscoveryResult } from './openid-client-adapter';
export type { RefreshFunction } from './token-refresh-manager';
export type { TokenExchangeResult } from './token-exchange-flow';

// re-export token store interface (still needed)
export type { TokenStore } from './store/token';

// re-export OAuth types
export type {
  AuthorizationServerMetadata,
  OAuthClientConfig,
  OAuthTokenResponse,
  ProtectedResourceMetadata,
} from './types';
