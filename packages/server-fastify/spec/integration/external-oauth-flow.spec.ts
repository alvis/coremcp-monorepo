import { beforeEach, describe, it, expect, vi } from 'vitest';

import { makeRequest } from './helpers';
import { startTestServer } from './setup';

import type { TokenInfo } from '#oauth/types';

import type { TestServerInstance } from './setup';

// CONSTANTS //

const discoveryMetadata = {
  issuer: 'https://auth.example.com',
  introspection_endpoint: 'https://auth.example.com/oauth/introspect',
};

const activeTokenInfo = {
  active: true,
  sub: 'user-123',
  username: 'test-user',
  scope: 'mcp',
  client_id: 'test-client',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
} satisfies TokenInfo;

const mcpInitializeRequest = {
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'initialize' as const,
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

const mcpHeaders = {
  'Mcp-Protocol-Version': '2025-03-26',
};

// HELPERS //

/**
 * extracts the url string from a fetch input parameter
 * @param input - fetch url input (string, URL, or Request)
 * @returns url as a plain string
 */
function toUrlString(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

/**
 * builds a fetch implementation that dispatches responses based on URL pattern
 * @param overrides - per-endpoint response overrides
 * @returns fetch-compatible function
 */
function buildFetchResponses(
  overrides: Partial<
    Record<'discovery' | 'openid' | 'introspection', Response>
  > = {},
): (url: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (url) => {
    const urlString = toUrlString(url);

    if (urlString.includes('.well-known/oauth-authorization-server')) {
      return (
        overrides.discovery ?? Response.json(discoveryMetadata, { status: 200 })
      );
    }

    if (urlString.includes('.well-known/openid-configuration')) {
      return (
        overrides.openid ??
        Response.json({ error: 'not_found' }, { status: 404 })
      );
    }

    if (urlString.includes('/oauth/introspect')) {
      return (
        overrides.introspection ??
        Response.json(activeTokenInfo, { status: 200 })
      );
    }

    return Response.json({ error: 'not_found' }, { status: 404 });
  };
}

// MOCKS //

const fetchStub = vi.fn<typeof globalThis.fetch>();

// TEST SUITES //

describe('external oauth authorization server', () => {
  beforeEach(() => {
    fetchStub.mockImplementation(buildFetchResponses());
    vi.stubGlobal('fetch', fetchStub);
  });
  it('should discover introspection endpoint via rfc 8414', async () => {
    const server: TestServerInstance = await startTestServer({
      transportOptions: {
        auth: {
          mode: 'external',
          config: {
            issuer: 'https://auth.example.com',
            clientCredentials: {
              clientId: 'test-client',
              clientSecret: 'test-secret',
            },
          },
          requiredScopes: ['mcp'],
        },
      },
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(200);

    const discoveryCall = fetchStub.mock.calls.find(([url]) =>
      toUrlString(url).includes('.well-known/oauth-authorization-server'),
    );

    expect(discoveryCall).toBeDefined();
    expect(toUrlString(discoveryCall![0])).toBe(
      'https://auth.example.com/.well-known/oauth-authorization-server',
    );

    await server.cleanup();
  });

  it('should introspect token via external as', async () => {
    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(200);

    const introspectCall = fetchStub.mock.calls.find(([url]) =>
      toUrlString(url).includes('/oauth/introspect'),
    );

    expect(introspectCall).toBeDefined();
    if (introspectCall?.[1]?.headers) {
      expect(introspectCall[1].headers).toMatchObject({
        Authorization: expect.stringContaining('Basic'),
      });
    }

    await server.cleanup();
  });

  it('should cache introspection results', async () => {
    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    const initialIntrospectCalls = fetchStub.mock.calls.filter(([url]) =>
      toUrlString(url).includes('/oauth/introspect'),
    ).length;

    await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { ...mcpInitializeRequest, id: 2 },
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    const finalIntrospectCalls = fetchStub.mock.calls.filter(([url]) =>
      toUrlString(url).includes('/oauth/introspect'),
    ).length;

    expect(finalIntrospectCalls).toBe(initialIntrospectCalls);

    await server.cleanup();
  });

  it('should handle cache miss with external as call', async () => {
    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(200);
    expect(
      fetchStub.mock.calls.some(([url]) =>
        toUrlString(url).includes('/oauth/introspect'),
      ),
    ).toBe(true);

    await server.cleanup();
  });

  it('should use different tokens for cache entries', async () => {
    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token_1',
      },
    });

    const initialCalls = fetchStub.mock.calls.filter(([url]) =>
      toUrlString(url).includes('/oauth/introspect'),
    ).length;

    fetchStub.mockImplementation(
      buildFetchResponses({
        introspection: Response.json({ active: false } satisfies TokenInfo, {
          status: 200,
        }),
      }),
    );

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { ...mcpInitializeRequest, id: 2 },
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token_2',
      },
    });

    expect(response.status).toBe(401);
    expect(
      fetchStub.mock.calls.filter(([url]) =>
        toUrlString(url).includes('/oauth/introspect'),
      ).length,
    ).toBeGreaterThan(initialCalls);

    await server.cleanup();
  });

  it('should fallback to openid connect discovery', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        discovery: Response.json({ error: 'not_found' }, { status: 404 }),
        openid: Response.json(discoveryMetadata, { status: 200 }),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      transportOptions: {
        auth: {
          mode: 'external',
          config: {
            issuer: 'https://auth-openid.example.com',
            clientCredentials: {
              clientId: 'test-client',
              clientSecret: 'test-secret',
            },
          },
          requiredScopes: ['mcp'],
        },
      },
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(200);
    expect(
      fetchStub.mock.calls.some(([url]) =>
        toUrlString(url).includes(
          'auth-openid.example.com/.well-known/oauth-authorization-server',
        ),
      ),
    ).toBe(true);
    expect(
      fetchStub.mock.calls.some(([url]) =>
        toUrlString(url).includes(
          'auth-openid.example.com/.well-known/openid-configuration',
        ),
      ),
    ).toBe(true);

    await server.cleanup();
  });

  it('should reject invalid issuer url', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        discovery: Response.json({ error: 'not_found' }, { status: 404 }),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      transportOptions: {
        auth: {
          mode: 'external',
          config: {
            issuer: 'https://auth-invalid.example.com',
            clientCredentials: {
              clientId: 'test-client',
              clientSecret: 'test-secret',
            },
          },
          requiredScopes: ['mcp'],
        },
      },
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(400);

    await server.cleanup();
  });

  it('should handle introspection endpoint unavailable', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        introspection: Response.json(
          { error: 'service_unavailable' },
          { status: 503 },
        ),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(401);

    await server.cleanup();
  });

  it('should handle malformed introspection response', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        introspection: Response.json({ invalid: 'response' }, { status: 200 }),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(401);

    await server.cleanup();
  });

  it('should reject token with active false', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        introspection: Response.json({ active: false } satisfies TokenInfo, {
          status: 200,
        }),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer test_token',
      },
    });

    expect(response.status).toBe(401);

    await server.cleanup();
  });

  it('should validate token expiry', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        introspection: Response.json(
          {
            active: true,
            sub: 'user-123',
            username: 'test-user',
            scope: 'mcp',
            client_id: 'test-client',
            exp: 0,
            iat: 0,
          } satisfies TokenInfo,
          { status: 200 },
        ),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer expired_token_unique',
      },
    });

    const introspectCalls = fetchStub.mock.calls.filter(([url]) =>
      toUrlString(url).includes('/oauth/introspect'),
    );
    expect(introspectCalls.length).toBeGreaterThan(0);
    expect(response.status).toBe(401);

    await server.cleanup();
  });

  it('should enforce required scopes', async () => {
    fetchStub.mockImplementation(
      buildFetchResponses({
        introspection: Response.json(
          {
            active: true,
            sub: 'user-123',
            username: 'test-user',
            scope: 'read',
            client_id: 'test-client',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
          } satisfies TokenInfo,
          { status: 200 },
        ),
      }),
    );

    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        ...mcpHeaders,
        Authorization: 'Bearer scope_test_token_unique',
      },
    });

    expect(response.status).toBe(403);

    await server.cleanup();
  });

  it('should handle concurrent introspection requests', async () => {
    const server: TestServerInstance = await startTestServer({
      authMode: 'external-as',
    });

    const requests = await Promise.all([
      makeRequest(server, '/mcp', {
        method: 'POST',
        body: mcpInitializeRequest,
        headers: {
          ...mcpHeaders,
          Authorization: 'Bearer test_token_1',
        },
      }),
      makeRequest(server, '/mcp', {
        method: 'POST',
        body: { ...mcpInitializeRequest, id: 2 },
        headers: {
          ...mcpHeaders,
          Authorization: 'Bearer test_token_2',
        },
      }),
      makeRequest(server, '/mcp', {
        method: 'POST',
        body: { ...mcpInitializeRequest, id: 3 },
        headers: {
          ...mcpHeaders,
          Authorization: 'Bearer test_token_3',
        },
      }),
    ]);

    expect(requests[0].status).toBe(200);
    expect(requests[1].status).toBe(200);
    expect(requests[2].status).toBe(200);

    expect(
      fetchStub.mock.calls.filter(([url]) =>
        toUrlString(url).includes('/oauth/introspect'),
      ).length,
    ).toBeGreaterThanOrEqual(3);

    await server.cleanup();
  });
});
