/**
 * transport tests for the coremcp HTTP server transport via native connector
 *
 * validates HTTP-specific transport behavior including session management,
 * concurrent request handling, POST with JSON responses, session persistence,
 * and reconnection using the HttpMcpConnector as the client.
 * @see /e2e/interactions/02-transport.md for interaction specifications
 */

import { JSONRPC_VERSION, LATEST_PROTOCOL_VERSION } from '@coremcp/protocol';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';


import {
  createServerHttpClientContext,
  createRawHttpSession,
} from '../fixtures/index';

import { TEST_TOOLS, TEST_RESOURCES } from '../fixtures/test-server';

import type { ContentBlock, TextResourceContents } from '@coremcp/protocol';

import type { ServerHttpClientContext } from '../fixtures/index';

// TYPES //

/** parsed info resource shape */
interface InfoResource {
  sessionId: string;
  name: string;
  version: string;
}

// TEST SUITES //

describe('server-transport-http / 02-transport', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('POST with JSON response', () => {
    it('should respond to tools/list via POST with JSON [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server responds to a tools/list request via HTTP POST
       * with a valid JSON response. Per spec, if the input is a JSON-RPC request,
       * the server MUST return Content-Type: text/event-stream or application/json.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L611-L700 (handlePostRequest)
       */
      const tools = await ctx.connector.listTools();

      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));
    });

    it('should respond to resources/list via POST with JSON [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server responds to a resources/list request via HTTP POST
       * with a valid JSON response. Per spec, if the input is a JSON-RPC request,
       * the server MUST return Content-Type: text/event-stream or application/json.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L611-L700 (handlePostRequest)
       */
      const resources = await ctx.connector.listResources();

      const resourceUris = resources.map((r) => r.uri);

      expect(resourceUris).toEqual(expect.arrayContaining(TEST_RESOURCES));
    });

    it('should respond to tool call via POST with JSON [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server responds to a tools/call request via HTTP POST
       * with a valid JSON response containing the tool result. Per spec, if the
       * input is a JSON-RPC request, the server MUST return Content-Type:
       * text/event-stream or application/json.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L611-L700 (handlePostRequest)
       */
      const result = await ctx.connector.callTool('echo', {
        text: 'transport-test',
      });

      expect(result.content).toBeDefined();
      const content = result.content as ContentBlock[];
      expect(content[0]).toEqual(
        expect.objectContaining({ text: 'transport-test' }),
      );
    });

    it('should respond to ping via POST [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server responds to a ping request via HTTP POST.
       * Per spec, the client MUST use HTTP POST to send JSON-RPC messages.
       * If the input is a JSON-RPC request, the server MUST respond with SSE or JSON.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L611-L700 (handlePostRequest)
       */
      await expect(ctx.connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('session management', () => {
    it('should maintain session across multiple requests [TRANSPORT-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server maintains a consistent session across multiple
       * requests. Per spec, a server MAY assign a session ID at initialization;
       * clients MUST include it in the Mcp-Session-Id header on subsequent requests.
       * same session ID returned across requests confirms session persistence.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L838-L857 (validateSession)
       */
      // the connector maintains a persistent session, so two consecutive
      // resource reads should return the same session ID
      const result1 = await ctx.connector.readResource('test://info');

      expect(result1.contents[0]).toBeDefined();
      expect('text' in result1.contents[0]).toBe(true);
      const info1 = JSON.parse(
        (result1.contents[0] as TextResourceContents).text,
      ) as InfoResource;

      expect(info1.sessionId).toBeDefined();
      expect(typeof info1.sessionId).toBe('string');
      expect(info1.sessionId.length).toBeGreaterThan(0);

      const result2 = await ctx.connector.readResource('test://info');

      expect(result2.contents[0]).toBeDefined();
      expect('text' in result2.contents[0]).toBe(true);
      const info2 = JSON.parse(
        (result2.contents[0] as TextResourceContents).text,
      ) as InfoResource;

      // same connector session should yield same session ID
      expect(info1.sessionId).toBe(info2.sessionId);
    });

    it('should assign new session after disconnect and reconnect [TRANSPORT-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that reconnecting to the server produces a new session ID.
       * Per spec, the server MAY assign a session ID at initialization. After
       * disconnect and reconnect, a new initialization yields a new session ID,
       * confirming the old session is no longer reused.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L664-L674 (sessionId assignment during initialization)
       */
      // read session ID before reconnect
      const result1 = await ctx.connector.readResource('test://info');

      expect(result1.contents[0]).toBeDefined();
      expect('text' in result1.contents[0]).toBe(true);
      const info1 = JSON.parse(
        (result1.contents[0] as TextResourceContents).text,
      ) as InfoResource;

      // disconnect and reconnect to get a new session
      await ctx.connector.disconnect();
      await ctx.connector.connect();

      const result2 = await ctx.connector.readResource('test://info');

      expect(result2.contents[0]).toBeDefined();
      expect('text' in result2.contents[0]).toBe(true);
      const info2 = JSON.parse(
        (result2.contents[0] as TextResourceContents).text,
      ) as InfoResource;

      // reconnection should create a new session
      expect(info1.sessionId).not.toBe(info2.sessionId);
    });
  });

  describe('concurrent operations', () => {
    it('should handle parallel requests [TRANSPORT-008]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server handles multiple concurrent HTTP POST requests.
       * Per spec, the client MUST use HTTP POST to send JSON-RPC messages and
       * the client MAY remain connected to multiple SSE streams simultaneously.
       * This tests that parallel requests are all processed and return correctly.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#multiple-connections
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L611-L700 (handlePostRequest processes each independently)
       */
      const operations = [
        ctx.connector.callTool('echo', { text: 'concurrent-1' }),
        ctx.connector.callTool('echo', { text: 'concurrent-2' }),
        ctx.connector.callTool('add', { a: 10, b: 20 }),
        ctx.connector.listTools(),
        ctx.connector.listResources(),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(5);

      // verify echo results
      const echo1 = results[0] as { content?: Array<{ text: string }> };
      const echo2 = results[1] as { content?: Array<{ text: string }> };

      expect(echo1.content).toBeDefined();
      expect(echo1.content![0].text).toBe('concurrent-1');

      expect(echo2.content).toBeDefined();
      expect(echo2.content![0].text).toBe('concurrent-2');

      // verify add result
      const addResult = results[2] as { content?: Array<{ text: string }> };

      expect(addResult.content).toBeDefined();
      expect(addResult.content![0].text).toBe('30');

      // verify list results are arrays
      expect(Array.isArray(results[3])).toBe(true);
      expect(Array.isArray(results[4])).toBe(true);
    });
  });

  describe('SSE via POST', () => {
    it('should return SSE content type when Accept includes text/event-stream [TRANSPORT-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server returns Content-Type: text/event-stream when
       * the client includes text/event-stream in the Accept header on a POST
       * request. Per spec, if the input is a JSON-RPC request, the server MUST
       * return Content-Type: text/event-stream or application/json.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L752-L793 (SSE stream response path in handlePostRequest)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      // POST with SSE accept header to trigger streaming response
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'ping',
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';

      // server should respond with SSE content type when Accept includes text/event-stream
      expect(contentType).toContain('text/event-stream');

      await rawSession.close();
    });
  });

  describe('GET SSE stream', () => {
    it('should accept GET with session ID for SSE stream [TRANSPORT-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server accepts HTTP GET requests with a valid session
       * ID and returns an SSE stream. Per spec, the client MAY issue an HTTP GET
       * to the MCP endpoint; the server MUST return Content-Type: text/event-stream
       * or 405 Method Not Allowed.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#listening-for-messages-from-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L403-L458 (handleGetRequest)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      const response = await fetch(ctx.mcpEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'Mcp-Session-Id': rawSession.sessionId,
        },
      });

      // server should accept the GET request for SSE streaming
      expect(response.ok).toBe(true);

      const contentType = response.headers.get('content-type') ?? '';
      expect(contentType).toContain('text/event-stream');

      await rawSession.close();
    });
  });

  describe('DELETE session', () => {
    it('should terminate session via DELETE request [TRANSPORT-009]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server terminates a session via HTTP DELETE. Per spec,
       * clients SHOULD send an HTTP DELETE to the MCP endpoint with the
       * Mcp-Session-Id header to explicitly terminate the session. The server
       * MAY respond with 405 Method Not Allowed. The SDK returns 200/204.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L818-L828 (handleDeleteRequest)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      const deleteResponse = await fetch(ctx.mcpEndpoint, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': rawSession.sessionId },
      });

      expect([200, 204]).toContain(deleteResponse.status);
    });

    it('should reject requests after session termination [TRANSPORT-010]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server rejects requests after session termination with
       * HTTP 404. Per spec, the server MAY terminate the session at any time,
       * after which it MUST respond to requests containing that session ID with
       * HTTP 404 Not Found.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#session-management
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L855-L857 (validateSession returns 404 for unknown session)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      // terminate the session
      await fetch(ctx.mcpEndpoint, {
        method: 'DELETE',
        headers: { 'Mcp-Session-Id': rawSession.sessionId },
      });

      // subsequent request should be rejected
      const postResponse = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 99,
          method: 'ping',
        }),
      });

      // MCP spec: terminated sessions MUST return 404
      expect(postResponse.status).toBe(404);
    });
  });

  describe('MCP-Protocol-Version header', () => {
    it('should accept requests with correct MCP-Protocol-Version header [TRANSPORT-013]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server accepts requests with a valid MCP-Protocol-Version
       * header. Per spec, the client MUST include the MCP-Protocol-Version header
       * on all subsequent requests; the version SHOULD be the one negotiated
       * during initialization.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#protocol-version-header
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L876-L887 (validateProtocolVersion)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'ping',
        }),
      });

      expect(response.ok).toBe(true);

      await rawSession.close();
    });

    it('should reject requests with wrong MCP-Protocol-Version header [TRANSPORT-013]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server rejects requests with an unsupported
       * MCP-Protocol-Version header with 400 Bad Request. Per spec, if the
       * server receives a request with an invalid or unsupported
       * MCP-Protocol-Version, it MUST respond with 400 Bad Request.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#protocol-version-header
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L876-L887 (validateProtocolVersion rejects unsupported versions)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': '0000-00-00',
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'ping',
        }),
      });

      // server should reject requests with unsupported protocol version with 400 Bad Request
      expect(response.status).toBe(400);

      await rawSession.close();
    });
  });

  describe('Origin validation', () => {
    it('should handle request with foreign Origin header [TRANSPORT-014]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server rejects requests with a foreign Origin header
       * with HTTP 403 Forbidden. Per spec, servers MUST validate the Origin
       * header on all incoming connections to prevent DNS rebinding attacks;
       * if the Origin header is present and invalid, servers MUST respond with
       * HTTP 403 Forbidden.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#security-warning
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L329-L335 (origin validation with allowedOrigins)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
          'Origin': 'http://evil.com',
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id: 1,
          method: 'ping',
        }),
      });

      // MCP spec: servers MUST respond with HTTP 403 Forbidden for invalid Origin
      expect(response.status).toBe(403);

      await rawSession.close();
    });
  });

  describe('notification POST response', () => {
    it('should respond with 202 Accepted and empty body for a JSON-RPC notification [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the server returns 202 Accepted with no body for a
       * JSON-RPC notification (message without id). Per spec, if the input is
       * a JSON-RPC response or notification and the server accepts it, the server
       * MUST return HTTP status code 202 Accepted with no body.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L693-L700 (hasRequests check, returns 202 for notifications)
       */
      const rawSession = await createRawHttpSession(ctx.mcpEndpoint);

      // send a JSON-RPC notification (no id field) directly via fetch
      // to verify the server returns 202 Accepted with an empty body
      const response = await fetch(ctx.mcpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': rawSession.sessionId,
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          method: 'notifications/initialized',
        }),
      });

      // MCP spec: notifications (messages without id) receive 202 Accepted
      expect(response.status).toBe(202);

      // body must be empty for 202 Accepted responses to notifications
      const body = await response.text();
      expect(body).toBe('');

      await rawSession.close();
    });
  });

  describe('SSE reconnection with Last-Event-ID', () => {
    // SPEC ALIGNMENT: PASS (correctly skipped; resumability is optional per spec)
    /**
     * would verify SSE resumability via Last-Event-ID. Per spec, servers MAY
     * attach an id field to SSE events and clients MAY reconnect with
     * Last-Event-ID to resume. Skipped because test server does not implement
     * event store for resumability.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#resumability-and-redelivery
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L788-L793 (EventStore-based resumability)
     */
    it.skip(
      'should replay missed events when reconnecting with Last-Event-ID header [TRANSPORT-011]' +
        ' -- SSE resumability via Last-Event-ID requires the server to buffer sent events' +
        ' and replay events after the provided ID on reconnection. The current test' +
        ' server does not persist SSE event IDs for replay, so this test cannot' +
        ' deterministically verify event replay. The spec notes that servers MAY' +
        ' support resumability and MAY reject reconnection if too much time has passed.',
    );
  });

  describe('health endpoint', () => {
    it('should respond on the health endpoint [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS (implementation-specific behavior, not explicitly specified)
      /**
       * verifies the server's health endpoint is reachable. Health endpoints are
       * not specified in the MCP transport spec; this is an implementation-specific
       * endpoint for operational monitoring.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
       */
      const response = await fetch(ctx.healthEndpoint);

      expect(response.ok || response.status === 404).toBe(true);
    });

    it('should accept connections on the MCP endpoint [TRANSPORT-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that the MCP endpoint is reachable. A bare GET without session
       * may return 200 (SSE stream), 400, or 405 depending on server config.
       * Per spec, the server MUST provide a single HTTP endpoint that supports
       * both POST and GET methods.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/streamableHttp.ts#L346-L361 (handleRequest routes by method)
       */
      // verify the MCP endpoint is reachable (400 is expected without session)
      const response = await fetch(ctx.mcpEndpoint, { method: 'GET' });

      expect(
        response.ok || response.status === 400 || response.status === 405,
      ).toBe(true);
    });
  });
});
