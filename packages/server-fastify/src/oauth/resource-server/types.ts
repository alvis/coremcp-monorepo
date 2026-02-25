import type { TokenInfo } from '../types';

export type TokenIntrospector = (token: string) => Promise<TokenInfo>;

/**
 * resource server configuration for protecting MCP endpoints
 */
export interface ResourceServerConfig {
  // token validation
  /** required OAuth scopes for accessing MCP endpoints */
  requiredScopes?: string[];
  /** whether to allow anonymous access (no token required) */
  allowAnonymous?: boolean;

  // introspection caching
}

/**
 * OAuth 2.0 Protected Resource Metadata
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-oauth-resource-metadata
 */
export interface ProtectedResourceMetadata {
  /** the protected resource's issuer identifier */
  resource: string;

  /** authorization server issuer identifier */
  authorization_servers?: string[];

  /** bearer token authentication methods supported */
  bearer_methods_supported?: string[];

  /** resource-specific scopes */
  scopes_supported?: string[];

  /** resource documentation URL */
  resource_documentation?: string;

  /** resource policy URI */
  resource_policy_uri?: string;

  /** resource terms of service URI */
  resource_tos_uri?: string;
}

/**
 * OAuth information attached to authenticated requests
 */
export interface OAuthContext {
  /** The raw access token */
  token: string;

  /** Validated token information */
  tokenInfo: TokenInfo;

  /** Client ID that owns the token */
  clientId?: string;

  /** Array of granted scopes */
  scopes: string[];
}
