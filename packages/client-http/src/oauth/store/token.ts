/**
 * @file OAuth token storage interface with multi-issuer support
 *
 * provides abstraction for storing and retrieving OAuth access and refresh tokens
 * with support for multiple authorization servers via issuer-based partitioning
 */

/**
 * token storage interface for managing OAuth tokens across multiple issuers
 *
 * enables single token store instance to manage tokens for different OAuth
 * authorization servers by requiring issuer identifier for all operations
 * @example
 * ```typescript
 * class MemoryTokenStore implements TokenStore {
 *   private tokens = new Map<string, { access: string; refresh?: string; expiresAt?: number }>();
 *
 *   async getAccessToken(issuer: string): Promise<string | null> {
 *     return this.tokens.get(issuer)?.access ?? null;
 *   }
 *
 *   async getRefreshToken(issuer: string): Promise<string | null> {
 *     return this.tokens.get(issuer)?.refresh ?? null;
 *   }
 *
 *   async setTokens(
 *     issuer: string,
 *     accessToken: string,
 *     refreshToken?: string,
 *     expiresAt?: number,
 *   ): Promise<void> {
 *     this.tokens.set(issuer, { access: accessToken, refresh: refreshToken, expiresAt });
 *   }
 *
 *   async getTokenExpiration(issuer: string): Promise<number | null> {
 *     return this.tokens.get(issuer)?.expiresAt ?? null;
 *   }
 *
 *   async clearTokens(issuer: string): Promise<void> {
 *     this.tokens.delete(issuer);
 *   }
 * }
 * ```
 */
export interface TokenStore {
  /**
   * retrieves access token for specified OAuth issuer
   * @param issuer authorization server issuer identifier
   * @returns promise resolving to access token or null if not found
   */
  getAccessToken(issuer: string): Promise<string | null>;

  /**
   * retrieves refresh token for specified OAuth issuer
   * @param issuer authorization server issuer identifier
   * @returns promise resolving to refresh token or null if not found
   */
  getRefreshToken(issuer: string): Promise<string | null>;

  /**
   * stores access and optional refresh token for specified OAuth issuer
   * @param issuer authorization server issuer identifier
   * @param accessToken OAuth access token to store
   * @param refreshToken optional OAuth refresh token to store
   * @param expiresAt optional Unix timestamp in milliseconds when access token expires
   * @returns promise resolving when tokens stored successfully
   */
  setTokens(
    issuer: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: number,
  ): Promise<void>;

  /**
   * retrieves token expiration timestamp for specified OAuth issuer
   * @param issuer authorization server issuer identifier
   * @returns promise resolving to Unix timestamp in milliseconds, or null if not available
   */
  getTokenExpiration(issuer: string): Promise<number | null>;

  /**
   * clears all tokens for specified OAuth issuer
   * @param issuer authorization server issuer identifier
   * @returns promise resolving when tokens cleared successfully
   */
  clearTokens(issuer: string): Promise<void>;
}
