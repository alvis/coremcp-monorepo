import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFormBody,
  createBasicAuthHeader,
  ForwarderError,
  forwardFormRequest,
  forwardJsonRequest,
  parseBasicAuthHeader,
} from '#oauth/proxy/forwarder';

describe('Forwarder', () => {
  describe('fn:createBasicAuthHeader', () => {
    it('should create valid Basic Auth header', () => {
      const header = createBasicAuthHeader('client-id', 'client-secret');

      expect(header).toMatch(/^Basic /);

      // decode and verify
      const encoded = header.slice(6);
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

      expect(decoded).toBe('client-id:client-secret');
    });

    it('should properly encode special characters', () => {
      const header = createBasicAuthHeader('client:id', 'secret=value');

      const encoded = header.slice(6);
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8');

      expect(decoded).toBe('client:id:secret=value');
    });
  });

  describe('fn:parseBasicAuthHeader', () => {
    it('should parse valid Basic Auth header', () => {
      const credentials = Buffer.from('client-id:client-secret').toString(
        'base64',
      );
      const result = parseBasicAuthHeader(`Basic ${credentials}`);

      expect(result).toEqual({
        clientId: 'client-id',
        clientSecret: 'client-secret',
      });
    });

    it('should return null for non-Basic auth', () => {
      const result = parseBasicAuthHeader('Bearer token');

      expect(result).toBeNull();
    });

    it('should return null for undefined header', () => {
      const result = parseBasicAuthHeader(undefined);

      expect(result).toBeNull();
    });

    it('should return null for missing colon', () => {
      const credentials = Buffer.from('invalid').toString('base64');
      const result = parseBasicAuthHeader(`Basic ${credentials}`);

      expect(result).toBeNull();
    });

    it('should return null for empty client id', () => {
      const credentials = Buffer.from(':secret').toString('base64');
      const result = parseBasicAuthHeader(`Basic ${credentials}`);

      expect(result).toBeNull();
    });

    it('should return null for empty client secret', () => {
      const credentials = Buffer.from('clientid:').toString('base64');
      const result = parseBasicAuthHeader(`Basic ${credentials}`);

      expect(result).toBeNull();
    });

    it('should handle colons in secret', () => {
      const credentials = Buffer.from('client:secret:with:colons').toString(
        'base64',
      );
      const result = parseBasicAuthHeader(`Basic ${credentials}`);

      expect(result).toEqual({
        clientId: 'client',
        clientSecret: 'secret:with:colons',
      });
    });
  });

  describe('fn:buildFormBody', () => {
    it('should build form-encoded body', () => {
      const body = buildFormBody({
        grant_type: 'authorization_code',
        code: 'abc123',
        redirect_uri: 'https://example.com/callback',
      });

      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=abc123');
      expect(body).toContain(
        'redirect_uri=https%3A%2F%2Fexample.com%2Fcallback',
      );
    });

    it('should skip undefined values', () => {
      const body = buildFormBody({
        grant_type: 'authorization_code',
        code: 'abc123',
        scope: undefined,
      });

      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=abc123');
      expect(body).not.toContain('scope');
    });
  });

  describe('cl:ForwarderError', () => {
    it('should create error with all properties', () => {
      const error = new ForwarderError({
        message: 'Test error',
        statusCode: 400,
        errorCode: 'invalid_request',
        errorDescription: 'Missing parameter',
        errorUri: 'https://example.com/docs',
        upstreamError: true,
      });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('invalid_request');
      expect(error.errorDescription).toBe('Missing parameter');
      expect(error.errorUri).toBe('https://example.com/docs');
      expect(error.upstreamError).toBe(true);
      expect(error.name).toBe('ForwarderError');
    });

    it('should default upstreamError to false', () => {
      const error = new ForwarderError({
        message: 'Test error',
        statusCode: 500,
        errorCode: 'server_error',
      });

      expect(error.upstreamError).toBe(false);
    });

    it('should convert to wire format', () => {
      const error = new ForwarderError({
        message: 'Test error',
        statusCode: 400,
        errorCode: 'invalid_client',
        errorDescription: 'Unknown client',
        errorUri: 'https://docs.example.com',
      });

      const wire = error.toWireFormat();

      expect(wire).toEqual({
        error: 'invalid_client',
        error_description: 'Unknown client',
        error_uri: 'https://docs.example.com',
      });
    });
  });

  describe('fn:forwardJsonRequest', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should forward successful JSON request', async () => {
      const mockResponse = { data: 'test' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify(mockResponse),
      });

      const result = await forwardJsonRequest<{ data: string }>(
        'https://example.com/api',
        'POST',
        { 'X-Custom': 'header' },
        { key: 'value' },
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual(mockResponse);

      expect(fetch).toHaveBeenCalledWith('https://example.com/api', {
        method: 'POST',
        headers: {
          'X-Custom': 'header',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ key: 'value' }),
      });
    });

    it('should handle error response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 400,
        text: async () =>
          JSON.stringify({
            error: 'invalid_request',
            error_description: 'Missing parameter',
          }),
      });

      const result = await forwardJsonRequest(
        'https://example.com/api',
        'POST',
        {},
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toBeInstanceOf(ForwarderError);
      expect(result.error?.errorCode).toBe('invalid_request');
      expect(result.error?.upstreamError).toBe(true);
    });

    it('should handle network error', async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new Error('Connection refused'));

      const result = await forwardJsonRequest(
        'https://example.com/api',
        'GET',
        {},
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error?.errorCode).toBe('server_error');
      expect(result.error?.upstreamError).toBe(false);
    });
  });

  describe('fn:forwardFormRequest', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should forward form-encoded request', async () => {
      const mockResponse = { access_token: 'token123' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => JSON.stringify(mockResponse),
      });

      const result = await forwardFormRequest<{ access_token: string }>(
        'https://example.com/token',
        { Authorization: 'Basic abc123' },
        { grant_type: 'authorization_code', code: 'xyz' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResponse);

      expect(fetch).toHaveBeenCalledWith('https://example.com/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic abc123',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: expect.stringContaining('grant_type=authorization_code'),
      });
    });

    it('should handle OAuth error response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 401,
        text: async () =>
          JSON.stringify({
            error: 'invalid_client',
            error_description: 'Unknown client',
          }),
      });

      const result = await forwardFormRequest(
        'https://example.com/token',
        {},
        { grant_type: 'authorization_code' },
      );

      expect(result.success).toBe(false);
      expect(result.error?.errorCode).toBe('invalid_client');
      expect(result.error?.errorDescription).toBe('Unknown client');
    });
  });
});
