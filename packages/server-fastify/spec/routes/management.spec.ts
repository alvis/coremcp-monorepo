import fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerManagementRoutes } from '#routes/management';

import { mcpServer } from '../fixtures';

import type { Log } from '@coremcp/core';
import type { FastifyInstance } from 'fastify';

describe('POST /management/cleanup', () => {
  let app: FastifyInstance;
  let mockLog: Log;
  const VALID_TOKEN = 'test-token-12345';

  beforeEach(async () => {
    mockLog = vi.fn<Log>();
    app = fastify();
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (req, body, done) => {
        try {
          const json = JSON.parse(body as string);
          done(null, json);
        } catch (error) {
          done(error as Error, undefined);
        }
      },
    );
    await app.register(
      registerManagementRoutes(mcpServer, VALID_TOKEN, mockLog),
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 401 when no token provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'unauthorized',
      message: 'Invalid or missing management token',
    });
  });

  it('should return 401 when invalid token provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'unauthorized',
      message: 'Invalid or missing management token',
    });
  });

  it('should accept valid bearer token from managementToken option', async () => {
    const cleanupSpy = vi
      .spyOn(mcpServer, 'cleanupInactiveSessions')
      .mockReturnValue(0);

    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('should cleanup inactive sessions with default timeout', async () => {
    const cleanupSpy = vi
      .spyOn(mcpServer, 'cleanupInactiveSessions')
      .mockReturnValue(3);
    const expected = {
      success: true,
      sessionsCleanedUp: 3,
      inactivityTimeoutMs: 300000,
      timestamp: expect.any(String),
    };

    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expected);
    expect(cleanupSpy).toHaveBeenCalledWith(300000);
  });

  it('should cleanup inactive sessions with custom timeout', async () => {
    const cleanupSpy = vi
      .spyOn(mcpServer, 'cleanupInactiveSessions')
      .mockReturnValue(5);
    const customTimeout = 60000;
    const expected = {
      success: true,
      sessionsCleanedUp: 5,
      inactivityTimeoutMs: customTimeout,
      timestamp: expect.any(String),
    };

    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { inactivityTimeoutMs: customTimeout },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expected);
    expect(cleanupSpy).toHaveBeenCalledWith(customTimeout);
  });

  it('should return 400 when inactivityTimeoutMs is negative', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { inactivityTimeoutMs: -1000 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'invalid_request',
      message: 'inactivityTimeoutMs must be a positive number',
    });
  });

  it('should return 400 when inactivityTimeoutMs is not a number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { inactivityTimeoutMs: 'invalid' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'invalid_request',
      message: 'inactivityTimeoutMs must be a positive number',
    });
  });

  it('should return proper response structure', async () => {
    vi.spyOn(mcpServer, 'cleanupInactiveSessions').mockReturnValue(2);

    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    const body = response.json();

    expect(body).toMatchObject({
      success: true,
      sessionsCleanedUp: expect.any(Number),
      inactivityTimeoutMs: expect.any(Number),
      timestamp: expect.any(String),
    });

    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('should log unauthorized access attempts', async () => {
    await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': 'Bearer invalid-token',
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(mockLog).toHaveBeenCalledWith(
      'warn',
      'Unauthorized management endpoint access attempt',
      {
        endpoint: '/management/cleanup',
        hasToken: true,
      },
    );
  });

  it('should log successful cleanup operations', async () => {
    vi.spyOn(mcpServer, 'cleanupInactiveSessions').mockReturnValue(4);

    await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(mockLog).toHaveBeenCalledWith(
      'info',
      'Management cleanup completed',
      {
        sessionsCleanedUp: 4,
        inactivityTimeoutMs: 300000,
      },
    );
  });

  describe('environment variable fallback', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.COREMCP_MANAGEMENT_TOKEN;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.COREMCP_MANAGEMENT_TOKEN = originalEnv;
      } else {
        delete process.env.COREMCP_MANAGEMENT_TOKEN;
      }
    });

    it('should fall back to COREMCP_MANAGEMENT_TOKEN env variable', async () => {
      const envToken = 'env-token-67890';
      process.env.COREMCP_MANAGEMENT_TOKEN = envToken;

      const appWithoutToken = fastify();
      appWithoutToken.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        (req, body, done) => {
          try {
            const json = JSON.parse(body as string);
            done(null, json);
          } catch (error) {
            done(error as Error, undefined);
          }
        },
      );
      await appWithoutToken.register(
        registerManagementRoutes(mcpServer, undefined, mockLog),
      );
      await appWithoutToken.ready();

      vi.spyOn(mcpServer, 'cleanupInactiveSessions').mockReturnValue(1);

      const response = await appWithoutToken.inject({
        method: 'POST',
        url: '/management/cleanup',
        headers: {
          'authorization': `Bearer ${envToken}`,
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      await appWithoutToken.close();
    });

    it('should prioritize managementToken option over env variable', async () => {
      process.env.COREMCP_MANAGEMENT_TOKEN = 'env-token';
      const optionToken = 'option-token';

      const appWithOption = fastify();
      appWithOption.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        (req, body, done) => {
          try {
            const json = JSON.parse(body as string);
            done(null, json);
          } catch (error) {
            done(error as Error, undefined);
          }
        },
      );
      await appWithOption.register(
        registerManagementRoutes(mcpServer, optionToken, mockLog),
      );
      await appWithOption.ready();

      const responseWithEnv = await appWithOption.inject({
        method: 'POST',
        url: '/management/cleanup',
        headers: {
          'authorization': 'Bearer env-token',
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(responseWithEnv.statusCode).toBe(401);

      vi.spyOn(mcpServer, 'cleanupInactiveSessions').mockReturnValue(0);

      const responseWithOption = await appWithOption.inject({
        method: 'POST',
        url: '/management/cleanup',
        headers: {
          'authorization': `Bearer ${optionToken}`,
          'content-type': 'application/json',
        },
        payload: {},
      });

      expect(responseWithOption.statusCode).toBe(200);

      await appWithOption.close();
    });
  });

  it('should handle zero sessions cleaned up', async () => {
    vi.spyOn(mcpServer, 'cleanupInactiveSessions').mockReturnValue(0);

    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        'authorization': `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      sessionsCleanedUp: 0,
    });
  });

  it('should handle missing authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
    });

    expect(response.statusCode).toBe(401);
    expect(mockLog).toHaveBeenCalledWith(
      'warn',
      'Unauthorized management endpoint access attempt',
      {
        endpoint: '/management/cleanup',
        hasToken: false,
      },
    );
  });

  it('should handle malformed authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/management/cleanup',
      headers: {
        authorization: 'NotBearer token',
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
