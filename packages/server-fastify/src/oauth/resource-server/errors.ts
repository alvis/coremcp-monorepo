/* eslint-disable @typescript-eslint/naming-convention */
/**
 * OAuth 2.0 error codes for resource server
 * @see https://datatracker.ietf.org/doc/html/rfc6750#section-3.1
 */
export enum OAuthErrorCode {
  /** the request is missing a required parameter or includes an unsupported parameter value */
  InvalidRequest = 'invalid_request',

  /** the access token provided is expired, revoked, malformed, or invalid */
  InvalidToken = 'invalid_token',

  /** the request requires higher privileges than provided by the access token */
  InsufficientScope = 'insufficient_scope',
}

/**
 * OAuth resource server error response
 */
export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * creates a standardized OAuth error response
 * @param code oauth error code to return
 * @param description optional error description for additional context
 * @param uri optional uri reference for error documentation
 * @returns oauth error response object
 */
export function createOAuthError(
  code: OAuthErrorCode,
  description?: string,
  uri?: string,
): OAuthError {
  const error: OAuthError = { error: code };

  if (description) {
    error.error_description = description;
  }

  if (uri) {
    error.error_uri = uri;
  }

  return error;
}

/**
 * builds WWW-Authenticate header for Bearer token errors
 * @param realm security realm for the protected resource
 * @param error oauth error code
 * @param errorDescription detailed error description
 * @param authzServer authorization server endpoint
 * @param scope required scope for the resource
 * @returns formatted www-authenticate header string
 * @see https://datatracker.ietf.org/doc/html/rfc6750#section-3
 */
export function buildWWWAuthenticateHeader(
  realm = 'MCP Server',
  error?: string,
  errorDescription?: string,
  authzServer?: string,
  scope?: string,
): string {
  const parts = [`Bearer realm="${realm}"`];

  if (error) {
    parts.push(`error="${error}"`);
  }

  if (errorDescription) {
    // escape quotes in description
    const escaped = errorDescription.replace(/"/g, '\\"');
    parts.push(`error_description="${escaped}"`);
  }

  if (scope) {
    parts.push(`scope="${scope}"`);
  }

  if (authzServer) {
    parts.push(`authz_server="${authzServer}"`);
  }

  return parts.join(', ');
}
/* eslint-enable @typescript-eslint/naming-convention */
