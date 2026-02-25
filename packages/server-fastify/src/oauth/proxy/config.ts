/**
 * @module oauth/proxy/config
 * @description Configuration types for OAuth proxy that adds dynamic client registration
 * to external authorization servers that do not support RFC 7591.
 */

import type { ProxyStorageAdapter } from './adapter';

/**
 * External Authorization Server endpoints configuration.
 * Endpoints can be auto-discovered via the issuer's `.well-known/oauth-authorization-server`
 * metadata, or explicitly configured.
 */
export interface ExternalASEndpoints {
  /** issuer URL for the external authorization server */
  issuer: string;
  /** authorization endpoint URL (auto-discovered if not provided) */
  authorizationEndpoint?: string;
  /** token endpoint URL (auto-discovered if not provided) */
  tokenEndpoint?: string;
  /** introspection endpoint URL (auto-discovered if not provided) */
  introspectionEndpoint?: string;
  /** revocation endpoint URL (auto-discovered if not provided) */
  revocationEndpoint?: string;
  /** pushed authorization request endpoint URL (auto-discovered if not provided) */
  parEndpoint?: string;
}

/**
 * Pre-registered proxy client credentials for the external authorization server.
 * These credentials are used when forwarding OAuth requests to the external AS.
 */
export interface ProxyClientCredentials {
  /** client ID registered with the external AS */
  clientId: string;
  /** client secret registered with the external AS */
  clientSecret: string;
  /** redirect URI registered with the external AS for callback handling */
  redirectUri: string;
}

/**
 * Configuration for the OAuth proxy.
 * The proxy handles dynamic client registration locally while forwarding
 * OAuth flows to an external authorization server.
 */
export interface OAuthProxyConfig {
  // external AS //

  /** external authorization server configuration */
  externalAS: ExternalASEndpoints;

  // proxy credentials //

  /** pre-registered proxy client credentials for the external AS */
  proxyClient: ProxyClientCredentials;

  // storage //

  /** storage adapter for local client registry and token mappings */
  storage: ProxyStorageAdapter;

  // security //

  /** secret key for signing JWT-encoded proxy state (minimum 32 characters) */
  stateSecret: string;

  // optional configuration //

  /** allowed OAuth scopes (defaults to all scopes) */
  allowedScopes?: string[];

  /** proxy state JWT expiry in seconds (default: 600 = 10 minutes) */
  stateExpirySeconds?: number;
}

/**
 * Default configuration values for the OAuth proxy.
 */
export const DEFAULT_STATE_EXPIRY_SECONDS = 600;
export const MINIMUM_STATE_SECRET_LENGTH = 32;

/**
 * validates the OAuth proxy configuration.
 * @param config configuration to validate
 * @throws {Error} when configuration is invalid
 */
export function validateProxyConfig(config: OAuthProxyConfig): void {
  // validate storage (runtime check for configs from untrusted sources)
  if (!config.storage) {
    throw new Error('OAuth proxy config: storage adapter is required');
  }

  // validate external AS
  if (!config.externalAS.issuer) {
    throw new Error('OAuth proxy config: externalAS.issuer is required');
  }

  // validate proxy client credentials
  if (!config.proxyClient.clientId) {
    throw new Error('OAuth proxy config: proxyClient.clientId is required');
  }
  if (!config.proxyClient.clientSecret) {
    throw new Error('OAuth proxy config: proxyClient.clientSecret is required');
  }
  if (!config.proxyClient.redirectUri) {
    throw new Error('OAuth proxy config: proxyClient.redirectUri is required');
  }

  // validate state secret
  if (!config.stateSecret) {
    throw new Error('OAuth proxy config: stateSecret is required');
  }
  if (config.stateSecret.length < MINIMUM_STATE_SECRET_LENGTH) {
    throw new Error(
      `OAuth proxy config: stateSecret must be at least ${MINIMUM_STATE_SECRET_LENGTH} characters`,
    );
  }
}
