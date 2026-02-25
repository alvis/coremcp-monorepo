/**
 * @module oauth/proxy
 * @description OAuth proxy that adds dynamic client registration (RFC 7591)
 * to external authorization servers that do not support it natively.
 *
 * The proxy:
 * 1. Handles client registration locally (stored in local storage)
 * 2. Proxies OAuth flows to an external AS using pre-registered proxy credentials
 * 3. Maps tokens between local clients and the proxy client
 */

// route registration
export { PROXY_ROUTES, registerProxyRoutes } from './routes';

export type {
  HandleAuthorize,
  HandleCallback,
  HandleClientInfo,
  HandleClientRegistration,
  HandleIntrospection,
  HandleMetadata,
  HandleRevocation,
  HandleToken,
  ProxyRouteHandlers,
} from './routes';

// configuration
export {
  DEFAULT_STATE_EXPIRY_SECONDS,
  MINIMUM_STATE_SECRET_LENGTH,
  validateProxyConfig,
} from './config';

export type {
  ExternalASEndpoints,
  OAuthProxyConfig,
  ProxyClientCredentials as ProxyClientConfig,
} from './config';

// storage adapter
export { MemoryProxyStorageAdapter } from './adapter';

export type {
  AuthCodeMapping,
  ProxyClient,
  ProxyStorageAdapter,
  TokenMapping,
} from './adapter';

// state encoding/decoding
export { decodeProxyState, encodeProxyState, ProxyStateError } from './state';

export type { ProxyState } from './state';

// client registration handlers
export {
  ClientRegistrationError,
  generateClientId,
  generateClientSecret,
  handleClientRegistration,
  hashClientSecret,
  validateClientCredentials,
  validateRegistrationRequest,
  verifyClientSecret,
} from './registration';

export type {
  ClientRegistrationRequest,
  ClientRegistrationResponse,
} from './registration';

// forwarder utilities
export {
  createBasicAuthHeader,
  createIntrospectionForwarder,
  createRevocationForwarder,
  createTokenForwarder,
  ForwarderError,
  forwardFormRequest,
  forwardJsonRequest,
  parseBasicAuthHeader,
} from './forwarder';

export type { ForwardResult } from './forwarder';

// shared proxy utilities
export {
  extractClientCredentials,
  hashToken,
  sendErrorResponse,
  validateCodeMapping,
  validateCodeVerifier,
  verifyPKCE,
} from './proxy-crypto';

export type {
  ClientCredentials,
  RequestBodyWithCredentials,
} from './proxy-crypto';

// proxy handlers
export {
  createProxyHandlers,
  handleAuthorize,
  handleCallback,
  handleIntrospect,
  handleRevoke,
  handleToken,
} from './handlers';

export type {
  AuthorizeHandler,
  CallbackHandler,
  IntrospectHandler,
  ProxyHandlers,
  RevokeHandler,
  TokenHandler,
} from './handlers';

// wire format types
export type {
  CodeChallengeMethod,
  ExternalEndpoints,
  GrantType,
  MetadataCacheConfig,
  OAuthErrorCode,
  ProxyAuthServerConfig,
  ProxyAuthServerMetadataWire,
  ProxyAuthValidationResult,
  ProxyAuthorizeRequestWire,
  ProxyCallbackErrorRequestWire,
  ProxyCallbackRequest,
  ProxyClientCredentials,
  ProxyClientInfoResponseWire,
  ProxyClientRegistrationRequestWire,
  ProxyClientRegistrationResponseWire,
  ProxyError,
  ProxyErrorResponseWire,
  ProxyIntrospectionRequestWire,
  ProxyIntrospectionResponseWire,
  ProxyOAuthError,
  ProxyOAuthErrorResponseWire,
  ProxyRevocationRequestWire,
  ProxyRouteHandlerOptions,
  ProxyStatePayload,
  ProxyTokenExchangeResult,
  ProxyTokenRequestWire,
  ProxyTokenResponseWire,
  RegisterProxyRoutes,
  ResponseType,
  StateJwtConfig,
  StoredProxyClient,
  TokenClientMapping,
  TokenEndpointAuthMethod,
  TokenMappingStorageAdapter,
  TokenMappingStorageConfig,
} from './types';
