import { createHash } from 'node:crypto';

import { ServerTransport, start, stop } from '@coremcp/server/transport';
import formbody from '@fastify/formbody';
import fastify from 'fastify';

import {
  DEFAULT_HOST,
  DEFAULT_HTTP_PORT,
  DEFAULT_INTROSPECTION_CACHE_TTL,
} from '#constants/defaults';
import { HTTP_UNAUTHORIZED } from '#constants/http';
import { setupCORS } from '#cors';
import { HTTPError } from '#errors';
import {
  setupLogging,
  setupNotFoundHandler,
  createLoggerConfig,
} from '#logging';
import {
  createExternalAuthMiddleware,
  createProxyAuthMiddleware,
} from '#middleware/index';
import {
  MemoryProxyStorageAdapter,
  validateProxyConfig,
} from '#oauth/proxy/index';
import { registerProxyOAuthRoutes } from '#oauth/proxy/route-register';
import { createCachingTokenIntrospector } from '#oauth/resource-server/introspection';
import { registerWellKnownRoutes } from '#oauth/routes/well-known';
import { registerManagementRoutes } from '#routes/management';
import { registerMcpRoutes } from '#routes/mcp';
import { registerUtilityRoutes } from '#routes/utility';
import { extractBearerToken, lastHeader } from '#request-context';

import type { McpServer, ServerTransportOptions } from '@coremcp/server';
import type { FastifyInstance } from 'fastify';

import type { AuthOptions, ExternalAuthOptions } from '#oauth/types';
import type { ResolveUserId } from '#types';

/**
 * configuration options for HTTP transport server with OAuth support
 * @example
 * ```typescript
 * // no OAuth - unprotected endpoints
 * const transport = new HTTPTransport({
 *   mcpServer
 * });
 *
 * // with external OAuth AS
 * const transport = new HTTPTransport({
 *   mcpServer,
 *   auth: {
 *     mode: 'external',
 *     config: {
 *       issuer: 'https://auth.example.com',
 *       clientCredentials: { clientId: 'mcp-server', clientSecret: 'secret' }
 *     },
 *     requiredScopes: ['mcp:read', 'mcp:write']
 *   }
 * });
 *
 * // with OAuth proxy mode
 * const transport = new HTTPTransport({
 *   mcpServer,
 *   auth: {
 *     mode: 'proxy',
 *     config: {
 *       issuer: 'https://auth.example.com',
 *       proxyCredentials: { clientId: 'proxy', clientSecret: 'secret', redirectUri: '...' },
 *       stateJwt: { secret: '...' }
 *     },
 *     requiredScopes: ['mcp:read', 'mcp:write']
 *   }
 * });
 * ```
 */
export interface HTTPTransportOptions extends ServerTransportOptions {
  /** port number for the HTTP server (default: 80) */
  port?: number;

  /** host address for the HTTP server (default: '0.0.0.0') */
  host?: string;

  /** base url of the server (default: dynamically extracted from the incoming request) */
  baseUrl?: string;

  /**
   * OAuth configuration for securing MCP endpoints
   *
   * when provided, enables OAuth 2.0 protection for MCP endpoints.
   * supports external authorization servers, proxy mode, or anonymous access.
   */
  auth?: AuthOptions;

  /**
   * management token for securing administrative endpoints
   * required for POST /management/cleanup endpoint. if not provided,
   * falls back to COREMCP_MANAGEMENT_TOKEN environment variable.
   * @example
   * ```typescript
   * managementToken: 'secure-token-12345'
   * ```
   */
  managementToken?: string;
}

/**
 * streamable HTTP transport implementing MCP protocol over HTTP using fastify server
 * supports JSON-only responses without SSE streaming capabilities
 * @see MCP 2025-06-18 specification
 */
export class HTTPTransport extends ServerTransport {
  #fastify: FastifyInstance;
  #server: McpServer;
  #started = false;
  #options: HTTPTransportOptions;

  /**
   * creates new streamable HTTP transport with fastify server and OAuth support
   * @param options configuration options for the HTTP transport
   */
  constructor(options: HTTPTransportOptions) {
    super(options);
    this.#options = options;
    this.#server = options.mcpServer;

    this.#fastify = fastify({
      logger: createLoggerConfig(this.log),
    });

    this.#setupServer();
  }

  /**
   * gets the mcp server instance
   * @returns the mcp server
   */
  public get server(): McpServer {
    return this.#server;
  }

  /**
   * gets the number of currently active MCP sessions
   * @returns count of active sessions
   * @example
   * ```typescript
   * const count = transport.getActiveSessionCount();
   * console.log(`Active sessions: ${count}`);
   * ```
   */
  public getActiveSessionCount(): number {
    return this.#server.status.totalSessions;
  }

  /**
   * starts the HTTP server and begins listening for connections
   * @throws {Error} when server is already started or fails to bind to port
   */
  public async [start](): Promise<void> {
    if (this.#started) {
      throw new Error(
        'HTTP server already started. Call stop() before starting again.',
      );
    }

    const port = this.#options.port ?? DEFAULT_HTTP_PORT;
    const host = this.#options.host ?? DEFAULT_HOST;

    try {
      await this.#fastify.listen({ port, host });
      this.#started = true;
    } catch (error) {
      throw new Error(
        `Failed to start HTTP server on ${host}:${port}: ${
          error instanceof Error ? error.message : 'Unknown server start error'
        }. Check if port is available and host is valid.`,
      );
    }

    const hasProxyMode = this.#options.auth?.mode === 'proxy';

    this.log?.('info', 'MCP Streamable HTTP server started', {
      host,
      port,
      endpoints: {
        mcp: `http://${host}:${port}/mcp`,
        health: `http://${host}:${port}/health`,
        protectedResource: `http://${host}:${port}/.well-known/oauth-protected-resource`,
        oauthMetadata: hasProxyMode
          ? `http://${host}:${port}/.well-known/oauth-authorization-server`
          : undefined,
      },
    });
  }

  /**
   * stops the server and cleans up all resources
   * @throws {Error} when server shutdown fails
   */
  public async [stop](): Promise<void> {
    if (this.#started) {
      try {
        await this.#fastify.close();
        this.#started = false;
        this.log?.('info', 'MCP Streamable HTTP server stopped');
      } catch (error) {
        throw new Error(
          `Failed to stop HTTP server: ${
            error instanceof Error ? error.message : 'Unknown shutdown error'
          }`,
        );
      }
    }
  }

  /**
   * creates standardized HTTP 401 unauthorized error
   * @returns HTTPError with 401 status and WWW-Authenticate header
   */
  #createUnauthorizedError(): HTTPError {
    return new HTTPError({
      code: HTTP_UNAUTHORIZED,
      headers: { 'www-authenticate': 'Bearer' },
    });
  }

  /**
   * sets up external OAuth authorization server with cached token introspection
   * @param auth external OAuth AS configuration
   * @returns resolveUserId function for extracting user ID from requests
   */
  #setupExternalAuth(auth: ExternalAuthOptions): ResolveUserId {
    // register well-known routes for resource server discovery
    this.#fastify.register(registerWellKnownRoutes(auth));

    // create caching token introspector for external AS
    const introspect = createCachingTokenIntrospector(auth.config, {
      ttl: auth.introspectionCacheTTL ?? DEFAULT_INTROSPECTION_CACHE_TTL,
    });

    // register OAuth middleware for external AS (validates token expiry and scopes)
    const requiredScopes = auth.requiredScopes ?? ['mcp'];
    this.#fastify.addHook(
      'preHandler',
      createExternalAuthMiddleware(requiredScopes, introspect),
    );

    // create user ID resolver using external token introspection with caching
    return async (request) => {
      const token = extractBearerToken(
        lastHeader(request.headers, 'authorization'),
      );

      if (!token) {
        throw this.#createUnauthorizedError();
      }

      const tokenInfo = await introspect(token);

      if (!tokenInfo.active) {
        throw this.#createUnauthorizedError();
      }

      const userId = tokenInfo.sub;

      if (!userId) {
        throw this.#createUnauthorizedError();
      }

      return userId;
    };
  }

  /**
   * sets up OAuth proxy mode for external AS without dynamic client registration
   * handles client registration locally while proxying OAuth flows to external AS
   * @returns resolveUserId function for extracting user ID from requests
   */
  #setupProxyAuth(): ResolveUserId {
    const auth = this.#options.auth;
    if (auth?.mode !== 'proxy') {
      throw new Error('Invalid auth mode for proxy setup');
    }

    const { config } = auth;

    // create storage adapter for proxy client and token mappings
    const storage = new MemoryProxyStorageAdapter();

    // build proxy config from ProxyAuthServerConfig
    const proxyConfig = {
      externalAS: {
        issuer: config.issuer,
        authorizationEndpoint: config.endpoints?.authorization,
        tokenEndpoint: config.endpoints?.token,
        introspectionEndpoint: config.endpoints?.introspection,
        revocationEndpoint: config.endpoints?.revocation,
      },
      proxyClient: {
        clientId: config.proxyCredentials.clientId,
        clientSecret: config.proxyCredentials.clientSecret,
        redirectUri: config.proxyCredentials.redirectUri,
      },
      storage,
      stateSecret: config.stateJwt.secret,
      stateExpirySeconds: config.stateJwt.expirySeconds,
      allowedScopes: config.proxyCredentials.allowedScopes,
    };

    // validate proxy configuration
    validateProxyConfig(proxyConfig);

    // register proxy OAuth routes
    void this.#fastify.register(async (instance) => {
      const baseUrl =
        this.#options.baseUrl ??
        `http://${this.#options.host ?? DEFAULT_HOST}:${
          this.#options.port ?? DEFAULT_HTTP_PORT
        }`;

      await registerProxyOAuthRoutes(instance, {
        config: proxyConfig,
        storage,
        baseUrl,
      });
    });

    // add middleware to validate tokens via proxy introspection for MCP routes
    const requiredScopes = auth.requiredScopes ?? ['mcp'];
    this.#fastify.addHook(
      'preHandler',
      createProxyAuthMiddleware(storage, requiredScopes),
    );

    // create user ID resolver using local token mapping
    return async (request) => {
      const token = extractBearerToken(
        lastHeader(request.headers, 'authorization'),
      );

      if (!token) {
        throw this.#createUnauthorizedError();
      }

      // lookup token mapping
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const mapping = await storage.findTokenMapping(tokenHash);

      if (!mapping) {
        throw this.#createUnauthorizedError();
      }

      // return the client ID as the user identifier
      return mapping.clientId;
    };
  }

  /**
   * sets up anonymous access without authentication
   * @returns resolveUserId function that always returns undefined
   */
  #setupAnonymousAuth(): ResolveUserId {
    return async () => undefined;
  }

  /** sets up fastify server with all routes and middleware */
  #setupServer(): void {
    // register form parser for OAuth endpoints
    this.#fastify.register(formbody);

    // setup middleware
    setupLogging(this.#fastify);

    // setup CORS
    setupCORS(this.#fastify);

    // setup routes
    this.#fastify.register(registerUtilityRoutes());

    // setup management routes if token configured
    if (this.#options.managementToken || process.env.COREMCP_MANAGEMENT_TOKEN) {
      this.#fastify.register(
        registerManagementRoutes(
          this.#server,
          this.#options.managementToken,
          this.log,
        ),
      );
    }

    // setup MCP routes with appropriate auth mode
    let resolveUserId: ResolveUserId;

    switch (this.#options.auth?.mode) {
      case 'proxy':
        resolveUserId = this.#setupProxyAuth();
        break;

      case 'external':
        resolveUserId = this.#setupExternalAuth(this.#options.auth);
        break;

      case 'anonymous':
      default:
        resolveUserId = this.#setupAnonymousAuth();
        break;
    }

    // register MCP routes with the configured auth resolver
    this.#fastify.register(registerMcpRoutes(this.#server, resolveUserId));

    // setup error handling
    setupNotFoundHandler(this.#fastify);
  }
}
