/**
 * @module oauth/proxy/state
 * @description JWT-based state encoding and decoding for OAuth proxy flows.
 * The proxy state preserves original client information through the external AS flow.
 */

import { SignJWT, jwtVerify } from 'jose';

import { DEFAULT_STATE_EXPIRY_SECONDS } from './config';

/**
 * Proxy state data encoded in JWT during OAuth flow.
 * This data is preserved through the external AS authorization flow
 * and decoded when the callback is received.
 */
export interface ProxyState {
  /** local client ID that initiated the authorization */
  clientId: string;
  /** original redirect URI from the client */
  redirectUri: string;
  /** original state parameter from the client (if provided) */
  originalState?: string;
  /** PKCE code challenge for validation at proxy level */
  codeChallenge?: string;
  /** PKCE challenge method (S256 or plain) */
  codeChallengeMethod?: string;
  /** requested scopes */
  scope?: string;
  /** timestamp when state was created (for additional validation) */
  timestamp: number;
}

/**
 * Error thrown when proxy state encoding or decoding fails.
 */
export class ProxyStateError extends Error {
  /**
   * Creates a new ProxyStateError.
   * @param message error message describing the failure
   */
  constructor(message: string) {
    super(message);
    this.name = 'ProxyStateError';
  }
}

/**
 * creates a secret key from the state secret string.
 * @param secret the state secret string
 * @returns encoded secret key for JWT operations
 */
function createSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * encodes proxy state data into a signed JWT.
 * @param data proxy state data to encode
 * @param secret secret key for signing the JWT
 * @param expirySeconds optional expiry time in seconds (default: 600)
 * @returns signed JWT string
 * @throws {ProxyStateError} if encoding fails
 * @example
 * ```typescript
 * const state = await encodeProxyState({
 *   clientId: 'client_abc123',
 *   redirectUri: 'https://app.example.com/callback',
 *   originalState: 'user-state',
 *   timestamp: Date.now(),
 * }, 'my-secret-key-at-least-32-chars!!');
 * ```
 */
export async function encodeProxyState(
  data: ProxyState,
  secret: string,
  expirySeconds: number = DEFAULT_STATE_EXPIRY_SECONDS,
): Promise<string> {
  try {
    const secretKey = createSecretKey(secret);

    const jwt = await new SignJWT({
      cid: data.clientId,
      ruri: data.redirectUri,
      ost: data.originalState,
      cc: data.codeChallenge,
      ccm: data.codeChallengeMethod,
      scp: data.scope,
      ts: data.timestamp,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expirySeconds}s`)
      .sign(secretKey);

    return jwt;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown encoding error';
    throw new ProxyStateError(`Failed to encode proxy state: ${message}`);
  }
}

/**
 * decodes and verifies a proxy state JWT.
 * @param token JWT string to decode
 * @param secret secret key for verifying the JWT
 * @returns decoded proxy state data
 * @throws {ProxyStateError} if decoding or verification fails
 * @example
 * ```typescript
 * try {
 *   const state = await decodeProxyState(token, 'my-secret-key-at-least-32-chars!!');
 *   console.log(state.clientId); // 'client_abc123'
 * } catch (error) {
 *   if (error instanceof ProxyStateError) {
 *     console.error('Invalid state:', error.message);
 *   }
 * }
 * ```
 */
export async function decodeProxyState(
  token: string,
  secret: string,
): Promise<ProxyState> {
  try {
    const secretKey = createSecretKey(secret);

    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });

    // validate required fields
    if (typeof payload.cid !== 'string') {
      throw new Error('Missing or invalid clientId in state');
    }
    if (typeof payload.ruri !== 'string') {
      throw new Error('Missing or invalid redirectUri in state');
    }
    if (typeof payload.ts !== 'number') {
      throw new Error('Missing or invalid timestamp in state');
    }

    return {
      clientId: payload.cid,
      redirectUri: payload.ruri,
      originalState: typeof payload.ost === 'string' ? payload.ost : undefined,
      codeChallenge: typeof payload.cc === 'string' ? payload.cc : undefined,
      codeChallengeMethod:
        typeof payload.ccm === 'string' ? payload.ccm : undefined,
      scope: typeof payload.scp === 'string' ? payload.scp : undefined,
      timestamp: payload.ts,
    };
  } catch (error) {
    if (error instanceof ProxyStateError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : 'Unknown decoding error';
    throw new ProxyStateError(`Failed to decode proxy state: ${message}`);
  }
}
