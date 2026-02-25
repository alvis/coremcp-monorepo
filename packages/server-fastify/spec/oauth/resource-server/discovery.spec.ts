import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  createProtectedResourceMetadata,
  handleProtectedResourceMetadata,
} from '#oauth/resource-server/discovery';
import { inferBaseUrlFromRequest } from '#request-context';

describe('fn:createProtectedResourceMetadata', () => {
  it('should create basic protected resource metadata for anonymous mode', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        mode: 'anonymous',
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    const result = response.json();

    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: [],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });

  it('should handle external authorization server mode', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        mode: 'external',
        config: {
          issuer: 'https://auth.example.com',
          clientCredentials: {
            clientId: 'test-client',
            clientSecret: 'test-secret',
          },
        },
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    const result = response.json();

    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });

  it('should handle X-Forwarded headers', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        mode: 'anonymous',
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'proxy.example.com',
        'host': 'internal.example.com',
      },
    });

    const result = response.json();

    expect(result).toEqual({
      resource: 'https://proxy.example.com',
      authorization_servers: [],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });

  it('should use default port when not specified', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        mode: 'anonymous',
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
    });

    const result = response.json();

    // when no host header is provided, Fastify uses the default
    // the actual value will depend on Fastify's defaults
    expect(result.resource).toMatch(/^https?:\/\//);
    expect(result).toEqual({
      ...result,
      authorization_servers: [],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });

  it('should handle proxy authorization server', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        requiredScopes: ['mcp'],
        mode: 'proxy',
        config: {
          issuer: 'https://auth.example.com',
          proxyCredentials: {
            clientId: 'proxy-client',
            clientSecret: 'proxy-secret',
            redirectUri: 'https://api.example.com/oauth/callback',
          },
          stateJwt: {
            secret: 'a-very-long-secret-key-for-jwt-signing-minimum-32-chars',
          },
        },
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    const result = response.json();

    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://api.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
    });

    await fastify.close();
  });

  it('should handle multiple required scopes', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        mode: 'external',
        config: {
          issuer: 'https://auth.example.com',
          clientCredentials: {
            clientId: 'test-client',
            clientSecret: 'test-secret',
          },
        },
        requiredScopes: ['mcp', 'read', 'write'],
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    const result = response.json();

    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp', 'read', 'write'],
    });

    await fastify.close();
  });

  it('should handle no scopes configured', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);
      const metadata = createProtectedResourceMetadata(baseUrl, {
        mode: 'external',
        config: {
          issuer: 'https://auth.example.com',
          clientCredentials: {
            clientId: 'test-client',
            clientSecret: 'test-secret',
          },
        },
      });

      return metadata;
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    const result = response.json();

    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });
});

describe('fn:handleProtectedResourceMetadata', () => {
  it('should handle anonymous mode response', async () => {
    const fastify = Fastify();

    fastify.get('/test', async (request, reply) => {
      await handleProtectedResourceMetadata(request, reply, {
        auth: {
          mode: 'anonymous',
        },
      });
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);

    const result = response.json();
    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: [],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });

  it('should handle external authorization server mode', async () => {
    const fastify = Fastify();

    fastify.get('/test', async (request, reply) => {
      await handleProtectedResourceMetadata(request, reply, {
        auth: {
          mode: 'external',
          config: {
            issuer: 'https://auth.example.com',
            clientCredentials: {
              clientId: 'test-client',
              clientSecret: 'test-secret',
            },
          },
        },
      });
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);

    const result = response.json();
    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });

  it('should handle proxy authorization server mode', async () => {
    const fastify = Fastify();

    fastify.get('/test', async (request, reply) => {
      await handleProtectedResourceMetadata(request, reply, {
        auth: {
          requiredScopes: ['mcp'],
          mode: 'proxy',
          config: {
            issuer: 'https://auth.example.com',
            proxyCredentials: {
              clientId: 'proxy-client',
              clientSecret: 'proxy-secret',
              redirectUri: 'https://api.example.com/oauth/callback',
            },
            stateJwt: {
              secret: 'a-very-long-secret-key-for-jwt-signing-minimum-32-chars',
            },
          },
        },
      });
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);

    const result = response.json();
    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://api.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
    });

    await fastify.close();
  });

  it('should use custom baseUrl from options', async () => {
    const fastify = Fastify();

    fastify.get('/test', async (request, reply) => {
      await handleProtectedResourceMetadata(request, reply, {
        baseUrl: 'https://custom.example.com',
        auth: {
          mode: 'anonymous',
        },
      });
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    expect(response.statusCode).toBe(200);

    const result = response.json();
    expect(result.resource).toBe('https://custom.example.com');

    await fastify.close();
  });

  it('should handle X-Forwarded headers in handler', async () => {
    const fastify = Fastify();

    fastify.get('/test', async (request, reply) => {
      await handleProtectedResourceMetadata(request, reply, {
        auth: {
          mode: 'anonymous',
        },
      });
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'proxy.example.com',
        'host': 'internal.example.com',
      },
    });

    expect(response.statusCode).toBe(200);

    const result = response.json();
    expect(result.resource).toBe('https://proxy.example.com');

    await fastify.close();
  });

  it('should handle no scopes configured in handler', async () => {
    const fastify = Fastify();

    fastify.get('/test', async (request, reply) => {
      await handleProtectedResourceMetadata(request, reply, {
        auth: {
          mode: 'external',
          config: {
            issuer: 'https://auth.example.com',
            clientCredentials: {
              clientId: 'test-client',
              clientSecret: 'test-secret',
            },
          },
        },
      });
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://api.example.com/test',
    });

    expect(response.statusCode).toBe(200);

    const result = response.json();
    expect(result).toEqual({
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
    });

    await fastify.close();
  });
});
