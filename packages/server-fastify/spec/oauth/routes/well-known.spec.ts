import fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerWellKnownRoutes } from '#oauth/routes/well-known';

import type { ExternalAuthOptions } from '#oauth/types';

describe('fn: registerWellKnownRoutes', () => {
  it('should return protected resource metadata for external auth', async () => {
    const app = fastify();
    const options: ExternalAuthOptions = {
      mode: 'external',
      config: {
        issuer: 'https://auth.example.com',
        clientCredentials: {
          clientId: 'test-client',
          clientSecret: 'test-secret',
        },
      },
    };
    await app.register(registerWellKnownRoutes(options));

    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: expect.any(String),
      authorization_servers: ['https://auth.example.com'],
    });
  });

  it('should return protected resource metadata for anonymous auth', async () => {
    const app = fastify();
    const options = {
      mode: 'anonymous' as const,
    };
    await app.register(registerWellKnownRoutes(options));

    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      resource: expect.any(String),
      authorization_servers: [],
    });
  });

  // note: OAuth AS metadata for proxy mode is registered separately in proxy handlers
  // see the proxy mode integration tests
});
