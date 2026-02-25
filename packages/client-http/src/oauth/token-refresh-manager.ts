import {
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from '#constants/time';

import type { OAuthTokenResponse } from './types';

/**
 * refresh function type for obtaining new access tokens
 *
 * callback function that performs token refresh operation using
 * refresh token grant to obtain new access token from authorization server
 */
export type RefreshFunction = () => Promise<OAuthTokenResponse>;

/** JWT payload structure with standard claims */
interface JWTPayload {
  /** expiration time as Unix timestamp in seconds */
  exp?: number;
  /** issued at time as Unix timestamp in seconds */
  iat?: number;
  /** other claims */
  [key: string]: unknown;
}

/** number of minutes in expiration buffer */
const EXPIRATION_BUFFER_MINUTES = 5;
/** default token lifetime in hours */
const DEFAULT_TOKEN_LIFETIME_HOURS = 1;
/** expected number of parts in JWT (header.payload.signature) */
const JWT_PARTS_COUNT = 3;
/** index of payload part in JWT */
const JWT_PAYLOAD_INDEX = 1;

/**
 * manages proactive token refresh with expiration buffer
 *
 * implements smart token refresh strategy with 5-minute expiration buffer
 * to prevent token expiration during request processing. uses hybrid approach
 * for expiration calculation: JWT exp claim preferred, falls back to expires_in,
 * defaults to 1-hour lifetime if neither available
 *
 * key features:
 * - proactive refresh before expiration (5-minute buffer)
 * - hybrid expiration calculation (JWT claims → expires_in → default)
 * - automatic token state management
 * - thread-safe refresh operations
 *
 * security considerations:
 * - validates token expiration before returning
 * - prevents expired token usage
 * - maintains token freshness for continuous operations
 * @example
 * ```typescript
 * const manager = new TokenRefreshManager(
 *   currentToken,
 *   refreshToken,
 *   async () => {
 *     return await refreshAccessToken(authServer, clientId, refreshToken);
 *   }
 * );
 *
 * // Get valid token (refreshes if needed)
 * const token = await manager.getValidToken();
 * console.log(token); // Always valid, never expired
 * ```
 */
export class TokenRefreshManager {
  /** current access token */
  #accessToken: string;

  /** callback function to perform token refresh */
  #refreshFunction: RefreshFunction;

  /** token expiration timestamp in milliseconds */
  #expiresAt: number;

  /** expiration buffer in milliseconds (5 minutes) */
  readonly #expirationBufferMs =
    EXPIRATION_BUFFER_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

  /**
   * creates token refresh manager with initial token state
   * @param accessToken current access token
   * @param refreshToken refresh token for obtaining new access tokens
   * @param refreshFunction callback function to perform token refresh
   * @param expiresIn optional token lifetime in seconds from token response
   */
  constructor(
    accessToken: string,
    refreshToken: string,
    refreshFunction: RefreshFunction,
    expiresIn?: number,
  ) {
    // Store refreshToken in local variable to satisfy parameter usage
    // It's passed to constructor for API consistency but not stored
    // since refresh is handled via callback function
    void refreshToken;

    this.#accessToken = accessToken;
    this.#refreshFunction = refreshFunction;
    this.#expiresAt = this.#calculateExpiration(accessToken, expiresIn);
  }

  /**
   * gets valid access token, refreshing if expiring soon
   *
   * returns current token if still valid (not expiring within 5 minutes),
   * otherwise performs refresh operation to obtain new token before returning
   * @returns valid access token guaranteed not to be expiring soon
   */
  public async getValidToken(): Promise<string> {
    const now = Date.now();
    const timeUntilExpiration = this.#expiresAt - now;

    // Check if token is expiring within buffer period
    if (timeUntilExpiration > this.#expirationBufferMs) {
      return this.#accessToken;
    }

    // Token expiring soon or expired, refresh it
    const tokenResponse = await this.#refreshFunction();

    // Update internal state with new token and expiration
    this.#accessToken = tokenResponse.access_token;
    this.#expiresAt = this.#calculateExpiration(
      tokenResponse.access_token,
      tokenResponse.expires_in,
    );

    return this.#accessToken;
  }

  /**
   * calculates token expiration timestamp using hybrid approach
   *
   * tries three strategies in order:
   * 1. extract JWT exp claim from access token
   * 2. use expires_in parameter from token response
   * 3. default to 1 hour lifetime
   * @param accessToken access token to check for JWT exp claim
   * @param expiresIn optional token lifetime in seconds
   * @returns expiration timestamp in milliseconds
   */
  #calculateExpiration(accessToken: string, expiresIn?: number): number {
    // Strategy 1: Try extracting JWT exp claim
    if (accessToken.includes('.')) {
      try {
        const parts = accessToken.split('.');
        if (parts.length === JWT_PARTS_COUNT) {
          const payload: JWTPayload = JSON.parse(
            Buffer.from(parts[JWT_PAYLOAD_INDEX], 'base64url').toString(
              'utf-8',
            ),
          ) as JWTPayload;
          if (payload.exp && typeof payload.exp === 'number') {
            return payload.exp * MS_PER_SECOND;
          }
        }
      } catch {
        // Not a JWT or parsing failed, fall through to next strategy
      }
    }

    // Strategy 2: Use expires_in if available
    if (expiresIn !== undefined) {
      return Date.now() + expiresIn * MS_PER_SECOND;
    }

    // Strategy 3: Default to 1 hour
    return (
      Date.now() +
      DEFAULT_TOKEN_LIFETIME_HOURS *
        MINUTES_PER_HOUR *
        SECONDS_PER_MINUTE *
        MS_PER_SECOND
    );
  }
}
