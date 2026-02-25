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

describe('anonymous mode', () => {
  it('should initialize mcp server without authentication', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const healthResponse = await makeRequest(server, '/health');

    expect(healthResponse.status).toBe(200);
    expect(server.baseUrl).toMatch(/^http:\/\/localhost:\d+$/);

    await server.cleanup();
  });

  it('should handle mcp requests over http POST', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: expect.any(Object),
      },
    });
    expect(response.headers['mcp-session-id']).toBeTruthy();

    await server.cleanup();
  });

  it('should list available tools', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const initResponse = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
    });
    expect(initResponse.status).toBe(200);

    const sessionId = initResponse.headers['mcp-session-id'] as string;
    expect(sessionId).toBeTruthy();

    const response = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      headers: { 'Mcp-Session-Id': sessionId },
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      jsonrpc: '2.0',
      result: { tools: expect.any(Array) },
    });

    await server.cleanup();
  });

  it('should manage session lifecycle with termination', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const initResponse = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
    });
    expect(initResponse.status).toBe(200);

    const sessionId = initResponse.headers['mcp-session-id'] as string;
    expect(sessionId).toBeTruthy();

    const listResponse = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      headers: { 'Mcp-Session-Id': sessionId },
    });
    expect(listResponse.status).toBe(200);

    const deleteResponse = await makeRequest(server, '/mcp', {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionId,
        'Mcp-Protocol-Version': '2025-03-26',
      },
    });
    expect(deleteResponse.status).toBe(200);

    await server.cleanup();
  });
});
