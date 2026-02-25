import { MockAgent, setGlobalDispatcher } from 'undici';
import { describe, expect, it, vi } from 'vitest';

import { HttpMcpConnector } from '#connector';

import type { Log } from '@coremcp/core';
import type { MockInterceptor } from 'undici/types/mock-interceptor';
import type { Mock } from 'vitest';

import type { HttpMcpConnectorParams } from '#connector';

/** hoisted mock for SSE stream handling */
const handleStream = vi.hoisted(() => vi.fn(async () => undefined));

/** hoisted mocks for OAuth adapter functions */
const mockDiscoverFromChallenge = vi.hoisted(() =>
  vi.fn(async (authHeader: string) => {
    // If the auth header doesn't contain resource_metadata, throw error
    if (!authHeader.includes('resource_metadata')) {
      throw new Error(
        'WWW-Authenticate header missing resource_metadata parameter',
      );
    }

    return {
      authServerMetadata: {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
        token_endpoint: 'https://auth.example.com/oauth/token',
        scopes_supported: ['mcp'],
      },
      resourceMetadata: {
        resource: 'https://mcp.example.com',
        authorization_servers: ['https://auth.example.com'],
        scopes_supported: ['mcp', 'files:read'],
      },
    };
  }),
);

const mockCreateAuthorizationUrl = vi.hoisted(() =>
  vi.fn(async () => ({
    authorizationUrl: 'https://auth.example.com/oauth/authorize?client_id=test',
    codeVerifier: 'test-code-verifier',
  })),
);

const mockExchangeAuthorizationCode = vi.hoisted(() =>
  vi.fn(async () => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
  })),
);

const mockRefreshAccessToken = vi.hoisted(() =>
  vi.fn(async () => ({
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    token_type: 'Bearer',
    expires_in: 3600,
  })),
);

vi.mock('#sse', () => ({
  handleStream,
}));

vi.mock('#oauth/openid-client-adapter', () => ({
  discoverFromChallenge: mockDiscoverFromChallenge,
  createAuthorizationUrl: mockCreateAuthorizationUrl,
  exchangeAuthorizationCode: mockExchangeAuthorizationCode,
  refreshAccessToken: mockRefreshAccessToken,
}));

/** mock agent for intercepting HTTP requests */
const mockAgent = new MockAgent();

setGlobalDispatcher(mockAgent);
mockAgent.disableNetConnect();

/** default test URL for MCP connections */
const DEFAULT_URL = 'https://mcp.example.com';

/** default initialization result for successful connections */
const DEFAULT_INIT_RESULT = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  serverInfo: { name: 'test-server', version: '1.0.0' },
};

/**
 * extracts pathname from URL with fallback to root path
 * @param url source URL to extract path from
 * @returns pathname string or root path as fallback
 */
const extractUrlPath = (url: string): string => {
  const { pathname } = new URL(url);

  return pathname || '/';
};

/**
 * converts various header formats to plain object for consistent access
 * @param headers headers in various formats to normalize
 * @returns normalized Headers instance from plain object
 */
const normalizeHeaders = (
  headers?:
    | Record<string, string>
    | { entries(): IterableIterator<[string, string]> },
): Headers => {
  if (!headers) {
    return new Headers();
  }

  // handle undici Headers or any Headers-like object with entries()
  if ('entries' in headers && typeof headers.entries === 'function') {
    return new Headers(Object.fromEntries(headers.entries()));
  }

  return new Headers(headers as Record<string, string>);
};

/**
 * converts various body types to string representation
 * @param body request body to convert to string
 * @returns string representation of the request body
 */
const convertBodyToText = (body: unknown): string => {
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf8');
  }

  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }

  if (body === null || body === undefined) {
    return '';
  }

  if (typeof body === 'object') {
    try {
      return JSON.stringify(body);
    } catch {
      return '[object Object]';
    }
  }

  if (typeof body === 'number' || typeof body === 'boolean') {
    return body.toString();
  }

  return '';
};

/**
 * parses JSON from request body with type safety
 * @param body raw body content to parse as JSON
 * @returns parsed JSON object of unknown type
 */
const parseJsonBody = (body: unknown): unknown =>
  JSON.parse(convertBodyToText(body));

/**
 * creates predicate to check if request body contains specific JSON-RPC method
 * @param method JSON-RPC method name to match
 * @returns function that checks if body contains the specified method
 */
const createJsonRpcMethodMatcher =
  (method: string) =>
  (body: unknown): boolean => {
    try {
      const parsed = parseJsonBody(body) as { method?: string };

      return parsed.method === method;
    } catch {
      return false;
    }
  };

/**
 * intercepts HTTP requests for testing with automatic cleanup tracking
 * @param url target URL to intercept
 * @param options mock interceptor configuration options
 * @returns configured MockInterceptor instance
 */
const interceptRequest = (
  url: string,
  options: MockInterceptor.Options,
): MockInterceptor => {
  const endpoint = new URL(url);

  return mockAgent.get(endpoint.origin).intercept({
    ...options,
    path: options.path || extractUrlPath(url),
  });
};

/**
 * sets up successful HTTP MCP initialization sequence
 * @param url target endpoint URL
 * @param result initialization result to return
 * @param onRequest optional callback for request inspection
 */
const setupInitializationSuccess = (
  url: string,
  result = DEFAULT_INIT_RESULT,
  onRequest?: (opts: MockInterceptor.MockResponseCallbackOptions) => void,
): void => {
  interceptRequest(url, {
    method: 'POST',
    path: extractUrlPath(url),
    body: createJsonRpcMethodMatcher('initialize'),
  }).reply((opts) => {
    onRequest?.(opts);

    const payload = parseJsonBody(opts.body) as { id?: number };

    return {
      statusCode: 200,
      data: {
        jsonrpc: '2.0',
        id: typeof payload.id === 'number' ? payload.id : 0,
        result,
      },
      responseOptions: {
        headers: {
          'content-type': 'application/json',
        },
      },
    };
  });

  interceptRequest(url, {
    method: 'POST',
    path: extractUrlPath(url),
    body: createJsonRpcMethodMatcher('notifications/initialized'),
  }).reply(() => ({
    statusCode: 204,
  }));
};

/**
 * creates HTTP transport instance with test configuration
 * @param params optional connector parameters to override defaults
 * @returns transport instance with mock dependencies
 */
const createHttpTransport = (
  params?: Partial<HttpMcpConnectorParams>,
): {
  transport: HttpMcpConnector;
  mockLog: Mock<Log>;
  url: string;
} => {
  const url = params?.url ?? DEFAULT_URL;
  const mockLog = (params?.log ?? vi.fn<Log>()) as Mock<Log>;

  const transport = new HttpMcpConnector({
    name: params?.name ?? 'test-server',
    url,
    oauth: params?.oauth ?? {
      onAuth: vi.fn(),
      redirectUri: 'https://myapp.com/callback',
      tokenStore: mockTokenStore,
      clientId: 'test-client-id',
    },
    log: mockLog,
    clientInfo: params?.clientInfo ?? { name: 'test-client', version: '1.0.0' },
    capabilities: params?.capabilities ?? {},
    ...params,
  });

  return {
    transport,
    mockLog,
    url,
  };
};

/**
 * creates and connects HTTP transport instance for testing
 * @param params optional connector parameters to override defaults
 * @param result initialization result to return
 * @returns connected transport instance with mock dependencies
 */
const createConnectedTransport = async (
  params?: Partial<HttpMcpConnectorParams>,
  result = DEFAULT_INIT_RESULT,
): Promise<{
  transport: HttpMcpConnector;
  mockLog: Mock<Log>;
  url: string;
}> => {
  const context = createHttpTransport(params);

  setupInitializationSuccess(context.url, result);

  await context.transport.connect();

  await new Promise((resolve) => setTimeout(resolve, 10));

  return context;
};

/** mock token store for testing */
const mockTokenStore = {
  getAccessToken: vi.fn(async () => null),
  getRefreshToken: vi.fn(async () => null),
  setTokens: vi.fn(async () => {}),
  getTokenExpiration: vi.fn(async () => null),
  clearTokens: vi.fn(async () => {}),
};

/**
 * creates mock HttpMcpConnectorParams with required fields
 * @param overrides optional parameter overrides
 * @returns complete HttpMcpConnectorParams object
 */
const createMockConnectorParams = (
  overrides?: Partial<HttpMcpConnectorParams>,
): HttpMcpConnectorParams => ({
  name: 'test-server',
  url: 'https://api.example.com/mcp',
  oauth: {
    onAuth: vi.fn(),
    redirectUri: 'https://myapp.com/callback',
    tokenStore: mockTokenStore,
    clientId: 'test-client-id',
  },
  clientInfo: {
    name: 'test-client',
    version: '1.0.0',
  },
  capabilities: {},
  ...overrides,
});

describe('cl:HttpMcpConnector', () => {
  describe('constructor', () => {
    it('should create instance with required parameters', () => {
      const params = createMockConnectorParams();

      const connector = new HttpMcpConnector(params);

      expect(connector).toBeInstanceOf(HttpMcpConnector);
    });

    it('should create instance with custom fetch and headers', () => {
      const fetch = vi.fn();
      const params = createMockConnectorParams({
        fetch,
        headers: {
          'Authorization': 'Bearer token123',
          'X-API-Key': 'key456',
        },
      });

      const connector = new HttpMcpConnector(params);

      // Custom headers are set during construction and used in fetch calls
      expect(connector).toBeInstanceOf(HttpMcpConnector);
    });

    it('should handle optional parameters with minimal configuration', () => {
      const params = createMockConnectorParams({
        name: 'minimal-server',
        url: 'https://mcp.example.com',
      });

      const connector = new HttpMcpConnector(params);

      expect(connector).toBeInstanceOf(HttpMcpConnector);
    });
  });

  describe('fn:connect', () => {
    it('should send HTTP POST to /mcp endpoint with proper headers', async () => {
      const { transport, url } = createHttpTransport();
      const expectedResponse = {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'test-server', version: '1.0.0' },
      };

      setupInitializationSuccess(url, expectedResponse, ({ headers, body }) => {
        const requestHeaders = normalizeHeaders(headers);

        expect(requestHeaders.get('content-type')).toBe('application/json');
        expect(requestHeaders.get('accept')).toContain('text/event-stream');
        expect(requestHeaders.get('accept')).toContain('application/json');

        const payload = parseJsonBody(body) as { method?: string };

        expect(payload.method).toBe('initialize');
      });

      await transport.connect();

      expect(transport.info.isConnected).toBe(true);
    });

    it('should establish SSE connection for receiving messages', async () => {
      const { transport, url } = createHttpTransport();

      setupInitializationSuccess(url, {
        protocolVersion: '2025-06-18',
        capabilities: {},
        serverInfo: { name: 'test-server', version: '1.0.0' },
      });

      await transport.connect();

      expect(transport.info.isConnected).toBe(true);
      expect(handleStream).toHaveBeenCalledWith(
        expect.objectContaining({
          getStream: expect.any(Function),
          onMessage: expect.any(Function),
        }),
      );
    });

    it('should detect WWW-Authenticate header and throw authentication error', async () => {
      const { transport, url } = createHttpTransport();

      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
      }).reply(() => ({
        statusCode: 401,
        data: {
          jsonrpc: '2.0',
          id: 0,
          error: { code: -32001, message: 'Authentication required' },
        },
        responseOptions: {
          headers: {
            'content-type': 'application/json',
            'www-authenticate': 'Bearer realm="MCP"',
          },
        },
      }));

      await expect(transport.connect()).rejects.toThrow(
        'WWW-Authenticate header missing resource_metadata parameter',
      );

      expect(transport.info.isConnected).toBe(false);
    }, 1000);

    it('should handle network connectivity errors appropriately', async () => {
      const { transport, url } = createHttpTransport();

      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
      }).replyWithError(new Error('Failed to fetch'));

      await expect(transport.connect()).rejects.toThrow(/fetch failed/i);

      expect(transport.info.isConnected).toBe(false);
    });
  });

  describe('fn:send', () => {
    describe('MCP Protocol Headers', () => {
      it('should not include MCP-Protocol-Version header before initialization', () => {
        const { transport } = createHttpTransport();

        // protocolVersion is null before connection
        expect(transport.info.protocolVersion).toBeNull();
      });

      it('should include MCP-Protocol-Version header after initialization', async () => {
        const { transport, url } = await createConnectedTransport();
        let capturedHeaders: Record<string, string> = {};

        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('tools/list'),
        }).reply((opts) => {
          const requestHeaders = normalizeHeaders(opts.headers);
          capturedHeaders = {
            protocol: requestHeaders.get('mcp-protocol-version') ?? '',
          };

          const payload = parseJsonBody(opts.body) as { id?: number };

          return {
            statusCode: 200,
            data: {
              jsonrpc: '2.0',
              id: typeof payload.id === 'number' ? payload.id : 1,
              result: { tools: [] },
            },
            responseOptions: {
              headers: {
                'content-type': 'application/json',
              },
            },
          };
        });

        await transport.sendRequest({ method: 'tools/list', params: {} });

        expect(capturedHeaders.protocol).toBe('2025-06-18');
        expect(transport.info.protocolVersion).toBe('2025-06-18');
      });

      it('should not include MCP-Session-ID header when server does not assign one', async () => {
        const { transport, url } = await createConnectedTransport();
        let capturedHeaders: Record<string, string | null> = {};

        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('tools/list'),
        }).reply((opts) => {
          const requestHeaders = normalizeHeaders(opts.headers);
          capturedHeaders = {
            sessionId: requestHeaders.get('mcp-session-id'),
          };

          const payload = parseJsonBody(opts.body) as { id?: number };

          return {
            statusCode: 200,
            data: {
              jsonrpc: '2.0',
              id: typeof payload.id === 'number' ? payload.id : 1,
              result: { tools: [] },
            },
            responseOptions: {
              headers: {
                'content-type': 'application/json',
              },
            },
          };
        });

        await transport.sendRequest({ method: 'tools/list', params: {} });

        // Session ID should not be present when server doesn't assign one
        expect(capturedHeaders.sessionId).toBeNull();
      });

      it('should include MCP-Session-ID header when server assigns session ID', async () => {
        const { transport, url } = createHttpTransport();
        const sessionId = 'session-12345';
        let capturedHeaders: Record<string, string> = {};

        // Setup initialization with session ID in response
        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('initialize'),
        }).reply((opts) => {
          const payload = parseJsonBody(opts.body) as { id?: number };

          return {
            statusCode: 200,
            data: {
              jsonrpc: '2.0',
              id: typeof payload.id === 'number' ? payload.id : 0,
              result: DEFAULT_INIT_RESULT,
            },
            responseOptions: {
              headers: {
                'content-type': 'application/json',
                'mcp-session-id': sessionId, // Server assigns session ID
              },
            },
          };
        });

        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('notifications/initialized'),
        }).reply(() => ({
          statusCode: 204,
        }));

        await transport.connect();

        // Now send a request and capture headers
        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('tools/list'),
        }).reply((opts) => {
          const requestHeaders = normalizeHeaders(opts.headers);
          capturedHeaders = {
            sessionId: requestHeaders.get('mcp-session-id') ?? '',
            protocol: requestHeaders.get('mcp-protocol-version') ?? '',
          };

          const payload = parseJsonBody(opts.body) as { id?: number };

          return {
            statusCode: 200,
            data: {
              jsonrpc: '2.0',
              id: typeof payload.id === 'number' ? payload.id : 1,
              result: { tools: [] },
            },
            responseOptions: {
              headers: {
                'content-type': 'application/json',
              },
            },
          };
        });

        await transport.sendRequest({ method: 'tools/list', params: {} });

        expect(capturedHeaders.sessionId).toBe(sessionId);
        expect(capturedHeaders.protocol).toBe('2025-06-18');
      });

      it('should include both headers in all subsequent requests', async () => {
        const { transport, url } = createHttpTransport();
        const sessionId = 'session-67890';
        const requestHeaders: Array<Record<string, string>> = [];

        // Setup initialization with session ID
        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('initialize'),
        }).reply((opts) => {
          const payload = parseJsonBody(opts.body) as { id?: number };

          return {
            statusCode: 200,
            data: {
              jsonrpc: '2.0',
              id: typeof payload.id === 'number' ? payload.id : 0,
              result: DEFAULT_INIT_RESULT,
            },
            responseOptions: {
              headers: {
                'content-type': 'application/json',
                'mcp-session-id': sessionId,
              },
            },
          };
        });

        interceptRequest(url, {
          method: 'POST',
          path: extractUrlPath(url),
          body: createJsonRpcMethodMatcher('notifications/initialized'),
        }).reply(() => ({
          statusCode: 204,
        }));

        await transport.connect();

        // Send multiple requests and capture headers each time
        for (const method of ['tools/list', 'resources/list', 'prompts/list']) {
          interceptRequest(url, {
            method: 'POST',
            path: extractUrlPath(url),
            body: createJsonRpcMethodMatcher(method),
          }).reply((opts) => {
            const headers = normalizeHeaders(opts.headers);
            requestHeaders.push({
              sessionId: headers.get('mcp-session-id') ?? '',
              protocol: headers.get('mcp-protocol-version') ?? '',
            });

            const payload = parseJsonBody(opts.body) as { id?: number };

            return {
              statusCode: 200,
              data: {
                jsonrpc: '2.0',
                id: typeof payload.id === 'number' ? payload.id : 1,
                result: {},
              },
              responseOptions: {
                headers: {
                  'content-type': 'application/json',
                },
              },
            };
          });

          await transport.sendRequest({ method, params: {} });
        }

        // Verify headers present in all requests
        expect(requestHeaders).toHaveLength(3);
        for (const headers of requestHeaders) {
          expect(headers.sessionId).toBe(sessionId);
          expect(headers.protocol).toBe('2025-06-18');
        }
      });
    });

    it('should send JSON-RPC message via HTTP POST', async () => {
      const { transport, url } = await createConnectedTransport();

      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('tools/list'),
      }).reply((opts) => {
        const payload = parseJsonBody(opts.body) as {
          id?: number;
          method?: string;
          params?: unknown;
        };

        expect(payload.method).toBe('tools/list');
        expect(payload.params).toEqual({ _meta: { progressToken: 1 } });

        return {
          statusCode: 200,
          data: {
            jsonrpc: '2.0',
            id: typeof payload.id === 'number' ? payload.id : 1,
            result: { tools: [] },
          },
          responseOptions: {
            headers: {
              'content-type': 'application/json',
            },
          },
        };
      });

      await transport.sendRequest({ method: 'tools/list', params: {} });
    });
  });

  describe('OAuth Flow', () => {
    describe('fn:submitAuthCode', () => {
      it('should reject code exchange when metadata not set', async () => {
        const { transport } = createHttpTransport();

        await expect(
          transport.submitAuthCode('code', 'https://myapp.com/callback'),
        ).rejects.toThrow(
          'Cannot exchange code: authorization server metadata not available. Must receive OAuth challenge first.',
        );
      });
    });
  });

  describe('fn:disconnect', () => {
    it('should close SSE connection and cleanup resources', async () => {
      const { transport } = await createConnectedTransport();

      await transport.disconnect();

      expect(transport.info.isConnected).toBe(false);
    });

    it('should send session termination notification when session ID present', async () => {
      const { transport, url } = createHttpTransport();
      const sessionId = 'session-abc123';
      let terminationReceived = false;

      // Setup initialization with session ID
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('initialize'),
      }).reply((opts) => {
        const payload = parseJsonBody(opts.body) as { id?: number };

        return {
          statusCode: 200,
          data: {
            jsonrpc: '2.0',
            id: typeof payload.id === 'number' ? payload.id : 0,
            result: DEFAULT_INIT_RESULT,
          },
          responseOptions: {
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': sessionId,
            },
          },
        };
      });

      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/initialized'),
      }).reply(() => ({
        statusCode: 204,
      }));

      await transport.connect();

      // Setup termination notification interception
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/session/terminated'),
      }).reply((opts) => {
        const headers = normalizeHeaders(opts.headers);
        const payload = parseJsonBody(opts.body) as {
          params?: { reason?: string; timestamp?: string };
        };

        // Verify termination notification format
        expect(headers.get('mcp-session-id')).toBe(sessionId);
        expect(payload.params?.reason).toBe('graceful');
        expect(payload.params?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        terminationReceived = true;

        return {
          statusCode: 204,
        };
      });

      await transport.disconnect();

      expect(terminationReceived).toBe(true);
      expect(transport.info.isConnected).toBe(false);
    });

    it('should not send termination notification when no session ID', async () => {
      const { transport, url } = await createConnectedTransport();
      let terminationRequested = false;

      // Intercept any termination requests
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/session/terminated'),
      }).reply(() => {
        terminationRequested = true;

        return {
          statusCode: 204,
        };
      });

      await transport.disconnect();

      // No termination notification should be sent when no session ID
      expect(terminationRequested).toBe(false);
      expect(transport.info.isConnected).toBe(false);
    });

    it('should complete disconnection even if termination fails', async () => {
      const { transport, url } = createHttpTransport();
      const sessionId = 'session-xyz789';

      // Setup initialization with session ID
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('initialize'),
      }).reply((opts) => {
        const payload = parseJsonBody(opts.body) as { id?: number };

        return {
          statusCode: 200,
          data: {
            jsonrpc: '2.0',
            id: typeof payload.id === 'number' ? payload.id : 0,
            result: DEFAULT_INIT_RESULT,
          },
          responseOptions: {
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': sessionId,
            },
          },
        };
      });

      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/initialized'),
      }).reply(() => ({
        statusCode: 204,
      }));

      await transport.connect();

      // Setup termination to fail
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/session/terminated'),
      }).replyWithError(new Error('Network timeout'));

      // Disconnect should complete despite termination failure
      await expect(transport.disconnect()).resolves.toBeUndefined();

      expect(transport.info.isConnected).toBe(false);
    });

    it('should complete disconnection even if server returns error', async () => {
      const { transport, url } = createHttpTransport();
      const sessionId = 'session-error-test';

      // Setup initialization with session ID
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('initialize'),
      }).reply((opts) => {
        const payload = parseJsonBody(opts.body) as { id?: number };

        return {
          statusCode: 200,
          data: {
            jsonrpc: '2.0',
            id: typeof payload.id === 'number' ? payload.id : 0,
            result: DEFAULT_INIT_RESULT,
          },
          responseOptions: {
            headers: {
              'content-type': 'application/json',
              'mcp-session-id': sessionId,
            },
          },
        };
      });

      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/initialized'),
      }).reply(() => ({
        statusCode: 204,
      }));

      await transport.connect();

      // Setup termination to return 500 error
      interceptRequest(url, {
        method: 'POST',
        path: extractUrlPath(url),
        body: createJsonRpcMethodMatcher('notifications/session/terminated'),
      }).reply(() => ({
        statusCode: 500,
        data: 'Internal Server Error',
        responseOptions: {
          headers: {
            'content-type': 'text/plain',
          },
        },
      }));

      // Disconnect should complete despite termination error response
      await expect(transport.disconnect()).resolves.toBeUndefined();

      expect(transport.info.isConnected).toBe(false);
    });
  });
});
