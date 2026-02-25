/**
 * @file OAuth token exchange flow coordinator
 *
 * coordinates OAuth 2.1 authorization code exchange for access tokens
 * by orchestrating token exchange, token storage, and refresh manager initialization
 *
 * separates token exchange coordination logic from HTTP transport layer for improved
 * testability and maintainability following Single Responsibility Principle
 */

import { ExternalError } from '#errors';

import { exchangeAuthorizationCode } from './openid-client-adapter';
import { TokenRefreshManager } from './token-refresh-manager';

import type { RefreshFunction } from './token-refresh-manager';
import type { AuthorizationServerMetadata } from './types';

/**
 * result of token exchange operation
 *
 * provides access token, optional refresh token, and initialized token manager
 * for automatic token refresh during subsequent requests
 */
export interface TokenExchangeResult {
  /** access token for API requests */
  accessToken: string;
  /** optional refresh token for obtaining new access tokens */
  refreshToken?: string;
  /** token manager for automatic refresh operations */
  tokenManager: TokenRefreshManager;
}

/**
 * exchanges authorization code for access tokens with automatic refresh setup
 *
 * coordinates OAuth 2.1 authorization code exchange by calling token endpoint,
 * validating response, and initializing token refresh manager for proactive
 * token refresh before expiration
 *
 * key responsibilities:
 * - exchange authorization code for tokens using PKCE
 * - validate token response from authorization server
 * - initialize token refresh manager with refresh callback
 * - return tokens and manager for connector usage
 *
 * design principles:
 * - pure coordination logic (no HTTP/SSE dependencies)
 * - dependency injection (metadata and callbacks injected)
 * - single responsibility (token exchange only)
 * - comprehensive error handling (wraps all failures)
 * @param authServerMetadata authorization server configuration from discovery
 * @param clientId OAuth client identifier
 * @param callbackUri redirect URI from OAuth callback
 * @param authorizationCode authorization code from OAuth callback
 * @param codeVerifier PKCE code verifier from authorization flow
 * @param refreshCallback callback function to refresh tokens
 * @returns token exchange result with tokens and manager
 * @throws {ExternalError} when token exchange fails or response invalid
 * @example
 * ```typescript
 * const result = await exchangeCodeForTokens(
 *   authServerMetadata,
 *   'client-id',
 *   'https://myapp.com/callback?code=abc&state=xyz',
 *   'authorization-code',
 *   'pkce-code-verifier',
 *   async () => refreshAccessToken(authServerMetadata, 'client-id', refreshToken)
 * );
 *
 * // Use result.accessToken for requests
 * // result.tokenManager handles automatic refresh
 * ```
 */
export async function exchangeCodeForTokens(
  authServerMetadata: AuthorizationServerMetadata,
  clientId: string,
  callbackUri: string,
  authorizationCode: string,
  codeVerifier: string,
  refreshCallback: RefreshFunction,
): Promise<TokenExchangeResult> {
  try {
    // Step 1: Exchange authorization code for tokens using openid-client adapter
    const tokenResponse = await exchangeAuthorizationCode(
      authServerMetadata,
      clientId,
      callbackUri,
      authorizationCode,
      codeVerifier,
    );

    // Step 2: Extract tokens from response
    const accessToken = tokenResponse.access_token;
    const refreshToken = tokenResponse.refresh_token;

    // Step 3: Initialize token refresh manager for automatic token refresh
    // Manager will proactively refresh tokens 5 minutes before expiration
    const tokenManager = new TokenRefreshManager(
      accessToken,
      refreshToken ?? '', // Pass empty string if no refresh token
      refreshCallback,
      tokenResponse.expires_in,
    );

    // Step 4: Return tokens and manager for connector usage
    return {
      accessToken,
      refreshToken,
      tokenManager,
    };
  } catch (error) {
    // Wrap all errors in ExternalError for consistent error handling
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to exchange authorization code for tokens: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
