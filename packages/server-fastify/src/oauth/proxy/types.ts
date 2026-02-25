/**
 * OAuth Proxy Type Definitions
 * Provides type contracts for OAuth proxy routes that enable clients to connect
 * to authorization servers that do not support dynamic client registration (RFC 7591).
 * @see RFC 6749 - OAuth 2.0 Authorization Framework
 * @see RFC 7591 - OAuth 2.0 Dynamic Client Registration
 * @see RFC 7592 - OAuth 2.0 Dynamic Client Registration Management
 * @see RFC 7662 - OAuth 2.0 Token Introspection
 * @see RFC 7009 - OAuth 2.0 Token Revocation
 * @see RFC 9126 - OAuth 2.0 Pushed Authorization Requests
 */

import type { FastifyPluginAsync } from 'fastify';

// CONFIGURATION TYPES //

/**
 * configuration for oauth proxy mode
 * enables mcp servers to act as an oauth proxy for authorization servers
 * that do not support dynamic client registration
 */
export interface ProxyAuthServerConfig {
  /** external authorization server issuer url */
  issuer: string;

  /**
   * proxy client credentials registered with external AS
   * these credentials are used to authenticate the proxy itself to the external AS
   */
  proxyCredentials: ProxyClientCredentials;

  /**
   * jwt signing configuration for state encoding
   * used to securely encode client information during authorization flow
   */
  stateJwt: StateJwtConfig;

  /**
   * optional explicit endpoint urls
   * if not provided, will attempt oauth discovery via issuer/.well-known/oauth-authorization-server
   */
  endpoints?: ExternalEndpoints;

  /**
   * token mapping storage configuration
   * controls how token-to-client mappings are stored
   */
  tokenMappingStorage?: TokenMappingStorageConfig;

  /**
   * cache configuration for external AS metadata
   * controls memory usage and cache behavior for discovery results
   */
  metadataCache?: MetadataCacheConfig;
}

/**
 * proxy client credentials for authenticating to external AS
 * the proxy uses these credentials when forwarding requests
 */
export interface ProxyClientCredentials {
  /** client identifier registered with external AS */
  clientId: string;

  /** client secret for authentication */
  clientSecret: string;

  /** redirect uri registered with external AS for proxy callback */
  redirectUri: string;

  /** scopes the proxy is authorized to request */
  allowedScopes?: string[];
}

/**
 * jwt configuration for encoding proxy state
 * used during authorization flow to securely pass client information
 */
export interface StateJwtConfig {
  /** secret key for signing state JWTs (minimum 32 bytes recommended) */
  secret: string;

  /** jwt issuer claim for state tokens */
  issuer?: string;

  /** state token expiry in seconds (default: 600 = 10 minutes) */
  expirySeconds?: number;

  /** algorithm for signing (default: 'HS256') */
  algorithm?: 'HS256' | 'HS384' | 'HS512';
}

/**
 * explicit endpoint urls for external AS
 * used when discovery is not available or custom endpoints are needed
 */
export interface ExternalEndpoints {
  /** authorization endpoint url */
  authorization?: string;

  /** token endpoint url */
  token?: string;

  /** introspection endpoint url */
  introspection?: string;

  /** revocation endpoint url */
  revocation?: string;

  /** userinfo endpoint url */
  userinfo?: string;
}

/**
 * configuration for token-to-client mapping storage
 */
export interface TokenMappingStorageConfig {
  /** storage type (default: 'memory') */
  type: 'memory' | 'custom';

  /** maximum number of mappings to store (default: 100000) */
  maxSize?: number;

  /** mapping ttl in seconds (default: 86400 = 24 hours) */
  ttlSeconds?: number;

  /** custom storage adapter (required when type is 'custom') */
  adapter?: TokenMappingStorageAdapter;
}

/**
 * adapter interface for custom token mapping storage
 */
export interface TokenMappingStorageAdapter {
  /** stores a token hash to client id mapping */
  set(tokenHash: string, clientId: string, ttlSeconds: number): Promise<void>;

  /** retrieves client id for a token hash */
  get(tokenHash: string): Promise<string | null>;

  /** removes a token mapping */
  delete(tokenHash: string): Promise<void>;
}

/**
 * configuration for external AS metadata caching
 */
export interface MetadataCacheConfig {
  /** cache ttl in seconds (default: 3600 = 1 hour) */
  ttl?: number;
}

// ENUMS AND LITERALS //

/** oauth grant types */
export type GrantType =
  | 'authorization_code'
  | 'refresh_token'
  | 'client_credentials';

/** oauth response types */
export type ResponseType = 'code';

/** token endpoint authentication methods */
export type TokenEndpointAuthMethod =
  | 'client_secret_basic'
  | 'client_secret_post'
  | 'none';

/** pkce code challenge methods */
export type CodeChallengeMethod = 'S256' | 'plain';

/** standard oauth error codes */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error'
  | 'temporarily_unavailable'
  | 'invalid_token'
  | 'insufficient_scope';

// INTERNAL TYPES (camelCase) //

/**
 * stored local client data
 * internal representation of registered clients
 */
export interface StoredProxyClient {
  // identity //
  clientId: string;
  clientSecretHash: string;
  registrationAccessTokenHash: string;

  // configuration //
  redirectUris: string[];
  grantTypes: GrantType[];
  responseTypes: ResponseType[];
  scope: string;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;

  // metadata //
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  contacts?: string[];
  tosUri?: string;
  policyUri?: string;
  softwareId?: string;
  softwareVersion?: string;

  // timestamps //
  createdAt: number;
  updatedAt: number;
}

/**
 * jwt payload for encoded proxy state
 * securely passes client information through external AS authorization
 */
export interface ProxyStatePayload {
  /** local client identifier */
  clientId: string;

  /** original client redirect uri */
  redirectUri: string;

  /** original client state (if provided) */
  originalState?: string;

  /** pkce code verifier (proxy generates new one for external AS) */
  proxyCodeVerifier: string;

  /** requested scopes */
  scope?: string;

  /** jwt issued at timestamp */
  iat: number;

  /** jwt expiration timestamp */
  exp: number;

  /** jwt issuer */
  iss: string;
}

/**
 * token to client mapping record
 * used for enriching introspection responses
 */
export interface TokenClientMapping {
  /** sha256 hash of the access token */
  tokenHash: string;

  /** local client identifier */
  clientId: string;

  /** mapping creation timestamp */
  createdAt: number;

  /** mapping expiration timestamp */
  expiresAt: number;
}

/**
 * result of proxy authorization validation
 */
export interface ProxyAuthValidationResult {
  /** whether validation passed */
  valid: boolean;

  /** stored client data (if valid) */
  client?: StoredProxyClient;

  /** error response (if invalid) */
  error?: ProxyOAuthError;
}

/**
 * result of proxy token exchange
 */
export interface ProxyTokenExchangeResult {
  /** whether exchange succeeded */
  success: boolean;

  /** token response (if successful) */
  response?: ProxyTokenResponseWire;

  /** error response (if failed) */
  error?: ProxyError;

  /** http status code */
  statusCode: number;
}

/**
 * internal error representation
 */
export interface ProxyOAuthError {
  /** error code */
  code: OAuthErrorCode;

  /** human-readable error description */
  description?: string;

  /** uri with more information */
  uri?: string;
}

/**
 * proxy-specific error with additional context
 */
export interface ProxyError extends ProxyOAuthError {
  /** whether the error originated from external AS */
  upstreamError?: boolean;

  /** request id for correlation */
  requestId?: string;
}

// WIRE FORMAT TYPES (RFC-mandated snake_case) //
// These types represent the JSON structure sent over the wire per OAuth RFCs

/* eslint-disable @typescript-eslint/naming-convention */

/**
 * oauth dynamic client registration request (RFC 7591)
 * wire format with snake_case fields
 */
export interface ProxyClientRegistrationRequestWire {
  // required fields //

  /** array of redirect uris for authorization callbacks */
  redirect_uris: string[];

  // optional metadata //

  /** human-readable client name for display */
  client_name?: string;

  /** url of the client's home page */
  client_uri?: string;

  /** url of the client's logo image */
  logo_uri?: string;

  /** space-separated list of contact email addresses */
  contacts?: string[];

  /** url of the client's terms of service */
  tos_uri?: string;

  /** url of the client's privacy policy */
  policy_uri?: string;

  // oauth configuration //

  /** array of oauth grant types the client will use */
  grant_types?: GrantType[];

  /** array of oauth response types the client will use */
  response_types?: ResponseType[];

  /** space-separated list of requested scope values */
  scope?: string;

  /** token endpoint authentication method */
  token_endpoint_auth_method?: TokenEndpointAuthMethod;

  // software statement //

  /** software statement jwt (RFC 7591 Section 2.3) */
  software_statement?: string;

  /** unique identifier for the client software */
  software_id?: string;

  /** version of the client software */
  software_version?: string;
}

/**
 * oauth dynamic client registration response (RFC 7591)
 * wire format with snake_case fields
 */
export interface ProxyClientRegistrationResponseWire {
  // identity //

  /** unique client identifier assigned by the proxy */
  client_id: string;

  /** client secret for authentication (for confidential clients) */
  client_secret?: string;

  /** registration access token for client management (RFC 7592) */
  registration_access_token: string;

  /** uri for client configuration endpoint */
  registration_client_uri: string;

  // metadata echoed back //

  /** registered client name */
  client_name?: string;

  /** registered redirect uris */
  redirect_uris: string[];

  /** allowed grant types for this client */
  grant_types: GrantType[];

  /** allowed response types for this client */
  response_types: ResponseType[];

  /** granted scope values */
  scope: string;

  /** token endpoint authentication method */
  token_endpoint_auth_method: TokenEndpointAuthMethod;

  // timestamps //

  /** unix timestamp when the client identifier was issued */
  client_id_issued_at: number;

  /** unix timestamp when the client secret expires (0 = never) */
  client_secret_expires_at: number;
}

/**
 * oauth client info response for GET /oauth/clients/:client_id (RFC 7592)
 * wire format with snake_case fields
 */
export interface ProxyClientInfoResponseWire {
  // identity //

  /** unique client identifier */
  client_id: string;

  /** human-readable client name */
  client_name?: string;

  // configuration //

  /** registered redirect uris */
  redirect_uris: string[];

  /** allowed grant types */
  grant_types: GrantType[];

  /** allowed response types */
  response_types: ResponseType[];

  /** granted scope values */
  scope: string;

  /** token endpoint authentication method */
  token_endpoint_auth_method: TokenEndpointAuthMethod;

  // metadata uris //

  /** url of the client's home page */
  client_uri?: string;

  /** url of the client's logo image */
  logo_uri?: string;

  /** url of the client's terms of service */
  tos_uri?: string;

  /** url of the client's privacy policy */
  policy_uri?: string;

  // timestamps //

  /** unix timestamp when the client was registered */
  client_id_issued_at: number;
}

/**
 * oauth authorization request query parameters (RFC 6749)
 * wire format with snake_case fields
 */
export interface ProxyAuthorizeRequestWire {
  /** requested response type (must be 'code' for authorization code flow) */
  response_type: 'code';

  /** local client identifier requesting authorization */
  client_id: string;

  /** redirect uri for returning the authorization code */
  redirect_uri: string;

  /** space-separated list of requested scopes */
  scope?: string;

  /** opaque state value from client for csrf protection */
  state?: string;

  /** pkce code challenge */
  code_challenge?: string;

  /** pkce code challenge method (default: 'S256') */
  code_challenge_method?: CodeChallengeMethod;

  /** nonce for replay protection (OpenID Connect) */
  nonce?: string;
}

/**
 * callback error response from external AS (RFC 6749)
 * wire format with snake_case fields
 */
export interface ProxyCallbackErrorRequestWire {
  /** oauth error code */
  error: OAuthErrorCode;

  /** human-readable error description */
  error_description?: string;

  /** uri with more information about the error */
  error_uri?: string;

  /** state parameter (for client correlation) */
  state?: string;
}

/**
 * oauth token request (RFC 6749)
 * wire format with snake_case fields
 */
export interface ProxyTokenRequestWire {
  /** grant type being requested */
  grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';

  /** local client identifier */
  client_id?: string;

  /** local client secret (for confidential clients) */
  client_secret?: string;

  // authorization code grant //

  /** authorization code (for authorization_code grant) */
  code?: string;

  /** redirect uri (must match authorization request) */
  redirect_uri?: string;

  /** pkce code verifier (for authorization_code grant with pkce) */
  code_verifier?: string;

  // refresh token grant //

  /** refresh token (for refresh_token grant) */
  refresh_token?: string;

  /** requested scope (may be subset of original scope) */
  scope?: string;
}

/**
 * token response (RFC 6749)
 * wire format with snake_case fields
 */
export interface ProxyTokenResponseWire {
  /** access token issued by external AS */
  access_token: string;

  /** token type (typically 'Bearer') */
  token_type: 'Bearer';

  /** access token lifetime in seconds */
  expires_in: number;

  /** granted scope values */
  scope: string;

  /** refresh token (if issued) */
  refresh_token?: string;

  /** id token (if OpenID Connect scope requested) */
  id_token?: string;
}

/**
 * token introspection request (RFC 7662)
 * wire format with snake_case fields
 */
export interface ProxyIntrospectionRequestWire {
  /** token string to introspect */
  token: string;

  /** hint about token type */
  token_type_hint?: 'access_token' | 'refresh_token';

  /** client identifier for authentication */
  client_id?: string;

  /** client secret for authentication */
  client_secret?: string;
}

/**
 * enriched token introspection response (RFC 7662)
 * combines external AS response with local client information
 * wire format with snake_case fields
 */
export interface ProxyIntrospectionResponseWire {
  /** whether the token is currently active */
  active: boolean;

  // standard claims from external AS //

  /** space-separated scope values */
  scope?: string;

  /** subject identifier */
  sub?: string;

  /** human-readable username */
  username?: string;

  /** token expiration time (unix timestamp) */
  exp?: number;

  /** token issued at time (unix timestamp) */
  iat?: number;

  /** token not before time (unix timestamp) */
  nbf?: number;

  /** issuer identifier (external AS) */
  iss?: string;

  /** audience */
  aud?: string | string[];

  /** unique token identifier */
  jti?: string;

  // enriched local client information //

  /** local client identifier (from token mapping) */
  client_id?: string;

  /** token type */
  token_type?: string;

  /** additional claims */
  [key: string]: unknown;
}

/**
 * token revocation request (RFC 7009)
 * wire format with snake_case fields
 */
export interface ProxyRevocationRequestWire {
  /** token to revoke */
  token: string;

  /** hint about token type */
  token_type_hint?: 'access_token' | 'refresh_token';

  /** client identifier for authentication */
  client_id?: string;

  /** client secret for authentication */
  client_secret?: string;
}

/**
 * oauth error response (RFC 6749 Section 5.2)
 * wire format with snake_case fields
 */
export interface ProxyOAuthErrorResponseWire {
  /** error code */
  error: OAuthErrorCode;

  /** human-readable error description */
  error_description?: string;

  /** uri with more information */
  error_uri?: string;
}

/**
 * proxy-specific error response with additional context
 * wire format with snake_case fields
 */
export interface ProxyErrorResponseWire extends ProxyOAuthErrorResponseWire {
  /** whether the error originated from external AS */
  upstream_error?: boolean;

  /** request id for correlation */
  request_id?: string;
}

/**
 * merged authorization server metadata (RFC 8414)
 * combines external AS capabilities with proxy endpoints
 * wire format with snake_case fields
 */
export interface ProxyAuthServerMetadataWire {
  /** issuer identifier (proxy url) */
  'issuer': string;

  /** authorization endpoint (proxy) */
  'authorization_endpoint': string;

  /** token endpoint (proxy) */
  'token_endpoint': string;

  /** introspection endpoint (proxy) */
  'introspection_endpoint'?: string;

  /** revocation endpoint (proxy) */
  'revocation_endpoint'?: string;

  /** dynamic client registration endpoint (proxy - local) */
  'registration_endpoint': string;

  /** supported scopes */
  'scopes_supported'?: string[];

  /** supported response types */
  'response_types_supported': ResponseType[];

  /** supported grant types */
  'grant_types_supported': GrantType[];

  /** supported token endpoint auth methods */
  'token_endpoint_auth_methods_supported': TokenEndpointAuthMethod[];

  /** supported code challenge methods */
  'code_challenge_methods_supported': CodeChallengeMethod[];

  /** service documentation url */
  'service_documentation'?: string;

  /** indicates this is a proxy */
  'x-proxy-mode': true;

  /** original external AS issuer */
  'x-upstream-issuer': string;
}

/* eslint-enable @typescript-eslint/naming-convention */

// ROUTE HANDLER TYPES //

/**
 * proxy route handler options
 */
export interface ProxyRouteHandlerOptions {
  /** proxy configuration */
  config: ProxyAuthServerConfig;

  /** base url of the proxy server */
  baseUrl: string;
}

/**
 * callback request from external AS after user authorization
 */
export interface ProxyCallbackRequest {
  /** authorization code from external AS */
  code: string;

  /** encoded state containing client information */
  state: string;
}

// PLUGIN REGISTRATION //

/**
 * registers oauth proxy routes for fastify
 * @param options proxy route handler options
 * @returns fastify plugin async function
 */
export type RegisterProxyRoutes = (
  options: ProxyRouteHandlerOptions,
) => FastifyPluginAsync;
