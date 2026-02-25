import { describe, expect, it } from 'vitest';

import { makeRequest } from './helpers';
import { startTestServer } from './setup';

describe('integration test infrastructure smoke test', () => {
  it('should start server, make request, and cleanup', async () => {
    const server = await startTestServer({ authMode: 'anonymous' });

    try {
      const response = await makeRequest(server, '/health');

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
    } finally {
      await server.cleanup();
    }
  });

  it('should handle multiple sequential server starts', async () => {
    const server1 = await startTestServer({ authMode: 'anonymous' });

    const response1 = await makeRequest(server1, '/health');
    expect(response1.status).toBe(200);

    await server1.cleanup();

    const server2 = await startTestServer({ authMode: 'anonymous' });

    const response2 = await makeRequest(server2, '/health');
    expect(response2.status).toBe(200);

    await server2.cleanup();
  });

  it('should handle different auth modes', async () => {
    const anonymousServer = await startTestServer({ authMode: 'anonymous' });
    const anonymousResponse = await makeRequest(anonymousServer, '/health');
    expect(anonymousResponse.status).toBe(200);
    await anonymousServer.cleanup();

    const externalServer = await startTestServer({ authMode: 'external-as' });
    const externalResponse = await makeRequest(externalServer, '/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      },
    });
    expect(externalResponse.status).toBe(401);
    await externalServer.cleanup();
  });

  it('should provide valid base url', async () => {
    const server = await startTestServer();

    try {
      expect(server.baseUrl).toMatch(/^http:\/\/localhost:\d+$/);

      const response = await makeRequest(server, '/health');

      expect(response.status).toBe(200);
    } finally {
      await server.cleanup();
    }
  });
});
