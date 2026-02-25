import { MockAgent, setGlobalDispatcher } from 'undici';
import { describe, expect, it, vi } from 'vitest';

import { HTTP_OK } from '#constants/http';
import {
  createCachingTokenIntrospector,
  createTokenInspector,
} from '#oauth/resource-server/introspection';

import type { TokenInfo } from '#oauth/types';
/**
 * creates a mock introspection response for testing
 * @param active - whether the token is active
 * @param overrides - partial token info properties to override defaults
 * @returns token info object
 */
function createIntrospectionResponse(
  active: boolean,
  overrides?: Partial<TokenInfo>,
): TokenInfo {
  return {
    active,
    scope: 'mcp read',
    client_id: 'test-client',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);

vi.useFakeTimers();

describe('automatic endpoint discovery', () => {
  const config = {
    issuer: 'https://auth.example.com',
    clientCredentials: {
      clientId: 'rs-client',
      clientSecret: 'rs-secret',
    },
  };

  const wellKnownMetadata = {
    issuer: 'https://auth.example.com',
    authorization_endpoint: 'https://auth.example.com/oauth/authorize',
    token_endpoint: 'https://auth.example.com/oauth/token',
    introspection_endpoint: 'https://auth.example.com/oauth/introspect',
    revocation_endpoint: 'https://auth.example.com/oauth/revoke',
    scopes_supported: ['openid', 'profile', 'email', 'mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
  };

  it('should discover introspection endpoint via oauth well-known', async () => {
    // mock well-known discovery
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(HTTP_OK, () => wellKnownMetadata);

    // mock introspection request
    const activeToken = createIntrospectionResponse(true, {
      scope: 'mcp read',
      client_id: 'test-client',
    });

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/oauth/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=test-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const client = createTokenInspector(config);
    const result = await client('test-token');

    expect(result).toEqual(activeToken);
  });

  it('should fallback to openid configuration when oauth discovery fails', async () => {
    // mock oauth discovery failure
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(404);

    // mock openid configuration discovery
    const oidcMetadata = {
      ...wellKnownMetadata,
      // OIDC includes additional fields
      userinfo_endpoint: 'https://auth.example.com/userinfo',
      id_token_signing_alg_values_supported: ['RS256'],
      subject_types_supported: ['public'],
    };

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/openid-configuration',
      })
      .reply(HTTP_OK, () => oidcMetadata);

    // mock introspection request
    const activeToken = createIntrospectionResponse(true);

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/oauth/introspect',
      })
      .reply(HTTP_OK, () => activeToken);

    const client = createTokenInspector(config);
    const result = await client('test-token');

    expect(result).toEqual(activeToken);
  });

  it('should cache discovered endpoints across multiple calls', async () => {
    const configWithoutEndpoint = {
      issuer: 'https://auth2.example.com',
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const metadata = {
      ...wellKnownMetadata,
      issuer: 'https://auth2.example.com',
      introspection_endpoint: 'https://auth2.example.com/oauth/introspect',
    };

    // discovery should only be called once due to caching
    mockAgent
      .get('https://auth2.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(HTTP_OK, () => metadata);

    const activeToken = createIntrospectionResponse(true);

    // multiple introspection calls should use cached endpoint
    mockAgent
      .get('https://auth2.example.com')
      .intercept({
        method: 'POST',
        path: '/oauth/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(3);

    const client1 = createTokenInspector(configWithoutEndpoint);
    const client2 = createTokenInspector(configWithoutEndpoint);

    await client1('token1');
    await client1('token2');
    await client2('token3');

    // all should succeed without additional discovery calls
  });

  it('should use explicit endpoint when provided, skipping discovery', async () => {
    const configWithExplicitEndpoint = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: '/explicit/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const activeToken = createIntrospectionResponse(true);

    // no discovery calls should be made
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/explicit/introspect',
      })
      .reply(HTTP_OK, () => activeToken);

    const client = createTokenInspector(configWithExplicitEndpoint);
    const result = await client('test-token');

    expect(result).toEqual(activeToken);
  });

  it('should throw error when no introspection endpoint is found', async () => {
    const configNoEndpoint = {
      issuer: 'https://no-introspect.example.com',
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    // both discovery endpoints fail
    mockAgent
      .get('https://no-introspect.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(404);

    mockAgent
      .get('https://no-introspect.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/openid-configuration',
      })
      .reply(404);

    const client = createTokenInspector(configNoEndpoint);

    await expect(client('test-token')).rejects.toThrow(
      /No introspection endpoint found for issuer https:\/\/no-introspect\.example\.com/,
    );
  });

  it('should throw error when metadata lacks introspection endpoint', async () => {
    const configMissingEndpoint = {
      issuer: 'https://no-introspect2.example.com',
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const incompleteMetadata = {
      issuer: 'https://no-introspect2.example.com',
      authorization_endpoint:
        'https://no-introspect2.example.com/oauth/authorize',
      token_endpoint: 'https://no-introspect2.example.com/oauth/token',
      // missing introspection_endpoint
    };

    mockAgent
      .get('https://no-introspect2.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(HTTP_OK, () => incompleteMetadata);

    const client = createTokenInspector(configMissingEndpoint);

    await expect(client('test-token')).rejects.toThrow(
      /No introspection endpoint found for issuer https:\/\/no-introspect2\.example\.com/,
    );
  });

  it('should work with caching introspector', async () => {
    const configForCaching = {
      issuer: 'https://cache-auth.example.com',
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const metadata = {
      ...wellKnownMetadata,
      issuer: 'https://cache-auth.example.com',
      introspection_endpoint: 'https://cache-auth.example.com/oauth/introspect',
    };

    mockAgent
      .get('https://cache-auth.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(HTTP_OK, () => metadata);

    const activeToken = createIntrospectionResponse(true, {
      scope: 'mcp read',
    });

    // only one introspection call due to token caching
    mockAgent
      .get('https://cache-auth.example.com')
      .intercept({
        method: 'POST',
        path: '/oauth/introspect',
      })
      .reply(HTTP_OK, () => activeToken);

    const client = createCachingTokenIntrospector(configForCaching, {
      ttl: 60,
    });

    const result1 = await client('test-token');
    const result2 = await client('test-token'); // cached

    expect(result1).toEqual(activeToken);
    expect(result2).toEqual(activeToken);
  });

  it('should handle network errors during discovery gracefully', async () => {
    const configNetworkError = {
      issuer: 'https://network-error.example.com',
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    // simulate network errors
    mockAgent
      .get('https://network-error.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .replyWithError(new Error('Network error'));

    mockAgent
      .get('https://network-error.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/openid-configuration',
      })
      .replyWithError(new Error('Network error'));

    const client = createTokenInspector(configNetworkError);

    await expect(client('test-token')).rejects.toThrow(
      /No introspection endpoint found for issuer https:\/\/network-error\.example\.com/,
    );
  });

  it('should handle malformed discovery responses', async () => {
    const configMalformed = {
      issuer: 'https://malformed.example.com',
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    // return malformed JSON
    mockAgent
      .get('https://malformed.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
      })
      .reply(HTTP_OK, 'invalid json{');

    mockAgent
      .get('https://malformed.example.com')
      .intercept({
        method: 'GET',
        path: '/.well-known/openid-configuration',
      })
      .reply(HTTP_OK, 'also invalid}');

    const client = createTokenInspector(configMalformed);

    await expect(client('test-token')).rejects.toThrow(
      /No introspection endpoint found for issuer https:\/\/malformed\.example\.com/,
    );
  });
});
