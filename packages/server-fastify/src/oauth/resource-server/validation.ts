import {
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_UNAUTHORIZED,
} from '#constants/http';
import { MS_PER_SECOND } from '#constants/time';

import type { TokenInfo } from '../types';

/** parameters for token validation */
export interface ValidateTokenInput {
  /** bearer token to validate */
  token: string;
  /** required scopes for access */
  requiredScopes?: string[];
}

/** result of token validation */
export interface ValidateTokenResult {
  /** indicates if token is valid */
  valid: boolean;
  /** token information if valid */
  tokenInfo?: TokenInfo;
  /** error message if invalid */
  error?: string;
  /** http status code for error */
  statusCode?: number;
}

const BEARER_PREFIX_LENGTH = 7; // length of "Bearer " prefix

/**
 * validates bearer token for resource access
 * @param input token validation parameters
 * @param introspector function to introspect token
 * @returns validation result with token info or error
 */
export async function validateBearerToken(
  input: ValidateTokenInput,
  introspector: (token: string) => Promise<TokenInfo>,
): Promise<ValidateTokenResult> {
  // introspect token - catch discovery errors
  let tokenInfo: TokenInfo;
  try {
    tokenInfo = await introspector(input.token);
  } catch (error) {
    // discovery failure (e.g., invalid issuer URL or missing introspection endpoint)
    // treat as configuration error and return 400 bad request
    const errorMessage =
      error instanceof Error ? error.message : 'Token introspection failed';

    return {
      valid: false,
      error: errorMessage,
      statusCode: HTTP_BAD_REQUEST,
    };
  }

  if (!tokenInfo.active) {
    return {
      valid: false,
      error: 'Token is not active',
      statusCode: HTTP_UNAUTHORIZED,
    };
  }

  // validate token expiry (RFC 7662 Section 2.2)
  // note: Use !== undefined to handle exp: 0 (epoch time) correctly
  if (
    tokenInfo.exp !== undefined &&
    tokenInfo.exp < Math.floor(Date.now() / MS_PER_SECOND)
  ) {
    return {
      valid: false,
      error: 'Token has expired',
      statusCode: HTTP_UNAUTHORIZED,
    };
  }

  // validate required scopes if specified
  if (input.requiredScopes && input.requiredScopes.length > 0) {
    const tokenScopes = tokenInfo.scope?.split(' ') ?? [];
    const hasRequiredScopes = input.requiredScopes.every((scope) =>
      tokenScopes.includes(scope),
    );

    if (!hasRequiredScopes) {
      return {
        valid: false,
        error: 'Insufficient scope',
        statusCode: HTTP_FORBIDDEN,
      };
    }
  }

  return {
    valid: true,
    tokenInfo,
  };
}

/**
 * extract bearer token from authorization header
 * @param authHeader authorization header value
 * @returns extracted token or null
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(BEARER_PREFIX_LENGTH);
}
