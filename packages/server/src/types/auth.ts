/** oauth 2.1 configuration */
export interface OAuthConfig {
  /** oauth client id */
  clientId: string;
  /** oauth client secret */
  clientSecret: string;
  /** authorization endpoint url */
  authorizationEndpoint: string;
  /** token endpoint url */
  tokenEndpoint: string;
  /** supported scopes */
  scopes: string[];
  /** redirect uri for authorization flow */
  redirectUri: string;
}

/** jwt configuration for token-based authentication */
export interface JWTConfig {
  /** jwt signing secret or key */
  secret: string;
  /** token expiration time */
  expiresIn?: string;
  /** jwt algorithm */
  algorithm?: string;
  /** token issuer */
  issuer?: string;
  /** expected audience */
  audience?: string;
}

/** authentication configuration for mcp server */
export interface AuthConfig {
  /** whether authentication is required */
  required?: boolean;
  /** oauth 2.1 configuration for http transport */
  oauth?: OAuthConfig;
  /** jwt configuration for token-based auth */
  jwt?: JWTConfig;
}
