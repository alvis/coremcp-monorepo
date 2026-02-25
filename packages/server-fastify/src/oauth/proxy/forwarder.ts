/**
 * @module oauth/proxy/forwarder
 * @description HTTP forwarder utility for proxying OAuth requests to external AS.
 * Handles request forwarding, error parsing, and response processing.
 */

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
} from '#constants/http';

import type { OAuthErrorCode, ProxyOAuthErrorResponseWire } from './types';

// HTTP CONSTANTS //

const HTTP_MAX_SUCCESS = 300;
const CONTENT_TYPE_JSON = 'application/json';
const CONTENT_TYPE_FORM = 'application/x-www-form-urlencoded';

/** length of "Basic " prefix in Authorization header */
const BASIC_PREFIX_LENGTH = 6;

// ERROR TYPES //

/**
 * Error thrown when forwarding a request to the external AS fails.
 * Contains both the HTTP status code and the OAuth error details.
 */
export class ForwarderError extends Error {
  /** HTTP status code from the external AS */
  public readonly statusCode: number;
  /** OAuth error code */
  public readonly errorCode: OAuthErrorCode;
  /** Human-readable error description */
  public readonly errorDescription?: string;
  /** Error URI for additional information */
  public readonly errorUri?: string;
  /** Whether this error originated from the upstream AS */
  public readonly upstreamError: boolean;

  /**
   * Creates a new ForwarderError.
   * @param options error options
   * @param options.message error message describing the failure
   * @param options.statusCode HTTP status code from the external AS
   * @param options.errorCode OAuth error code
   * @param options.errorDescription human-readable error description
   * @param options.errorUri URI for additional error information
   * @param options.upstreamError whether this error originated from upstream AS
   */
  constructor(options: {
    message: string;
    statusCode: number;
    errorCode: OAuthErrorCode;
    errorDescription?: string;
    errorUri?: string;
    upstreamError?: boolean;
  }) {
    super(options.message);
    this.name = 'ForwarderError';
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.errorDescription = options.errorDescription;
    this.errorUri = options.errorUri;
    this.upstreamError = options.upstreamError ?? false;
  }

  /**
   * Converts the error to an OAuth error response wire format.
   * @returns OAuth error response
   */
  public toWireFormat(): ProxyOAuthErrorResponseWire {
    return {
      error: this.errorCode,
      error_description: this.errorDescription,
      error_uri: this.errorUri,
    };
  }
}

// RESPONSE TYPES //

/**
 * Result of a forwarded request.
 */
export interface ForwardResult<T> {
  /** Whether the request was successful */
  success: boolean;
  /** HTTP status code */
  statusCode: number;
  /** Response data (if successful) */
  data?: T;
  /** Error details (if failed) */
  error?: ForwarderError;
}

// HEADER UTILITIES //

/**
 * creates basic authorization header from client credentials.
 * @param clientId client identifier
 * @param clientSecret client secret
 * @returns basic authorization header value
 */
export function createBasicAuthHeader(
  clientId: string,
  clientSecret: string,
): string {
  const credentials = `${clientId}:${clientSecret}`;
  const encoded = Buffer.from(credentials).toString('base64');

  return `Basic ${encoded}`;
}

/**
 * parses basic authorization header to extract credentials.
 * @param authHeader authorization header value
 * @returns parsed credentials or null if invalid
 */
export function parseBasicAuthHeader(
  authHeader: string | undefined,
): { clientId: string; clientSecret: string } | null {
  if (!authHeader?.startsWith('Basic ')) {
    return null;
  }

  try {
    const encoded = authHeader.slice(BASIC_PREFIX_LENGTH);
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');

    if (colonIndex === -1) {
      return null;
    }

    const clientId = decoded.slice(0, colonIndex);
    const clientSecret = decoded.slice(colonIndex + 1);

    if (!clientId || !clientSecret) {
      return null;
    }

    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

// REQUEST BUILDING //

/**
 * builds a form-encoded request body.
 * @param params key-value pairs to encode
 * @returns URLSearchParams-encoded string
 */
export function buildFormBody(
  params: Record<string, string | undefined>,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
}

// RESPONSE PARSING //

/**
 * parses an error response from the external AS.
 * @param body response body
 * @param statusCode HTTP status code
 * @returns parsed ForwarderError
 */
function parseErrorResponse(body: unknown, statusCode: number): ForwarderError {
  // attempt to parse OAuth error format
  if (typeof body === 'object' && body !== null) {
    const errorBody = body as Record<string, unknown>;

    const errorCode =
      typeof errorBody.error === 'string'
        ? (errorBody.error as OAuthErrorCode)
        : 'server_error';

    const errorDescription =
      typeof errorBody.error_description === 'string'
        ? errorBody.error_description
        : undefined;

    const errorUri =
      typeof errorBody.error_uri === 'string' ? errorBody.error_uri : undefined;

    return new ForwarderError({
      message: errorDescription ?? `OAuth error: ${errorCode}`,
      statusCode,
      errorCode,
      errorDescription,
      errorUri,
      upstreamError: true,
    });
  }

  // fallback for non-OAuth error responses
  return new ForwarderError({
    message: `external AS returned status ${statusCode}`,
    statusCode,
    errorCode: 'server_error',
    errorDescription: 'external authorization server returned an error',
    upstreamError: true,
  });
}

// FORWARDING FUNCTIONS //

/**
 * forwards a JSON request to the external AS.
 * @param url target URL
 * @param method HTTP method
 * @param headers request headers
 * @param body request body (will be JSON-encoded)
 * @returns forward result with parsed response
 */
export async function forwardJsonRequest<T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  headers: Record<string, string>,
  body?: unknown,
): Promise<ForwardResult<T>> {
  try {
    const requestHeaders: Record<string, string> = {
      ...headers,
      'Content-Type': CONTENT_TYPE_JSON,
      'Accept': CONTENT_TYPE_JSON,
    };

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    // parse response body
    let responseBody: unknown;

    try {
      const text = await response.text();
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = null;
    }

    // handle error responses
    if (response.status >= HTTP_BAD_REQUEST) {
      const error = parseErrorResponse(responseBody, response.status);

      return {
        success: false,
        statusCode: response.status,
        error,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      data: responseBody as T,
    };
  } catch (error) {
    // network or other errors
    const message =
      error instanceof Error ? error.message : 'Unknown network error';

    return {
      success: false,
      statusCode: HTTP_INTERNAL_SERVER_ERROR,
      error: new ForwarderError({
        message: `Failed to forward request: ${message}`,
        statusCode: HTTP_INTERNAL_SERVER_ERROR,
        errorCode: 'server_error',
        errorDescription:
          'Failed to communicate with external authorization server',
        upstreamError: false,
      }),
    };
  }
}

/**
 * forwards a form-encoded request to the external AS.
 * This is the standard format for OAuth token and introspection endpoints.
 * @param url target URL
 * @param headers request headers (without Content-Type)
 * @param params form parameters
 * @returns forward result with parsed JSON response
 */
export async function forwardFormRequest<T>(
  url: string,
  headers: Record<string, string>,
  params: Record<string, string | undefined>,
): Promise<ForwardResult<T>> {
  try {
    const requestHeaders: Record<string, string> = {
      ...headers,
      'Content-Type': CONTENT_TYPE_FORM,
      'Accept': CONTENT_TYPE_JSON,
    };

    const body = buildFormBody(params);

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body,
    });

    // parse response body as JSON
    let responseBody: unknown;

    try {
      const text = await response.text();
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = null;
    }

    // handle error responses
    if (response.status >= HTTP_BAD_REQUEST) {
      const error = parseErrorResponse(responseBody, response.status);

      return {
        success: false,
        statusCode: response.status,
        error,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      data: responseBody as T,
    };
  } catch (error) {
    // network or other errors
    const message =
      error instanceof Error ? error.message : 'Unknown network error';

    return {
      success: false,
      statusCode: HTTP_INTERNAL_SERVER_ERROR,
      error: new ForwarderError({
        message: `Failed to forward request: ${message}`,
        statusCode: HTTP_INTERNAL_SERVER_ERROR,
        errorCode: 'server_error',
        errorDescription:
          'Failed to communicate with external authorization server',
        upstreamError: false,
      }),
    };
  }
}

/**
 * creates a token request forwarder with pre-configured proxy credentials.
 * @param tokenEndpoint external AS token endpoint URL
 * @param proxyClientId proxy client ID
 * @param proxyClientSecret proxy client secret
 * @returns function to forward token requests
 */
export function createTokenForwarder(
  tokenEndpoint: string,
  proxyClientId: string,
  proxyClientSecret: string,
): <T>(
  params: Record<string, string | undefined>,
) => Promise<ForwardResult<T>> {
  const authHeader = createBasicAuthHeader(proxyClientId, proxyClientSecret);

  return async <T>(
    params: Record<string, string | undefined>,
  ): Promise<ForwardResult<T>> => {
    return forwardFormRequest<T>(
      tokenEndpoint,
      { Authorization: authHeader },
      params,
    );
  };
}

/**
 * creates an introspection request forwarder with pre-configured proxy credentials.
 * @param introspectionEndpoint external AS introspection endpoint URL
 * @param proxyClientId proxy client ID
 * @param proxyClientSecret proxy client secret
 * @returns function to forward introspection requests
 */
export function createIntrospectionForwarder(
  introspectionEndpoint: string,
  proxyClientId: string,
  proxyClientSecret: string,
): <T>(token: string, tokenTypeHint?: string) => Promise<ForwardResult<T>> {
  const authHeader = createBasicAuthHeader(proxyClientId, proxyClientSecret);

  return async <T>(
    token: string,
    tokenTypeHint?: string,
  ): Promise<ForwardResult<T>> => {
    return forwardFormRequest<T>(
      introspectionEndpoint,
      { Authorization: authHeader },
      {
        token,
        token_type_hint: tokenTypeHint,
      },
    );
  };
}

/**
 * creates a revocation request forwarder with pre-configured proxy credentials.
 * @param revocationEndpoint external AS revocation endpoint URL
 * @param proxyClientId proxy client ID
 * @param proxyClientSecret proxy client secret
 * @returns function to forward revocation requests
 */
export function createRevocationForwarder(
  revocationEndpoint: string,
  proxyClientId: string,
  proxyClientSecret: string,
): (token: string, tokenTypeHint?: string) => Promise<ForwardResult<void>> {
  const authHeader = createBasicAuthHeader(proxyClientId, proxyClientSecret);

  return async (
    token: string,
    tokenTypeHint?: string,
  ): Promise<ForwardResult<void>> => {
    // revocation always returns success per RFC 7009
    const result = await forwardFormRequest<unknown>(
      revocationEndpoint,
      { Authorization: authHeader },
      {
        token,
        token_type_hint: tokenTypeHint,
      },
    );

    // RFC 7009: revocation endpoint should return 200 even for invalid tokens
    // we treat any 2xx as success
    if (result.statusCode >= HTTP_OK && result.statusCode < HTTP_MAX_SUCCESS) {
      return { success: true, statusCode: result.statusCode };
    }

    return result as ForwardResult<void>;
  };
}
