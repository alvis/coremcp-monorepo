# Integration Tests

This directory contains integration and unit tests for the @coremcp/server-fastify HTTP transport, covering MCP protocol handling, session management, and OAuth authentication.

## Directory Structure

```
spec/integration/
├── setup.ts                         # Test server setup utilities
├── helpers.ts                       # HTTP client and SSE utilities
├── oauth-helpers.ts                 # OAuth flow helpers (PAR, PKCE, token exchange)
├── README.md                        # This file
├── __smoke__.int.spec.ts            # Infrastructure smoke tests
├── anonymous-mode.int.spec.ts       # Anonymous mode integration tests
├── error-scenarios.int.spec.ts      # Error handling integration tests
├── multi-session.int.spec.ts        # Multi-session management tests
├── sse-oauth.int.spec.ts            # SSE transport integration tests
└── external-oauth-flow.spec.ts      # External OAuth AS unit tests (uses mocks)
```

## Test Classification

### Integration Tests (`.int.spec.ts`)

Integration tests exercise real code paths with real Fastify servers. No mocks are allowed.

- **`__smoke__`**: Validates that the test infrastructure works (server start/stop, health checks, auth mode selection)
- **`anonymous-mode`**: MCP request handling without authentication (initialize, tools/list, session lifecycle)
- **`error-scenarios`**: HTTP error responses (invalid JSON, wrong Content-Type, unsupported protocol version, CORS)
- **`multi-session`**: Session isolation, independent termination, active session tracking
- **`sse-oauth`**: SSE transport via GET /mcp (connection establishment, header validation)

### Unit Tests (`.spec.ts`)

Unit tests may use mocks for external dependencies.

- **`external-oauth-flow`**: External Authorization Server integration with mocked `fetch` (discovery, introspection, caching, scope enforcement)

## Test Patterns

### Starting Test Servers

```typescript
import { startTestServer } from './setup';

const server = await startTestServer({ authMode: 'anonymous' });
// ... perform tests
await server.cleanup();
```

### Authentication Modes

| Mode            | Description                                            |
| --------------- | ------------------------------------------------------ |
| `'anonymous'`   | No authentication required                             |
| `'proxy'`       | OAuth proxy mode with upstream AS                      |
| `'external-as'` | External Authorization Server with token introspection |

### Making HTTP Requests

```typescript
import { makeRequest } from './helpers';

const response = await makeRequest(server, '/mcp', {
  method: 'POST',
  body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { ... } },
  headers: { 'Mcp-Session-Id': sessionId },
});
```

### SSE Connections

```typescript
import { connectSSE, waitForSSEEvent } from './helpers';

const connection = await connectSSE(server, sessionId);
const event = await waitForSSEEvent(connection, (e) => e.event === 'message');
connection.close();
```

## Running Tests

```bash
# run all integration tests
pnpm test spec/integration

# run specific test file
pnpm test spec/integration/anonymous-mode.int.spec.ts

# run with coverage
pnpm coverage spec/integration
```
