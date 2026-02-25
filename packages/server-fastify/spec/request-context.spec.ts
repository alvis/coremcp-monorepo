import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import {
  extractConnectionContext,
  inferBaseUrlFromRequest,
  lastHeader,
} from '#request-context';

import type { IncomingHttpHeaders } from 'node:http';

describe('fn:lastHeader', () => {
  it('should return last value when header exists as array', () => {
    const headers: IncomingHttpHeaders = {
      'x-forwarded-for': ['192.168.1.1', '10.0.0.1', '172.16.0.1'],
    };

    const result = lastHeader(headers, 'x-forwarded-for');

    expect(result).toBe('172.16.0.1');
  });

  it('should handle case-insensitive header lookup', () => {
    const headers: IncomingHttpHeaders = {
      'Content-Type': 'text/html',
    };

    const result = lastHeader(headers, 'content-type');

    expect(result).toBe('text/html');
  });

  it('should return undefined when header does not exist', () => {
    const headers: IncomingHttpHeaders = {
      'content-type': 'text/html',
    };

    const result = lastHeader(headers, 'non-existent-header');

    expect(result).toBeUndefined();
  });

  it('should handle single string value (not array)', () => {
    const headers: IncomingHttpHeaders = {
      authorization: 'Bearer token',
    };

    const result = lastHeader(headers, 'authorization');

    expect(result).toBe('Bearer token');
  });
});

describe('fn:extractConnectionContext', () => {
  it('should extract connection context with authorization and session headers', async () => {
    const fastify = Fastify();

    const resolveUserId = async () => undefined;

    fastify.get('/test', async (request, reply) => {
      const context = await extractConnectionContext(
        request,
        reply,
        resolveUserId,
      );

      return {
        transport: context.transport,
        sessionId: context.sessionId,
        hasWrite: typeof context.write === 'function',
      };
    });

    const expected = {
      hasWrite: true,
      sessionId: 'session-456',
      transport: 'http',
    };

    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'mcp-session-id': 'session-456',
      },
    });

    const result = response.json();

    expect(result).toEqual(expected);

    await fastify.close();
  });

  it('should handle missing headers', async () => {
    const fastify = Fastify();

    const resolveUserId = async () => undefined;

    fastify.get('/test', async (request, reply) => {
      const context = await extractConnectionContext(
        request,
        reply,
        resolveUserId,
      );

      return {
        transport: context.transport,
        sessionId: context.sessionId,
        hasWrite: typeof context.write === 'function',
      };
    });

    const expected = {
      hasWrite: true,
      sessionId: undefined,
      transport: 'http',
    };

    const response = await fastify.inject({
      method: 'GET',
      url: '/test',
    });

    const result = response.json();

    expect(result).toEqual(expected);

    await fastify.close();
  });

  it('should have a working write function', async () => {
    const fastify = Fastify();

    const resolveUserId = async () => undefined;

    let writeCalled = false;
    let writtenMessage: unknown = null;

    fastify.get('/test', async (request, reply) => {
      const context = await extractConnectionContext(
        request,
        reply,
        resolveUserId,
      );

      const message = {
        jsonrpc: '2.0' as const,
        method: 'notifications/test' as const,
        params: {
          message: 'message',
        },
      };

      // capture what write does without actually writing
      const originalWrite = reply.raw.write;
      reply.raw.write = function (chunk: unknown) {
        writeCalled = true;

        // extract JSON from SSE format: "data: {...}\n\n"
        const chunkStr = String(chunk);
        const sseMatch = /^data:\s*([^\n]+)\n\n$/.exec(chunkStr);
        writtenMessage = sseMatch
          ? JSON.parse(sseMatch[1])
          : JSON.parse(chunkStr);

        return true;
      } as typeof originalWrite;

      // call the write function directly
      await context.write(message);

      // restore and send response
      reply.raw.write = originalWrite;

      return reply.send({ success: true });
    });

    await fastify.inject({
      method: 'GET',
      url: '/test',
    });

    expect(writeCalled).toBe(true);
    expect(writtenMessage).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/test',
      params: {
        message: 'message',
      },
    });

    await fastify.close();
  });
});

describe('fn:inferBaseUrlFromRequest', () => {
  it('should handle request without proxy headers and non-default port', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);

      return { baseUrl };
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'http://example.com:3000/test',
    });

    const result = response.json();

    expect(result.baseUrl).toBe('http://example.com:3000');

    await fastify.close();
  });

  it('should use x-forwarded-host when present', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => {
      const baseUrl = inferBaseUrlFromRequest(request);

      return { baseUrl };
    });

    const response = await fastify.inject({
      method: 'GET',
      url: 'http://internal.local:3000/test',
      headers: {
        'x-forwarded-host': 'api.example.com',
      },
    });

    const result = response.json();

    expect(result.baseUrl).toBe('http://api.example.com');

    await fastify.close();
  });

  it('should omit default port for HTTP (80)', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => inferBaseUrlFromRequest(request));

    const response = await fastify.inject({
      method: 'GET',
      url: 'http://example.com/test',
    });

    const result = response.body;

    expect(result).toBe('http://example.com');

    await fastify.close();
  });

  it('should omit default port for HTTPS (443)', async () => {
    const fastify = Fastify();

    fastify.get('/test', (request) => inferBaseUrlFromRequest(request));

    const response = await fastify.inject({
      method: 'GET',
      url: 'https://example.com/test',
    });

    const result = response.body;

    expect(result).toBe('https://example.com');

    await fastify.close();
  });
});
