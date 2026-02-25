import { MockAgent, setGlobalDispatcher } from 'undici';
import { describe, expect, it, vi } from 'vitest';

import { HTTP_OK } from '#constants/http';
import {
  createCachingTokenIntrospector,
  createTokenInspector,
} from '#oauth/resource-server/introspection';

import type { TokenInfo, ExternalAuthServerConfig } from '#oauth/types';

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

const HOUR_IN_SECONDS = 3600;
const CACHE_TTL_SECONDS = 60;
const SHORT_CACHE_TTL = 1;
const ADVANCE_TIME_2S = 2000;

// initialize mock agent for test isolation
const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);

vi.useFakeTimers();

const clientId = 'rs-client';
const clientSecret = 'rs-secret';

describe('fn:createIntrospectionClient', () => {
  it('should successfully introspect an active token', async () => {
    const activeToken = createIntrospectionResponse(true, {
      scope: 'mcp read',
      client_id: 'test-client',
      exp: Math.floor(Date.now() / 1000) + HOUR_IN_SECONDS,
    });

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' +
            Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=test-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId,
        clientSecret,
      },
    };

    const client = createTokenInspector(config);

    const result = await client('test-token');

    expect(result).toEqual(activeToken);
  });

  it('should return inactive token info for inactive token', async () => {
    const expected = { active: false };

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=inactive-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => ({ active: false }));

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createTokenInspector(config);

    const result = await client('inactive-token');

    expect(result).toEqual(expected);
  });

  it('should return inactive token info for introspection endpoint errors', async () => {
    const expected = { active: false };

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:wrong-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=test-token&token_type_hint=access_token',
      })
      .reply(401, () => ({ error: 'Unauthorized' }));

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'wrong-secret',
      },
    };

    const client = createTokenInspector(config);

    const result = await client('test-token');

    expect(result).toEqual(expected);
  });

  it('should include additional parameters in request', async () => {
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=test-token&token_type_hint=access_token&resource=https%3A%2F%2Fapi.example.com&scope=mcp',
      })
      .reply(HTTP_OK, () => ({ active: true }));

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createTokenInspector(config, {
      additionalParams: {
        resource: 'https://api.example.com',
        scope: 'mcp',
      },
    });

    const result = await client('test-token');

    expect(result).toEqual({ active: true });
  });
});

describe('fn:createCachingIntrospectionClient', () => {
  it('should cache successful introspection results', async () => {
    const activeToken = createIntrospectionResponse(true);

    // only need one intercept since the second call uses cache
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=test-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createCachingTokenIntrospector(config, {
      ttl: CACHE_TTL_SECONDS,
    });

    // first call - should hit the endpoint
    const result1 = await client('test-token');
    expect(result1).toEqual(activeToken);

    // second call - should use cache (no new intercept needed)
    const result2 = await client('test-token');
    expect(result2).toEqual(activeToken);
  });

  it('should not cache inactive tokens', async () => {
    // Need two intercepts since inactive tokens are not cached
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=inactive-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => ({ active: false }))
      .times(2);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createCachingTokenIntrospector(config, {
      ttl: CACHE_TTL_SECONDS,
    });

    const result1 = await client('inactive-token');
    expect(result1).toEqual({ active: false });

    const result2 = await client('inactive-token');
    expect(result2).toEqual({ active: false });
  });

  it('should respect cache TTL', async () => {
    const activeToken = createIntrospectionResponse(true);

    // set up two different responses for the same token
    let callCount = 0;
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=test-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => {
        callCount++;

        return callCount === 1
          ? activeToken
          : { ...activeToken, scope: 'updated' };
      })
      .times(2);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createCachingTokenIntrospector(config, {
      ttl: SHORT_CACHE_TTL,
    });

    // first call
    const result1 = await client('test-token');
    expect(result1.scope).toBe('mcp read');

    // advance time past ttl
    vi.advanceTimersByTime(ADVANCE_TIME_2S);

    // second call - should hit endpoint again
    const result2 = await client('test-token');
    expect(result2.scope).toBe('updated');
  });

  it('should clean up expired cache entries', async () => {
    const activeToken = createIntrospectionResponse(true);

    // set up intercepts for token1 and token2
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=token1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2);

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        headers: {
          'Authorization':
            'Basic ' + Buffer.from('rs-client:rs-secret').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: 'token=token2&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createCachingTokenIntrospector(config, {
      ttl: SHORT_CACHE_TTL,
    });

    // cache multiple tokens
    await client('token1');
    await client('token2');

    // advance time to trigger cleanup
    vi.advanceTimersByTime(ADVANCE_TIME_2S);

    // both should require new introspection
    const result3 = await client('token1');
    expect(result3).toEqual(activeToken);

    const result4 = await client('token2');
    expect(result4).toEqual(activeToken);
  });
});

describe('LRU cache size limits', () => {
  it('should respect configured max size', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 3;

    // set up mock for 5 tokens
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(5);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: CACHE_TTL_SECONDS * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // cache 5 tokens (exceeds max size of 3)
    await client('token1');
    await client('token2');
    await client('token3');
    await client('token4'); // should trigger eviction of token1
    await client('token5'); // should trigger eviction of token2

    // set up mock for evicted tokens to verify they were removed
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=token1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    // verify token1 was evicted (requires new introspection)
    const result = await client('token1');

    expect(result).toEqual(activeToken);
  });

  it('should use default max size of 10000', async () => {
    const activeToken = createIntrospectionResponse(true);

    // no maxSize configured - should use default
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
    };

    const client = createCachingTokenIntrospector(config);

    // cache two tokens
    await client('token1');
    await client('token2');

    // both should be cached (no new introspection needed)
    const result1 = await client('token1');
    const result2 = await client('token2');

    expect(result1).toEqual(activeToken);
    expect(result2).toEqual(activeToken);
  });

  it('should never exceed max size', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 2;

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(3);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: CACHE_TTL_SECONDS * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // add exactly maxSize + 1 tokens
    await client('token1');
    await client('token2');
    await client('token3'); // exceeds max size

    // verify token1 was evicted
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=token1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const result = await client('token1');

    expect(result).toEqual(activeToken);
  });
});

describe('LRU eviction strategy', () => {
  it('should evict least recently used entry when full', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 3;

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(4);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: CACHE_TTL_SECONDS * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // fill cache to capacity
    await client('token1');
    await client('token2');
    await client('token3');

    // add new token - should evict token1 (least recently used)
    await client('token4');

    // verify token1 was evicted
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=token1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const result = await client('token1');

    expect(result).toEqual(activeToken);
  });

  it('should update access time on cache hit', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 3;

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(4);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: CACHE_TTL_SECONDS * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // fill cache to capacity
    await client('token1');
    await client('token2');
    await client('token3');

    // access token1 again (updates its timestamp)
    await client('token1');

    // add new token - should evict token2 (now LRU), not token1
    await client('token4');

    // verify token2 was evicted (not token1)
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=token2&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const result = await client('token2');

    expect(result).toEqual(activeToken);
  });

  it('should not evict when below max size', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 5;

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(3);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: CACHE_TTL_SECONDS * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // add tokens below max size
    await client('token1');
    await client('token2');
    await client('token3');

    // all tokens should be cached (no new introspection)
    const result1 = await client('token1');
    const result2 = await client('token2');
    const result3 = await client('token3');

    expect(result1).toEqual(activeToken);
    expect(result2).toEqual(activeToken);
    expect(result3).toEqual(activeToken);
  });
});

describe('cache management with TTL integration', () => {
  it('should respect TTL and refetch after expiration', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 5;

    // should be called twice - once for initial, once after TTL expires
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=ttl-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: SHORT_CACHE_TTL * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // first call - should hit endpoint
    const result1 = await client('ttl-token');
    expect(result1).toEqual(activeToken);

    // second call within TTL - should use cache (no new request)
    const result2 = await client('ttl-token');
    expect(result2).toEqual(activeToken);

    // advance time past TTL
    vi.advanceTimersByTime(ADVANCE_TIME_2S);

    // third call after TTL - should hit endpoint again
    const result3 = await client('ttl-token');

    expect(result3).toEqual(activeToken);
  });

  it('should use custom TTL when configured via introspectionCache', async () => {
    const activeToken = createIntrospectionResponse(true);
    const customTtl = 5000; // 5 seconds

    // should be called twice
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=custom-ttl-token&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        ttlMs: customTtl,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // first call - should hit endpoint
    await client('custom-ttl-token');

    // advance time past custom TTL
    vi.advanceTimersByTime(customTtl + 1000);

    // should fetch again due to TTL expiration
    const result = await client('custom-ttl-token');

    expect(result).toEqual(activeToken);
  });
});

describe('edge cases', () => {
  it('should handle cache with size 1', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 1;

    // set up mocks for specific tokens
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=size1-token1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=size1-token2&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: CACHE_TTL_SECONDS * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // add first token
    await client('size1-token1');

    // add second token - should evict token1
    await client('size1-token2');

    // verify token1 was evicted (requires new introspection)
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=size1-token1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const result = await client('size1-token1');

    expect(result).toEqual(activeToken);
  });

  it('should handle updating existing cache entry', async () => {
    const activeToken = createIntrospectionResponse(true);
    const maxSize = 3;

    // set up mocks for each unique token
    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=update1&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2); // initial + after TTL

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=update2&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken)
      .times(2); // initial + after eviction

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=update3&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    mockAgent
      .get('https://auth.example.com')
      .intercept({
        method: 'POST',
        path: '/introspect',
        body: 'token=update4&token_type_hint=access_token',
      })
      .reply(HTTP_OK, () => activeToken);

    const config: ExternalAuthServerConfig = {
      issuer: 'https://auth.example.com',
      endpoints: {
        introspection: 'https://auth.example.com/introspect',
      },
      clientCredentials: {
        clientId: 'rs-client',
        clientSecret: 'rs-secret',
      },
      introspectionCache: {
        maxSize,
        ttlMs: SHORT_CACHE_TTL * 1000,
      },
    };

    const client = createCachingTokenIntrospector(config);

    // fill cache
    await client('update1');
    await client('update2');
    await client('update3');

    // advance time to expire update1
    vi.advanceTimersByTime(ADVANCE_TIME_2S);

    // access update1 again (expired, will re-fetch and update cache)
    await client('update1');

    // add new token - should evict update2 (LRU), not update1 (just updated)
    await client('update4');

    // verify update2 was evicted
    const result = await client('update2');

    expect(result).toEqual(activeToken);
  });
});
