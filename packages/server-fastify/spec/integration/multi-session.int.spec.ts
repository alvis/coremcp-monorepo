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

/**
 * initializes an MCP session and returns the session ID
 * @param server - test server instance
 * @param id - unique JSON-RPC request ID
 */
async function initializeSession(
  server: Parameters<typeof makeRequest>[0],
  id = 1,
): Promise<string> {
  const response = await makeRequest(server, '/mcp', {
    method: 'POST',
    body: { ...mcpInitializeRequest, id },
  });

  if (response.status !== 200) {
    throw new Error(
      `Initialize failed with status ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  const sessionId = response.headers['mcp-session-id'] as string;
  if (!sessionId) {
    throw new Error('No Mcp-Session-Id header in initialize response');
  }

  return sessionId;
}

describe('multi-session scenarios', () => {
  it('should create independent sessions with unique IDs', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const sessionId1 = await initializeSession(server, 1);
    const sessionId2 = await initializeSession(server, 2);

    expect(sessionId1).toBeTruthy();
    expect(sessionId2).toBeTruthy();
    expect(sessionId1).not.toBe(sessionId2);

    await server.cleanup();
  });

  it('should isolate session state between sessions', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const sessionId1 = await initializeSession(server, 1);
    const sessionId2 = await initializeSession(server, 2);

    const response1 = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
      headers: { 'Mcp-Session-Id': sessionId1 },
    });

    const response2 = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} },
      headers: { 'Mcp-Session-Id': sessionId2 },
    });

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.data).toMatchObject({
      jsonrpc: '2.0',
      result: expect.any(Object),
    });
    expect(response2.data).toMatchObject({
      jsonrpc: '2.0',
      result: expect.any(Object),
    });

    await server.cleanup();
  });

  it('should terminate individual sessions via DELETE', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const sessionId1 = await initializeSession(server, 1);
    const sessionId2 = await initializeSession(server, 2);

    const deleteResponse = await makeRequest(server, '/mcp', {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionId1,
        'Mcp-Protocol-Version': '2025-03-26',
      },
    });
    expect(deleteResponse.status).toBe(200);

    const response2 = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
      headers: { 'Mcp-Session-Id': sessionId2 },
    });
    expect(response2.status).toBe(200);

    await server.cleanup();
  });

  it('should track active session count', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    expect(server.transport.getActiveSessionCount()).toBe(0);

    const sessionId1 = await initializeSession(server, 1);
    const sessionId2 = await initializeSession(server, 2);
    await initializeSession(server, 3);

    expect(server.transport.getActiveSessionCount()).toBe(3);

    await makeRequest(server, '/mcp', {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionId1,
        'Mcp-Protocol-Version': '2025-03-26',
      },
    });

    expect(server.transport.getActiveSessionCount()).toBe(2);

    await makeRequest(server, '/mcp', {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': sessionId2,
        'Mcp-Protocol-Version': '2025-03-26',
      },
    });

    expect(server.transport.getActiveSessionCount()).toBe(1);

    await server.cleanup();
  });
});
