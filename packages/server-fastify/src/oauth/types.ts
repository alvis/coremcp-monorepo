import type { ProxyAuthServerConfig } from './proxy/types';

export type AuthOptions =
  | ExternalAuthOptions
  | ProxyAuthOptions
  | AnonymousAuthOptions;

export interface ExternalAuthOptions extends RequireAuthOptionsBase {
  /** use an external OAuth authorization server */
  mode: 'external';
  /** external AS configuration */
  config: ExternalAuthServerConfig;
}

export interface ProxyAuthOptions extends RequireAuthOptionsBase {
  /** create an OAuth proxy that allows clients to connect to an AS server which doesn't support dynamic client registration (DCR) or Proof Key for Code Exchange (PKCE) */
  mode: 'proxy';
  /** proxy AS configuration */
  config: ProxyAuthServerConfig;
}

export interface AnonymousAuthOptions extends AuthOptionsBase {
  /** only configure resource server without AS */
  mode: 'anonymous';
}

interface RequireAuthOptionsBase extends AuthOptionsBase {
  /** required OAuth scopes for accessing MCP endpoints */
  requiredScopes?: string[];
  /** cache TTL for token introspection results in seconds (default: 60) */
  introspectionCacheTTL?: number;

  /** whether to include token info in request context */
  includeTokenInfoInContext?: boolean;
}

interface AuthOptionsBase {
  mode: string;
}

/**
 * configuration for connecting to an external oauth authorization server
 * supports both explicit endpoint configuration and dynamic discovery via rfc 8414
 */
export interface ExternalAuthServerConfig {
  /** authorization server issuer url (required for discovery and validation) */
  issuer: string;

  /**
   * optional explicit endpoint urls (if not using discovery)
   * if not provided, will attempt oauth discovery via issuer/.well-known/oauth-authorization-server
   */
  endpoints?: {
    /** authorization endpoint for user consent flow */
    authorization?: string;
    /** token endpoint for exchanging codes/credentials for tokens */
    token?: string;
    /** introspection endpoint for validating access tokens (rfc 7662) */
    introspection?: string;
    /** revocation endpoint for revoking tokens (rfc 7009) */
    revocation?: string;
    /** userinfo endpoint for retrieving user claims */
    userinfo?: string;
  };

  /** client credentials for authenticating to the as (e.g., for introspection) */
  clientCredentials?: ClientCredentials;

  /**
   * token introspection cache configuration
   * controls memory usage and cache behavior for token introspection results
   */
  introspectionCache?: {
    /** maximum number of entries to cache (default: 10000) */
    maxSize?: number;
    /** cache time-to-live in milliseconds (default: 60000 = 60 seconds) */
    ttlMs?: number;
  };
}

/**
 * client credentials for oauth authentication
 * used for client authentication in token requests and introspection
 */
export interface ClientCredentials {
  /** oauth client identifier */
  clientId: string;

  /** oauth client secret for authentication */
  clientSecret: string;
}

/**
 * token introspection response following rfc 7662
 * provides detailed information about a token's validity and metadata
 */
export interface TokenInfo {
  /** boolean indicator of whether the presented token is currently active */
  active: boolean;

  /** space-separated list of scope values granted to this token */
  scope?: string;

  /** client identifier for the oauth 2.0 client that requested this token */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  client_id?: string;

  /** human-readable identifier for the resource owner who authorized this token */
  username?: string;

  /** subject identifier for the resource owner */
  sub?: string;

  /** token expiration time in seconds since unix epoch */
  exp?: number;

  /** token issued at time in seconds since unix epoch */
  iat?: number;

  /** token not before time in seconds since unix epoch */
  nbf?: number;

  /** authorized party - the party to which the token was issued */
  azp?: string;

  /** issuer identifier for the authorization server */
  iss?: string;

  /** unique token identifier (jti claim) */
  jti?: string;

  /** type of the token (e.g., 'Bearer') */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  token_type?: string;

  /** additional custom claims specific to the implementation */
  [key: string]: unknown;
}
