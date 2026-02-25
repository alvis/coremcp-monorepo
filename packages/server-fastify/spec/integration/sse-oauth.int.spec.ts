import { request as undiciRequest } from 'undici';
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

describe('SSE transport', () => {
  it('should accept SSE connection via GET /mcp', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const initResponse = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
    });
    expect(initResponse.status).toBe(200);

    const sessionId = initResponse.headers['mcp-session-id'] as string;
    expect(sessionId).toBeTruthy();

    // GET /mcp opens a persistent SSE notification channel.
    // The server hijacks the response and holds the connection open.
    // Without pending events, headers are never flushed to the client,
    // so undici hangs until our timeout fires — confirming the server
    // accepted the request rather than rejecting it.
    const result = await undiciRequest(`${server.baseUrl}/mcp`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Mcp-Session-Id': sessionId,
        'Mcp-Protocol-Version': '2025-03-26',
      },
      signal: AbortSignal.timeout(200),
    }).then(
      (response) => ({
        type: 'response' as const,
        status: response.statusCode,
      }),
      () => ({ type: 'aborted' as const }),
    );

    expect(result).toMatchObject({ type: 'aborted' });

    await server.cleanup();
  });

  it('should reject GET /mcp without Accept: text/event-stream', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    const initResponse = await makeRequest(server, '/mcp', {
      method: 'POST',
      body: mcpInitializeRequest,
    });
    const sessionId = initResponse.headers['mcp-session-id'] as string;

    const response = await makeRequest(server, '/mcp', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Mcp-Session-Id': sessionId,
        'Mcp-Protocol-Version': '2025-03-26',
      },
    });

    expect(response.status).toBe(406);
    expect(response.data).toMatchObject({
      jsonrpc: '2.0',
      error: {
        message: expect.stringContaining('text/event-stream'),
      },
    });

    await server.cleanup();
  });
});
