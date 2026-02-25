import { describe, it, expect } from 'vitest';

import { makeRequest } from './helpers';
import { startTestServer } from './setup';

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

describe('error scenarios', () => {
  it('should reject request with invalid JSON body', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: 'this is not valid json{{{',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      error: 'Bad Request',
    });

    await server.cleanup();
  });

  it('should reject request with unsupported content-type', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: JSON.stringify(mcpInitializeRequest),
      headers: {
        'Content-Type': 'text/plain',
        'Accept': 'application/json',
      },
    });

    expect(response.status).toBe(415);
    expect(response.data).toMatchObject({
      jsonrpc: '2.0',
      error: {
        message: expect.stringContaining('Content-Type'),
      },
    });

    await server.cleanup();
  });

  it('should reject request with unsupported protocol version', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
      headers: {
        'Mcp-Protocol-Version': '1999-01-01',
      },
    });

    expect(response.status).toBe(400);
    expect(response.data).toMatchObject({
      jsonrpc: '2.0',
      error: {
        message: expect.stringContaining('Unsupported protocol version'),
      },
    });

    await server.cleanup();
  });

  it('should include CORS headers on matched routes', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const response = await makeRequest(server, '/health', {
      method: 'GET',
      headers: { Origin: 'https://example.com' },
    });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain(
      'Mcp-Session-Id',
    );

    await server.cleanup();
  });
});
