/**
 * OAuth 2.0 Authorization Server Metadata per RFC 8414
 *
 * enables client discovery of authorization server endpoints and capabilities
 * for dynamic OAuth configuration and standards-compliant integration
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface AuthorizationServerMetadata {
  /** authorization server's issuer identifier */
  issuer: string;

  /** URL of authorization endpoint for user consent */
  authorization_endpoint?: string;

  /** URL of token endpoint for token exchange */
  token_endpoint: string;

  /** URL of introspection endpoint for token validation per RFC 7662 */
  introspection_endpoint?: string;

  /** URL of revocation endpoint for token revocation per RFC 7009 */
  revocation_endpoint?: string;

  /** URL of dynamic client registration endpoint per RFC 7591 */
  registration_endpoint?: string;

  /** JSON array of scope values supported by server */
  scopes_supported?: string[];

  /** JSON array of response_type values supported */
  response_types_supported?: string[];

  /** JSON array of grant_type values supported */
  grant_types_supported?: string[];

  /** JSON array of client authentication methods supported at token endpoint */
  token_endpoint_auth_methods_supported?: string[];

  /** JSON array of PKCE code challenge methods supported */
  code_challenge_methods_supported?: string[];

  /** URL for authorization server documentation */
  service_documentation?: string;

  /** whether authorization server requires pushed authorization requests */
  require_pushed_authorization_requests?: boolean;

  /** URL of pushed authorization request endpoint */
  pushed_authorization_request_endpoint?: string;
}

/**
 * OAuth 2.0 Protected Resource Metadata per draft-ietf-oauth-resource-metadata
 *
 * describes resource server's OAuth capabilities and requirements
 * for client configuration and authorization flow setup
 */
export interface ProtectedResourceMetadata {
  /** protected resource's issuer identifier */
  resource: string;

  /** authorization server issuer identifier(s) */
  authorization_servers?: string[];

  /** Bearer token authentication methods supported */
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

/** parameters for building OAuth authorization URL */
export interface OAuthParameters {
  // identity //
  /** OAuth client identifier */
  clientId: string;

  /** redirect URI for authorization response */
  redirectUri: string;

  // optional parameters //
  /** scopes being requested */
  scopes?: string[];

  /** state parameter for CSRF protection */
  state?: string;

  /** resource indicator per RFC 8707 to prevent confused deputy attacks */
  resource?: string;

  /** PKCE code challenge */
  codeChallenge?: string;

  /** PKCE code challenge method */
  codeChallengeMethod?: 'plain' | 'S256';
}

/** valid OAuth 2.0 error codes per RFC 6750 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_token'
  | 'insufficient_scope';

/** parsed WWW-Authenticate header information for OAuth challenges */
export interface WWWAuthenticateInfo {
  /** authentication scheme, typically 'Bearer' */
  scheme: string;

  /** realm indicating scope of protection per RFC 6750 */
  realm?: string;

  /** resource metadata URL for OAuth discovery per RFC 9728 */
  resourceMetadata?: string;

  /** required or missing scopes */
  scopes?: string[];

  /** error code such as 'insufficient_scope' per RFC 6750 */
  error?: OAuthErrorCode;

  /** human-readable error description per RFC 6750 */
  errorDescription?: string;

  /** URI identifying a human-readable web page with error information per RFC 6750 */
  errorUri?: string;
}

/** OAuth client configuration for HTTP MCP connector */
export interface OAuthClientConfig {
  /** OAuth 2.0 client identifier registered with authorization server */
  clientId?: string;

  /** redirect URI for OAuth callback matching registered client configuration */
  redirectUri: string;

  /** additional scopes to request beyond server-specified requirements */
  additionalScopes?: string[];
}

/**
 * OAuth 2.0 token response per RFC 6749 Section 5.1
 *
 * response from token endpoint after successful authorization code exchange
 * or refresh token grant with access token and optional refresh token
 */
/* eslint-disable @typescript-eslint/naming-convention */
export interface OAuthTokenResponse {
  /** OAuth 2.0 access token for accessing protected resources */
  access_token: string;

  /** type of token issued, typically 'Bearer' per RFC 6750 */
  token_type?: string;

  /** lifetime in seconds of the access token */
  expires_in?: number;

  /** refresh token for obtaining new access tokens per RFC 6749 Section 6 */
  refresh_token?: string;

  /** scope of the access token as space-delimited string */
  scope?: string;
}
/* eslint-enable @typescript-eslint/naming-convention */
