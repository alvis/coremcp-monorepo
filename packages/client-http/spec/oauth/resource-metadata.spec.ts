import { afterEach, describe, expect, it } from 'vitest';

import { ExternalError } from '#errors';
import { fetchResourceMetadata } from '#oauth/resource-metadata';

import {
  captureRequest,
  mockErrorResponse,
  mockJsonResponse,
} from '../mocks/https';

import type { ProtectedResourceMetadata } from '#oauth/types';

describe('fn:fetchResourceMetadata', () => {
  afterEach(() => {
    captureRequest.mockClear();
  });

  it('should fetch protected resource metadata from well-known endpoint', async () => {
    const resourceUrl = 'https://mcp.example.com';
    const metadata: ProtectedResourceMetadata = {
      resource: resourceUrl,
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['files:read', 'files:write'],
    };

    mockJsonResponse(
      `${resourceUrl}/.well-known/oauth-protected-resource`,
      metadata,
    );

    const result = await fetchResourceMetadata(resourceUrl);

    expect(result).toEqual(metadata);
    expect(captureRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${resourceUrl}/.well-known/oauth-protected-resource`,
        method: 'GET',
      }),
    );
  });

  it('should reject HTTP URLs for security', async () => {
    const httpUrl = 'http://insecure.example.com';

    await expect(fetchResourceMetadata(httpUrl)).rejects.toThrow(ExternalError);
    await expect(fetchResourceMetadata(httpUrl)).rejects.toThrow(
      /HTTPS required/i,
    );
  });

  it('should wrap fetch errors in ExternalError', async () => {
    const resourceUrl = 'https://mcp.example.com';
    const fetchError = new Error('Network failure');

    mockErrorResponse(
      `${resourceUrl}/.well-known/oauth-protected-resource`,
      fetchError,
    );

    await expect(fetchResourceMetadata(resourceUrl)).rejects.toThrow(
      ExternalError,
    );
  });

  it('should handle non-JSON responses', async () => {
    const resourceUrl = 'https://mcp.example.com';

    mockJsonResponse(
      `${resourceUrl}/.well-known/oauth-protected-resource`,
      'not valid json',
    );

    await expect(fetchResourceMetadata(resourceUrl)).rejects.toThrow(
      ExternalError,
    );
  });
});
