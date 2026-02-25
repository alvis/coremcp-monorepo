import { ExternalError } from '#errors';

import { parseWWWAuthenticate } from './header-parser';
import { fetchResourceMetadata } from './resource-metadata';

import type {
  AuthorizationServerMetadata,
  OAuthTokenResponse,
  ProtectedResourceMetadata,
} from './types';

/**
 * discovery result containing both authorization server and resource metadata
 *
 * combines OAuth authorization server configuration with protected resource
 * metadata for complete OAuth flow setup following RFC 8414 and RFC 9728
 */
export interface DiscoveryResult {
  /** authorization server metadata with token endpoints */
  authServerMetadata: AuthorizationServerMetadata;
  /** protected resource metadata with authorization servers */
  resourceMetadata: ProtectedResourceMetadata;
}

/**
 * discovers OAuth configuration from WWW-Authenticate challenge header
 *
 * bridges MCP OAuth requirements with openid-client library by parsing
 * WWW-Authenticate header, fetching RFC 9728 resource metadata, and
 * discovering authorization server metadata following RFC 8414
 *
 * implements complete OAuth 2.1 discovery flow:
 * 1. parse WWW-Authenticate header for resource metadata URL
 * 2. fetch protected resource metadata (RFC 9728)
 * 3. discover authorization server metadata (RFC 8414)
 * 4. return combined configuration for authorization flow
 * @param challengeHeader WWW-Authenticate header value from 401 response
 * @returns discovery result with both AS and resource metadata
 * @throws {import('#errors').ExternalError} when discovery fails or metadata is invalid
 * @example
 * ```typescript
 * const header = 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';
 * const { authServerMetadata, resourceMetadata } = await discoverFromChallenge(header);
 *
 * console.log(authServerMetadata.authorization_endpoint);
 * console.log(resourceMetadata.scopes_supported);
 * ```
 */
export async function discoverFromChallenge(
  challengeHeader: string,
): Promise<DiscoveryResult> {
  const challengeInfo = parseWWWAuthenticate(challengeHeader);

  if (!challengeInfo.resourceMetadata) {
    throw new ExternalError(
      'WWW-Authenticate header missing resource_metadata parameter',
    );
  }

  const resourceUrl = challengeInfo.resourceMetadata.replace(
    '/.well-known/oauth-protected-resource',
    '',
  );

  const resourceMetadata = await fetchResourceMetadata(resourceUrl);

  if (
    !resourceMetadata.authorization_servers ||
    resourceMetadata.authorization_servers.length === 0
  ) {
    throw new ExternalError('Resource metadata missing authorization servers');
  }

  const authServerUrl = resourceMetadata.authorization_servers[0];
  const authServerMetadataUrl = `${authServerUrl}/.well-known/oauth-authorization-server`;

  try {
    const response = await fetch(authServerMetadataUrl);

    if (!response.ok) {
      throw new ExternalError(
        `Failed to fetch authorization server metadata: ${response.status} ${response.statusText}`,
      );
    }

    const authServerMetadata =
      (await response.json()) as AuthorizationServerMetadata;

    return {
      authServerMetadata,
      resourceMetadata,
    };
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to discover authorization server: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * creates OAuth authorization URL with PKCE for user consent
 *
 * wraps openid-client authorization URL generation with MCP-specific
 * parameters including resource indicator (RFC 8707) for confused deputy
 * attack prevention and PKCE challenge (RFC 7636) for public client security
 * @param authServerMetadata authorization server configuration
 * @param clientId OAuth client identifier
 * @param redirectUri callback URL for authorization response
 * @param options optional parameters for authorization request
 * @param options.scopes OAuth scopes to request
 * @param options.state CSRF protection state parameter
 * @param options.resource resource indicator per RFC 8707
 * @param options.codeChallenge PKCE code challenge
 * @param options.codeChallengeMethod PKCE challenge method (S256 or plain)
 * @returns authorization URL and PKCE code verifier
 * @throws {import('#errors').ExternalError} when URL generation fails
 * @example
 * ```typescript
 * const result = await createAuthorizationUrl(
 *   authServerMetadata,
 *   'client-id',
 *   'https://app.example.com/callback',
 *   {
 *     scopes: ['files:read', 'files:write'],
 *     resource: 'https://mcp.example.com',
 *   }
 * );
 *
 * console.log(result.authorizationUrl); // URL for user
 * console.log(result.codeVerifier); // Store for token exchange
 * ```
 */
export async function createAuthorizationUrl(
  authServerMetadata: AuthorizationServerMetadata,
  clientId: string,
  redirectUri: string,
  options?: {
    scopes?: string[];
    state?: string;
    resource?: string;
    codeChallenge?: string;
    codeChallengeMethod?: 'S256' | 'plain';
  },
): Promise<{ authorizationUrl: string; codeVerifier: string }> {
  try {
    // Import openid-client PKCE utilities
    const { randomPKCECodeVerifier, calculatePKCECodeChallenge } =
      await import('openid-client');

    // Generate PKCE code verifier and challenge
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    // Build authorization URL
    if (!authServerMetadata.authorization_endpoint) {
      throw new ExternalError(
        'Authorization server metadata missing authorization_endpoint',
      );
    }

    const url = new URL(authServerMetadata.authorization_endpoint);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    // Add optional parameters
    if (options?.state) {
      url.searchParams.set('state', options.state);
    }

    if (options?.scopes && options.scopes.length > 0) {
      url.searchParams.set('scope', options.scopes.join(' '));
    }

    if (options?.resource) {
      url.searchParams.set('resource', options.resource);
    }

    return {
      authorizationUrl: url.toString(),
      codeVerifier,
    };
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to create authorization URL: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * exchanges authorization code for access token
 *
 * wraps openid-client token exchange with PKCE code verifier validation
 * following RFC 7636 to complete the authorization code flow
 * @param authServerMetadata authorization server configuration
 * @param clientId OAuth client identifier
 * @param redirectUri callback URL matching authorization request
 * @param code authorization code from callback
 * @param codeVerifier PKCE code verifier from authorization request
 * @returns OAuth token response with access token and optional refresh token
 * @throws {import('#errors').ExternalError} when token exchange fails
 * @example
 * ```typescript
 * const tokens = await exchangeAuthorizationCode(
 *   authServerMetadata,
 *   'client-id',
 *   'https://app.example.com/callback',
 *   'authorization-code',
 *   'code-verifier-from-authorization'
 * );
 *
 * console.log(tokens.access_token);
 * console.log(tokens.refresh_token);
 * ```
 */
export async function exchangeAuthorizationCode(
  authServerMetadata: AuthorizationServerMetadata,
  clientId: string,
  redirectUri: string,
  code: string,
  codeVerifier: string,
): Promise<OAuthTokenResponse> {
  try {
    // Build token request body
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    });

    // Make token exchange request
    const response = await fetch(authServerMetadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ExternalError(
        `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const tokenResponse = (await response.json()) as OAuthTokenResponse;

    return tokenResponse;
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to exchange authorization code: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * refreshes access token using refresh token
 *
 * wraps openid-client refresh token grant to obtain new access token
 * without requiring user interaction following RFC 6749 Section 6
 * @param authServerMetadata authorization server configuration
 * @param clientId OAuth client identifier
 * @param refreshToken refresh token from previous token response
 * @returns OAuth token response with new access token
 * @throws {import('#errors').ExternalError} when token refresh fails
 * @example
 * ```typescript
 * const tokens = await refreshAccessToken(
 *   authServerMetadata,
 *   'client-id',
 *   'refresh-token-value'
 * );
 *
 * console.log(tokens.access_token); // New access token
 * ```
 */
export async function refreshAccessToken(
  authServerMetadata: AuthorizationServerMetadata,
  clientId: string,
  refreshToken: string,
): Promise<OAuthTokenResponse> {
  try {
    // Build refresh token request body
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });

    // Make token refresh request
    const response = await fetch(authServerMetadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ExternalError(
        `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const tokenResponse = (await response.json()) as OAuthTokenResponse;

    return tokenResponse;
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to refresh access token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
