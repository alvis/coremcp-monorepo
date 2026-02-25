/**
 * @module oauth/proxy/registration
 * @description Dynamic client registration handler for the OAuth proxy.
 * Handles RFC 7591 client registration locally since the external AS
 * does not support dynamic registration.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { ProxyClient, ProxyStorageAdapter } from './adapter';

/**
 * Client registration request following RFC 7591.
 */
export interface ClientRegistrationRequest {
  /** human-readable client name */
  client_name?: string;
  /** allowed redirect URIs (required) */
  redirect_uris: string[];
  /** supported grant types (default: authorization_code) */
  grant_types?: string[];
  /** supported response types (default: code) */
  response_types?: string[];
  /** token endpoint authentication method (default: client_secret_basic) */
  token_endpoint_auth_method?: string;
  /** requested OAuth scopes */
  scope?: string;
  /** contact emails for the client */
  contacts?: string[];
  /** URI to client's logo */
  logo_uri?: string;
  /** URI to client's homepage */
  client_uri?: string;
  /** URI to client's privacy policy */
  policy_uri?: string;
  /** URI to client's terms of service */
  tos_uri?: string;
}

/**
 * Client registration response following RFC 7591.
 * Includes the generated client credentials.
 */
export interface ClientRegistrationResponse {
  /** generated client identifier */
  client_id: string;
  /** generated client secret (only returned once) */
  client_secret: string;
  /** timestamp when credentials expire (optional, 0 = never) */
  client_secret_expires_at: number;
  /** echoed registration metadata */
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
}

/**
 * Error thrown when client registration fails.
 */
export class ClientRegistrationError extends Error {
  public readonly code: string;

  /**
   * Creates a new ClientRegistrationError.
   * @param code error code for the registration failure
   * @param message error message describing the failure
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ClientRegistrationError';
    this.code = code;
  }
}

// byte lengths for cryptographic operations
const CLIENT_ID_BYTES = 16;
const CLIENT_SECRET_BYTES = 32;

// supported OAuth features
const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const SUPPORTED_RESPONSE_TYPES = ['code'];
const SUPPORTED_AUTH_METHODS = [
  'client_secret_basic',
  'client_secret_post',
  'none',
];

/**
 * Generates a cryptographically secure client ID.
 * @returns unique client identifier with 'proxy_' prefix
 */
export function generateClientId(): string {
  return 'proxy_' + randomBytes(CLIENT_ID_BYTES).toString('hex');
}

/**
 * Generates a cryptographically secure client secret.
 * @returns secure random client secret
 */
export function generateClientSecret(): string {
  return randomBytes(CLIENT_SECRET_BYTES).toString('hex');
}

/**
 * Hashes a client secret for secure storage.
 * @param secret plaintext client secret
 * @returns SHA-256 hash of the secret
 */
export function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Verifies a client secret against its stored hash.
 * @param secret plaintext secret to verify
 * @param hash stored hash to compare against
 * @returns true if the secret matches the hash
 */
export function verifyClientSecret(secret: string, hash: string): boolean {
  const secretHash = hashClientSecret(secret);

  // use timing-safe comparison to prevent timing attacks
  if (secretHash.length !== hash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < secretHash.length; i++) {
    result |= secretHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }

  return result === 0;
}

/**
 * validates a single redirect URI.
 * @param uri redirect URI to validate
 * @throws {ClientRegistrationError} if URI is invalid
 */
function validateRedirectUri(uri: string): void {
  let parsed: URL;

  try {
    parsed = new URL(uri);
  } catch {
    throw new ClientRegistrationError(
      'invalid_redirect_uri',
      `invalid redirect_uri format: ${uri}`,
    );
  }

  // only allow https in production, or localhost for development
  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new ClientRegistrationError(
      'invalid_redirect_uri',
      `redirect_uri must use https: ${uri}`,
    );
  }

  // disallow fragment in redirect URIs
  if (parsed.hash) {
    throw new ClientRegistrationError(
      'invalid_redirect_uri',
      `redirect_uri must not contain a fragment: ${uri}`,
    );
  }
}

/**
 * validates array values against supported options.
 * @param values values to validate
 * @param supported list of supported values
 * @param errorCode error code for failures
 * @param fieldName field name for error messages
 * @throws {ClientRegistrationError} if any value is unsupported
 */
function validateSupportedValues(
  values: string[],
  supported: string[],
  errorCode: string,
  fieldName: string,
): void {
  for (const value of values) {
    if (!supported.includes(value)) {
      throw new ClientRegistrationError(
        errorCode,
        `unsupported ${fieldName}: ${value}`,
      );
    }
  }
}

/**
 * validates a client registration request.
 * @param request registration request to validate
 * @param allowedScopes optional list of allowed scopes
 * @throws {ClientRegistrationError} if validation fails
 */
export function validateRegistrationRequest(
  request: ClientRegistrationRequest,
  allowedScopes?: string[],
): void {
  // redirect_uris is required
  if (request.redirect_uris.length === 0) {
    throw new ClientRegistrationError(
      'invalid_redirect_uri',
      'redirect_uris is required and must not be empty',
    );
  }

  // validate each redirect URI
  for (const uri of request.redirect_uris) {
    validateRedirectUri(uri);
  }

  // validate grant types
  const grantTypes = request.grant_types ?? ['authorization_code'];
  validateSupportedValues(
    grantTypes,
    SUPPORTED_GRANT_TYPES,
    'invalid_client_metadata',
    'grant_type',
  );

  // validate response types
  const responseTypes = request.response_types ?? ['code'];
  validateSupportedValues(
    responseTypes,
    SUPPORTED_RESPONSE_TYPES,
    'invalid_client_metadata',
    'response_type',
  );

  // validate token endpoint auth method
  const authMethod =
    request.token_endpoint_auth_method ?? 'client_secret_basic';
  validateSupportedValues(
    [authMethod],
    SUPPORTED_AUTH_METHODS,
    'invalid_client_metadata',
    'token_endpoint_auth_method',
  );

  // validate scopes if allowedScopes is provided
  if (allowedScopes && request.scope) {
    const requestedScopes = request.scope.split(' ');
    validateSupportedValues(
      requestedScopes,
      allowedScopes,
      'invalid_scope',
      'scope',
    );
  }
}

/**
 * handles dynamic client registration.
 * Validates the request, generates credentials, and stores the client.
 * @param request client registration request
 * @param storage storage adapter for persisting the client
 * @param allowedScopes optional list of allowed scopes
 * @returns client registration response with generated credentials
 * @throws {ClientRegistrationError} if registration fails
 */
export async function handleClientRegistration(
  request: ClientRegistrationRequest,
  storage: ProxyStorageAdapter,
  allowedScopes?: string[],
): Promise<ClientRegistrationResponse> {
  // validate the registration request
  validateRegistrationRequest(request, allowedScopes);

  // generate client credentials
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const clientSecretHash = hashClientSecret(clientSecret);

  // prepare client data for storage
  const grantTypes = request.grant_types ?? ['authorization_code'];
  const responseTypes = request.response_types ?? ['code'];
  const tokenEndpointAuthMethod =
    request.token_endpoint_auth_method ?? 'client_secret_basic';

  const client: ProxyClient = {
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: request.client_name,
    redirect_uris: request.redirect_uris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    scope: request.scope,
    created_at: Date.now(),
    metadata: {
      contacts: request.contacts,
      logo_uri: request.logo_uri,
      client_uri: request.client_uri,
      policy_uri: request.policy_uri,
      tos_uri: request.tos_uri,
    },
  };

  // store the client
  await storage.upsertClient(clientId, client);

  // return the registration response (secret only returned once)
  return {
    client_id: clientId,
    client_secret: clientSecret,
    client_secret_expires_at: 0, // never expires
    client_name: request.client_name,
    redirect_uris: request.redirect_uris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    scope: request.scope,
  };
}

/**
 * validates client credentials for authentication.
 * @param clientId client identifier
 * @param clientSecret client secret
 * @param storage storage adapter to lookup client
 * @returns the client if credentials are valid, null otherwise
 */
export async function validateClientCredentials(
  clientId: string,
  clientSecret: string,
  storage: ProxyStorageAdapter,
): Promise<ProxyClient | null> {
  const client = await storage.findClient(clientId);

  if (!client) {
    return null;
  }

  if (!verifyClientSecret(clientSecret, client.client_secret_hash)) {
    return null;
  }

  return client;
}
