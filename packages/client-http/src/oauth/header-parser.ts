import { ExternalError } from '#errors';

import type { WWWAuthenticateInfo, OAuthErrorCode } from './types';

/**
 * parses WWW-Authenticate header to extract OAuth challenge information
 *
 * fully compliant with RFC 6750 (OAuth 2.0 Bearer Token Usage) and RFC 9728 (OAuth 2.0 Protected Resource Metadata)
 * supports all standard Bearer scheme parameters including realm, resource metadata, scopes, and error information
 * handles proper quoted string parsing with escape sequences and commas within quoted values
 *
 * **RFC 6750 Parameters:**
 * - `realm` - scope of protection indicator
 * - `scope` - space-delimited list of required scopes
 * - `error` - standard error codes (invalid_request, invalid_token, insufficient_scope)
 * - `error_description` - human-readable error description
 * - `error_uri` - URI for error documentation
 *
 * **RFC 9728 Parameters:**
 * - `resource_metadata` - URL to protected resource metadata for dynamic discovery
 * @param headerValue the WWW-Authenticate header value
 * @returns parsed authentication challenge information with all RFC-compliant parameters
 * @throws {ExternalError} when header format is invalid
 * @example
 * ```typescript
 * // Complete RFC 6750 challenge with realm and error information
 * const challenge = parseWWWAuthenticate(
 *   'Bearer realm="API", error="insufficient_scope", scope="files:read files:write", error_uri="https://example.com/oauth/help"'
 * );
 * console.log(challenge.realm); // "API"
 * console.log(challenge.error); // "insufficient_scope"
 * console.log(challenge.errorUri); // "https://example.com/oauth/help"
 *
 * // RFC 9728 resource metadata discovery
 * const discovery = parseWWWAuthenticate(
 *   'Bearer resource_metadata="https://api.com/.well-known/oauth-protected-resource"'
 * );
 * console.log(discovery.resourceMetadata); // "https://api.com/.well-known/oauth-protected-resource"
 *
 * // Handles escaped quotes and commas in quoted strings
 * const complex = parseWWWAuthenticate(
 *   'Bearer realm="API with \\"quotes\\"", error_description="Error, with commas"'
 * );
 * console.log(complex.realm); // 'API with "quotes"'
 * console.log(complex.errorDescription); // "Error, with commas"
 * ```
 */
export function parseWWWAuthenticate(headerValue: string): WWWAuthenticateInfo {
  if (!headerValue || typeof headerValue !== 'string') {
    throw new ExternalError('WWW-Authenticate header value is required');
  }

  const trimmed = headerValue.trim();

  // Extract the authentication scheme (e.g., "Bearer") using regex
  // eslint-disable-next-line sonarjs/slow-regex -- safe for RFC 6750 header parsing, input limited to HTTP header length
  const match = /^(\S+)\s*(.*)$/.exec(trimmed);
  if (!match) {
    throw new ExternalError('Invalid WWW-Authenticate header format');
  }
  const [, scheme, parametersString] = match;

  // Parse the parameters
  const parameters = parseAuthParameters(parametersString);

  return {
    scheme,
    realm: parameters.realm,
    resourceMetadata: parameters.resource_metadata,
    scopes: parameters.scope?.split(/\s+/),
    error:
      parameters.error && isValidOAuthErrorCode(parameters.error)
        ? (parameters.error as OAuthErrorCode)
        : undefined,
    errorDescription: parameters.error_description,
    errorUri: parameters.error_uri,
  };
}

/**
 * parses authentication parameters from WWW-Authenticate header
 *
 * handles both quoted and unquoted parameter values with efficient regex matching
 * properly handles escaped quotes within quoted strings per RFC 6750
 * @param parametersString the parameter portion of WWW-Authenticate header
 * @returns object containing parsed parameters
 */
function parseAuthParameters(
  parametersString: string,
): Record<string, string | undefined> {
  const parameters: Record<string, string> = {};

  if (!parametersString.trim()) {
    return parameters;
  }

  // Parse parameter=value pairs using regex that handles escaped quotes
  // Matches: key=value or key="quoted value with escaped \"quotes\""
  // eslint-disable-next-line sonarjs/slow-regex -- safe for RFC 6750 parameter parsing, format strictly defined by spec
  const paramRegex = /([^=,\s]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]*))/g;
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(parametersString)) !== null) {
    const key = match[1].trim();
    let value = match[2] || match[3]; // quoted value or unquoted value

    if (!value) {
      continue;
    }

    value = value.trim();

    // Handle quoted values with proper escape sequence processing
    if (match[2]) {
      // This was a quoted value, unescape it
      value = unescapeQuotedValue(value);
    }

    if (key && value !== '') {
      parameters[key] = value;
    }
  }

  return parameters;
}

/**
 * unescapes a quoted value by processing escape sequences using regex
 * handles \" and \\ escape sequences per RFC specifications
 * @param quotedValue the value without surrounding quotes
 * @returns unescaped value
 */
function unescapeQuotedValue(quotedValue: string): string {
  return quotedValue.replace(/\\(["\\])/g, '$1');
}

/**
 * validates if an error code is a standard OAuth 2.0 error code per RFC 6750
 *
 * checks against the three standard error codes defined in the specification
 * @param errorCode the error code to validate
 * @returns true if the error code is a standard OAuth 2.0 error code
 */
export function isValidOAuthErrorCode(errorCode: string): boolean {
  const validCodes = ['invalid_request', 'invalid_token', 'insufficient_scope'];

  return validCodes.includes(errorCode);
}
