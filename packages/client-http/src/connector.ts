/* eslint-disable max-lines, jsdoc/require-param-description, jsdoc/require-returns */
/**
 * @file HTTP MCP connector with OAuth authentication and Server-Sent Events
 *
 * provides complete HTTP transport implementation for Model Context Protocol communication
 * with OAuth 2.0 authentication flows, Server-Sent Events for bi-directional messaging,
 * automatic reconnection, and comprehensive error handling
 *
 * Note: File exceeds 300 lines due to comprehensive OAuth 2.1 integration with proper
 * error handling, token refresh management, and SSE connection handling.
 */

import { McpConnector } from '@coremcp/client';
import {
  connect,
  disconnect,
  initializeRequest,
  onMessage,
  send,
} from '@coremcp/client/connector';

import {
  HTTP_STATUS_METHOD_NOT_ALLOWED,
  HTTP_STATUS_UNAUTHORIZED,
} from '#constants/http';
import { ExternalError } from '#errors';
import {
  exchangeCodeForTokens,
  handleAuthorizationChallenge,
  refreshAccessToken,
} from '#oauth';
import { terminateSession } from '#session-termination';

import { handleStream } from '#sse';

import type { McpConnectorParams } from '@coremcp/client/connector';
import type { JsonifibleValue, JsonRpcMessage } from '@coremcp/protocol';

import type {
  AuthorizationServerMetadata,
  OAuthClientConfig,
  TokenStore,
  TokenRefreshManager,
} from '#oauth';

/** callback function for handling OAuth authorization flow with generated authorization URL */
export type OnAuth = (url: string) => Promise<void>;

/** configuration parameters for HTTP MCP connector with OAuth support */
export interface HttpMcpConnectorParams extends McpConnectorParams {
  // identity //
  /** human-readable identifier for server connection used in logging and debugging */
  name: string;

  /** base URL for MCP server HTTP endpoint supporting both POST and GET methods */
  url: string;

  /** OAuth client configuration for authorization flow with PKCE support */
  oauth: {
    // callbacks //
    /** callback function to handle OAuth authorization flow when challenged by server */
    onAuth: OnAuth;

    /** token store for managing OAuth tokens across multiple issuers */
    tokenStore: TokenStore;
  } & OAuthClientConfig;

  /** custom fetch implementation for HTTP requests (defaults to global fetch) */
  fetch?: typeof globalThis.fetch;

  /** HTTP headers to include with all requests to the MCP server */
  headers?: Record<string, string | undefined>;
}

/**
 * HTTP transport implementation for MCP communication over JSON-RPC with Server-Sent Events
 *
 * establishes bi-directional communication using:
 * - outgoing messages: HTTP POST requests to MCP endpoint
 * - incoming messages: Server-Sent Events from MCP events endpoint
 *
 * supports OAuth authentication, custom fetch implementations,
 * and automatic connection management with proper error handling
 * @example
 * ```typescript
 * const connector = new HttpMcpConnector({
 *   name: 'my-server',
 *   url: 'https://api.example.com/mcp',
 *   onMessage: (msg) => processMessage(msg),
 *   onAuth: async (url) => openBrowser(url),
 *   oauth: {
 *     clientId: 'my-client',
 *     redirectUri: 'https://myapp.com/callback'
 *   }
 * });
 *
 * await connector.connect();
 * ```
 */
export class HttpMcpConnector extends McpConnector {
  /** Base URL for the MCP server endpoint */
  #url: string;
  /** Optional custom fetch implementation */
  #fetch: typeof globalThis.fetch;
  /** HTTP headers to include with requests */
  #headers: Record<string, string | undefined>;
  /** Callback for OAuth authorization flow */
  #onAuth: OnAuth;
  /** OAuth configuration for authorization flow */
  #oauth?: OAuthClientConfig & { tokenStore: TokenStore };
  /** Current OAuth issuer for token operations */
  #issuer?: string;
  /** Authorization server metadata for token operations */
  #authServerMetadata?: AuthorizationServerMetadata;
  /** PKCE code verifier for token exchange (stored during authorization) */
  #codeVerifier?: string;
  /** OAuth token manager for token lifecycle operations */
  #tokenManager?: TokenRefreshManager;
  /** Abort controller for managing SSE stream lifecycle */
  #abortController?: AbortController;
  /** MCP session ID assigned by server during initialization */
  #sessionId?: string;

  /**
   * creates new HTTP MCP connector instance
   * @param params configuration parameters for HTTP transport
   */
  constructor(params: HttpMcpConnectorParams) {
    super({
      ...params,
      onConnect: () => {
        // connect to the SSE stream after initialization
        void this.#onInitialized();

        params.onConnect?.();
      },
    });

    this.#url = params.url;
    this.#fetch = params.fetch ?? fetch;
    this.#headers = { ...params.headers };
    this.#onAuth = params.oauth.onAuth;
    this.#oauth = {
      clientId: params.oauth.clientId,
      redirectUri: params.oauth.redirectUri,
      additionalScopes: params.oauth.additionalScopes,
      tokenStore: params.oauth.tokenStore,
    };
  }

  /**
   * submits authorization code to exchange for access tokens
   * @param code authorization code from OAuth callback
   * @param callbackUri redirect URI from OAuth callback
   * @returns access and refresh tokens
   * @throws {ExternalError} when metadata, code verifier, or OAuth config missing
   */
  public async submitAuthCode(
    code: string,
    callbackUri: string,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    if (!this.#authServerMetadata) {
      throw new ExternalError(
        'Cannot exchange code: authorization server metadata not available. Must receive OAuth challenge first.',
      );
    }

    if (!this.#codeVerifier) {
      throw new ExternalError(
        'Cannot exchange code: code verifier not found. Must complete authorization flow first.',
      );
    }

    if (!this.#oauth) {
      throw new ExternalError(
        'Cannot exchange code: OAuth configuration missing',
      );
    }

    if (!this.#oauth.clientId) {
      throw new ExternalError(
        'Cannot exchange code: OAuth client ID not configured',
      );
    }

    // Store references for use in closure (helps TypeScript type narrowing)
    const authServerMetadata = this.#authServerMetadata;
    const clientId = this.#oauth.clientId;

    // Exchange authorization code for tokens using flow coordinator
    const result = await exchangeCodeForTokens(
      authServerMetadata,
      clientId,
      callbackUri,
      code,
      this.#codeVerifier,
      async () =>
        refreshAccessToken(
          authServerMetadata,
          clientId,
          result.refreshToken ?? '',
        ),
    );

    // Store token manager for automatic refresh
    this.#tokenManager = result.tokenManager;

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /** initializes session and connects to SSE channel */
  protected async [connect](): Promise<void> {
    // create abort controller for managing all streams in this connection
    this.#abortController = new AbortController();

    // POST the initialize message to the server
    await this[send](this[initializeRequest]);
  }

  /**
   * closes HTTP transport, sends session termination, and cleans up SSE resources
   */
  protected async [disconnect](): Promise<void> {
    // send session termination notification if we have an active session
    // per REQUIREMENTS.md:21 (SHOULD requirement for graceful cleanup)
    if (this.#sessionId) {
      await terminateSession({
        sessionId: this.#sessionId,
        serverUrl: this.#url,
        reason: 'graceful',
        sendNotification: true,
        fetch: this.#fetch,
      });
    }

    // abort SSE stream if active
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = undefined;
    }

    // clear session ID after termination
    this.#sessionId = undefined;
  }

  /**
   * sends JSON-RPC message via HTTP POST
   * @param message message to send
   */
  protected async [send](message: JsonRpcMessage): Promise<void> {
    const response = await this.#makeHttpRequest(message);

    if (!response.ok) {
      await this.#handleHttpError(response);

      return;
    }

    await this.#processHttpResponse(response);
  }

  /**
   * builds HTTP headers with authentication and MCP protocol headers
   * @param token
   */
  #buildRequestHeaders(token?: string): Record<string, string> {
    return {
      'Accept': 'text/event-stream, application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Include MCP-Protocol-Version header after initialization per REQUIREMENTS.md:16
      ...(this.info.protocolVersion
        ? { 'MCP-Protocol-Version': this.info.protocolVersion }
        : {}),
      // Include MCP-Session-ID header if assigned by server per REQUIREMENTS.md:17
      ...(this.#sessionId ? { 'Mcp-Session-Id': this.#sessionId } : {}),
      ...this.#headers,
    };
  }

  /**
   * handles 401 by refreshing token and retrying request
   * @param message
   */
  async #handle401Response(message: JsonRpcMessage): Promise<Response | null> {
    if (!this.#tokenManager) {
      return null;
    }

    this.info.log?.(
      'debug',
      'Received 401 response, attempting token refresh',
      {
        issuer: this.#issuer,
      },
    );

    try {
      // TokenRefreshManager.getValidToken() automatically refreshes if needed
      const newToken = await this.#tokenManager.getValidToken();

      this.info.log?.('info', 'Token refreshed, retrying request', {
        issuer: this.#issuer,
      });

      return await this.#fetch(this.#url, {
        method: 'POST',
        headers: this.#buildRequestHeaders(newToken),
        body: JSON.stringify(message),
      });
    } catch (error) {
      this.info.log?.('error', 'Token refresh failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  /**
   * makes HTTP POST request with proper headers and handles 401 responses
   * @param message
   */
  async #makeHttpRequest(message: JsonRpcMessage): Promise<Response> {
    const token = this.#tokenManager
      ? await this.#tokenManager.getValidToken()
      : null;
    const response = await this.#fetch(this.#url, {
      method: 'POST',
      headers: this.#buildRequestHeaders(token ?? undefined),
      body: JSON.stringify(message),
    });

    // handle 401 responses by attempting token refresh once and retrying
    if (response.status === HTTP_STATUS_UNAUTHORIZED) {
      const retryResponse = await this.#handle401Response(message);
      if (retryResponse) {
        return retryResponse;
      }
    }

    return response;
  }

  /**
   * handles HTTP errors including OAuth authentication challenges
   * @param response
   */
  async #handleHttpError(response: Response): Promise<void> {
    const authHeader = response.headers.get('WWW-Authenticate');

    if (authHeader) {
      await this.#handleOAuthChallenge(authHeader);

      return;
    }

    // handle non-authentication HTTP errors
    const body = await this.#getErrorBody(response);

    this.info.log?.('error', 'HTTP request failed', {
      status: response.status,
      message: response.statusText,
      body,
    });
  }

  /**
   * extracts error body from response based on content type
   * @param response
   */
  async #getErrorBody(response: Response): Promise<JsonifibleValue> {
    const contentType = response.headers.get('Content-Type');

    if (contentType?.includes('application/json')) {
      return (await response.json()) as JsonifibleValue;
    }

    return response.text();
  }

  /**
   * processes successful response based on content type (JSON or SSE)
   * @param response
   */
  async #processHttpResponse(response: Response): Promise<void> {
    // extract session ID from response header if present (provided during initialization)
    // per REQUIREMENTS.md:17, server MAY assign session ID via Mcp-Session-Id header
    const sessionIdHeader = response.headers.get('Mcp-Session-Id');
    if (sessionIdHeader && !this.#sessionId) {
      this.#sessionId = sessionIdHeader;
      this.info.log?.('info', 'Session ID assigned by server', {
        sessionId: this.#sessionId,
      });
    }

    const contentType = response.headers.get('Content-Type');

    if (contentType?.includes('application/json')) {
      // handle the message via the connector super class
      await this[onMessage]((await response.json()) as JsonRpcMessage);
    } else if (contentType?.includes('text/event-stream')) {
      void handleStream({
        getStream: async ({ attempt, lastEventId }) =>
          attempt ? this.connectToStream(lastEventId) : response.body!,
        onMessage: this[onMessage].bind(this),
        abortSignal: this.#abortController?.signal,
      });
    }
  }

  /**
   * establishes SSE connection for receiving messages
   * @param lastEventId
   */
  private async connectToStream(
    lastEventId?: string,
  ): Promise<ReadableStream | null> {
    const response = await this.#fetch(this.#url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        // Include MCP-Protocol-Version header after initialization per REQUIREMENTS.md:16
        ...(this.info.protocolVersion
          ? { 'MCP-Protocol-Version': this.info.protocolVersion }
          : {}),
        // Include MCP-Session-ID header if assigned by server per REQUIREMENTS.md:17
        ...(this.#sessionId ? { 'Mcp-Session-Id': this.#sessionId } : {}),
        ...this.#headers,
        ...(lastEventId ? { 'Last-Event-Id': lastEventId } : {}),
      },
    });

    if (response.ok) {
      return response.body;
    }

    const authHeader = response.headers.get('WWW-Authenticate');
    if (authHeader) {
      void this.#handleOAuthChallenge(authHeader);
    } else if (response.status === HTTP_STATUS_METHOD_NOT_ALLOWED) {
      // server doesn't support GET for streaming
      this.info.log?.(
        'warn',
        'Server does not support GET method for streaming',
        {
          status: response.status,
        },
      );
    } else {
      // other HTTP errors
      this.info.log?.('error', 'Stream connection failed', {
        status: response.status,
        message: response.statusText,
        body: response.headers.get('Content-Type')?.includes('application/json')
          ? ((await response.json()) as JsonifibleValue)
          : await response.text(),
      });
    }

    return null;
  }

  /**
   * handles OAuth authentication challenge from server by generating authorization URL
   * @param authHeader the WWW-Authenticate header value from server response
   * @throws {ExternalError} when OAuth configuration missing or metadata discovery fails
   */
  async #handleOAuthChallenge(authHeader: string): Promise<void> {
    if (!this.#oauth) {
      this.info.log?.(
        'error',
        'OAuth challenge received but no OAuth configuration provided',
        { authHeader },
      );
      throw new ExternalError(
        'OAuth authentication required but no OAuth configuration provided',
      );
    }
    if (!this.#oauth.clientId) {
      throw new ExternalError(
        'OAuth client ID not configured for authorization flow',
      );
    }

    try {
      // Use flow coordinator to handle authorization challenge
      const result = await handleAuthorizationChallenge(authHeader, {
        clientId: this.#oauth.clientId,
        redirectUri: this.#oauth.redirectUri,
        additionalScopes: this.#oauth.additionalScopes,
      });

      // Store flow state for token exchange
      this.#issuer = result.issuer;
      this.#authServerMetadata = result.authServerMetadata;
      this.#codeVerifier = result.codeVerifier;

      this.info.log?.(
        'debug',
        'Discovered OAuth configuration from challenge',
        {
          issuer: this.#issuer,
          scopes: result.resourceMetadata.scopes_supported,
        },
      );

      // Trigger user authorization
      await this.#onAuth(result.authorizationUrl);
    } catch (error) {
      this.info.log?.('error', 'Failed to handle OAuth challenge', {
        error: error instanceof Error ? error.message : String(error),
        authHeader,
      });
      throw error;
    }
  }

  /**
   * sets up event stream after connection established
   */
  async #onInitialized(): Promise<void> {
    // establish event stream for server messages
    void handleStream({
      getStream: async () => this.connectToStream(),
      onMessage: this[onMessage].bind(this),
      abortSignal: this.#abortController?.signal,
    });
  }
}
/* eslint-enable max-lines, jsdoc/require-param-description, jsdoc/require-returns */
