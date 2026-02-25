/**
 * @module oauth/proxy/proxy-crypto
 * @description Shared cryptographic and validation functions for OAuth proxy handlers.
 * Provides common operations for token hashing, error responses, client
 * credential extraction, and PKCE verification used across multiple handlers.
 */

import { createHash } from 'node:crypto';

import { HTTP_BAD_REQUEST } from '#constants/http';

import { parseBasicAuthHeader } from './forwarder';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthCodeMapping } from './adapter';

// TYPES //

/**
 * Extracted client credentials from request.
 * Used for authentication in token, introspection, and revocation endpoints.
 */
export interface ClientCredentials {
  /** Client identifier */
  clientId: string;
  /** Client secret for authentication */
  clientSecret: string;
}

/**
 * Request body containing optional client credentials.
 * Base interface for OAuth request types that may include client credentials
 * in the body for authentication.
 */
export interface RequestBodyWithCredentials {
  /** Client identifier from body */
  client_id?: string;
  /** Client secret from body */
  client_secret?: string;
}

// TOKEN HASHING //

/**
 * hashes a token for secure storage mapping.
 * Uses SHA256 to create a one-way hash of the token for storage lookups
 * without exposing the actual token value.
 * @param token - Access or refresh token to hash
 * @returns SHA256 hex hash of the token
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ERROR RESPONSES //

/**
 * sends an OAuth error response.
 * Formats and sends a standard OAuth 2.0 error response with the specified
 * status code, error code, and description.
 * @param reply - Fastify reply object
 * @param statusCode - HTTP status code to send
 * @param error - OAuth error code (e.g., 'invalid_client', 'invalid_request')
 * @param errorDescription - Human-readable error description
 */
export function sendErrorResponse(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  errorDescription: string,
): void {
  void reply.status(statusCode).send({
    error,
    error_description: errorDescription,
  });
}

// CLIENT CREDENTIAL EXTRACTION //

/**
 * extracts client credentials from a request.
 * Attempts to extract credentials from Basic Authorization header first,
 * falling back to body parameters if header is not present.
 * @param request - Fastify request with body containing optional credentials
 * @returns Extracted client credentials or null if not found
 */
export function extractClientCredentials(
  request: FastifyRequest<{ Body: RequestBodyWithCredentials }>,
): ClientCredentials | null {
  // try Basic Auth header first
  const authHeader = request.headers.authorization;
  const basicAuth = parseBasicAuthHeader(authHeader);

  if (basicAuth) {
    return basicAuth;
  }

  // fall back to body parameters
  const { client_id: clientId, client_secret: clientSecret } = request.body;

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  return null;
}

// PKCE VERIFICATION //

/**
 * Verifies PKCE code_verifier against stored code_challenge.
 * Supports both 'plain' and 'S256' challenge methods per RFC 7636.
 * @param codeVerifier - Client-provided code verifier string
 * @param codeChallenge - Stored code challenge to verify against
 * @param method - Challenge method ('plain' or 'S256')
 * @returns True if verification passes, false otherwise
 */
export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }

  // S256: BASE64URL(SHA256(code_verifier)) === code_challenge
  const hash = createHash('sha256').update(codeVerifier).digest('base64url');

  return hash === codeChallenge;
}

// AUTH CODE VALIDATION //

/**
 * Validates authorization code mapping against client and redirect URI.
 * @param codeMapping - stored auth code mapping
 * @param credentials - client credentials to validate
 * @param redirectUri - redirect URI from request
 * @param reply - fastify reply for error responses
 * @returns true if valid, false if error response was sent
 */
export function validateCodeMapping(
  codeMapping: AuthCodeMapping,
  credentials: ClientCredentials,
  redirectUri: string | undefined,
  reply: FastifyReply,
): boolean {
  if (codeMapping.clientId !== credentials.clientId) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_grant',
      'Authorization code was not issued to this client',
    );

    return false;
  }
  if (redirectUri && redirectUri !== codeMapping.redirectUri) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_grant',
      'redirect_uri does not match',
    );

    return false;
  }

  return true;
}

/**
 * Validates PKCE code verifier if challenge was stored.
 * @param codeMapping - stored auth code mapping
 * @param codeVerifier - client-provided code verifier
 * @param reply - fastify reply for error responses
 * @returns true if valid or no PKCE required, false if error response was sent
 */
export function validateCodeVerifier(
  codeMapping: AuthCodeMapping,
  codeVerifier: string | undefined,
  reply: FastifyReply,
): boolean {
  if (!codeMapping.codeChallenge) {
    return true;
  }
  if (!codeVerifier) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_request',
      'code_verifier is required',
    );

    return false;
  }
  const method = codeMapping.codeChallengeMethod ?? 'S256';
  if (!verifyPKCE(codeVerifier, codeMapping.codeChallenge, method)) {
    sendErrorResponse(
      reply,
      HTTP_BAD_REQUEST,
      'invalid_grant',
      'Invalid code_verifier',
    );

    return false;
  }

  return true;
}
