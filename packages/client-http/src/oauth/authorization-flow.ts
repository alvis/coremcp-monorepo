/**
 * @file OAuth authorization flow coordinator
 *
 * coordinates OAuth 2.1 authorization challenge handling and authorization URL generation
 * by orchestrating discovery, PKCE generation, and state management in a testable manner
 *
 * separates OAuth flow coordination logic from HTTP transport layer for improved
 * testability and maintainability following Single Responsibility Principle
 */

import { ExternalError } from '#errors';

import {
  createAuthorizationUrl,
  discoverFromChallenge,
} from './openid-client-adapter';

import type {
  AuthorizationServerMetadata,
  ProtectedResourceMetadata,
} from './types';

/**
 * configuration for OAuth authorization flow
 *
 * provides all necessary OAuth client configuration for authorization URL generation
 * and state management during authorization flow
 */
export interface AuthorizationFlowConfig {
  /** OAuth client identifier for authorization requests */
  clientId: string;
  /** callback URL for authorization response */
  redirectUri: string;
  /** additional OAuth scopes beyond resource-required scopes */
  additionalScopes?: string[];
}

/**
 * result of authorization flow containing authorization URL and flow state
 *
 * provides all necessary information for client to initiate user authorization
 * and complete token exchange after callback
 */
export interface AuthorizationFlowResult {
  /** authorization URL for user consent */
  authorizationUrl: string;
  /** PKCE code verifier for token exchange */
  codeVerifier: string;
  /** OAuth issuer identifier for token operations */
  issuer: string;
  /** authorization server metadata for token exchange */
  authServerMetadata: AuthorizationServerMetadata;
  /** protected resource metadata for scope validation */
  resourceMetadata: ProtectedResourceMetadata;
}

/**
 * coordinates OAuth 2.1 authorization challenge handling
 *
 * processes WWW-Authenticate header to discover OAuth configuration,
 * generates authorization URL with PKCE, and returns flow state for
 * subsequent token exchange
 *
 * key responsibilities:
 * - parse WWW-Authenticate challenge header
 * - discover authorization server and resource metadata
 * - generate PKCE code verifier and challenge
 * - build authorization URL with required parameters
 * - return flow state for token exchange
 *
 * design principles:
 * - pure coordination logic (no HTTP/SSE dependencies)
 * - dependency injection (all adapters injected)
 * - single responsibility (authorization flow only)
 * - comprehensive error handling (wraps all failures)
 * @param wwwAuthHeader WWW-Authenticate header value from 401 response
 * @param config OAuth client configuration
 * @returns authorization flow result with URL and state
 * @throws {ExternalError} when discovery or URL generation fails
 * @example
 * ```typescript
 * const result = await handleAuthorizationChallenge(
 *   'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
 *   {
 *     clientId: 'client-id',
 *     redirectUri: 'https://myapp.com/callback',
 *     additionalScopes: ['offline_access']
 *   }
 * );
 *
 * // Store result.codeVerifier for token exchange
 * // Direct user to result.authorizationUrl
 * ```
 */
export async function handleAuthorizationChallenge(
  wwwAuthHeader: string,
  config: AuthorizationFlowConfig,
): Promise<AuthorizationFlowResult> {
  try {
    // Step 1: Discover OAuth configuration from WWW-Authenticate header
    const { authServerMetadata, resourceMetadata } =
      await discoverFromChallenge(wwwAuthHeader);

    // Step 2: Combine resource scopes with additional scopes
    const scopes = [
      ...(resourceMetadata.scopes_supported ?? []),
      ...(config.additionalScopes ?? []),
    ];

    // Step 3: Generate authorization URL with PKCE
    const { authorizationUrl, codeVerifier } = await createAuthorizationUrl(
      authServerMetadata,
      config.clientId,
      config.redirectUri,
      {
        scopes,
        resource: resourceMetadata.resource,
      },
    );

    // Step 4: Return flow result with all necessary state
    return {
      authorizationUrl,
      codeVerifier,
      issuer: authServerMetadata.issuer,
      authServerMetadata,
      resourceMetadata,
    };
  } catch (error) {
    // Wrap all errors in ExternalError for consistent error handling
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to handle OAuth authorization challenge: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
