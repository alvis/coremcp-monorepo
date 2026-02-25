# @coremcp/server-fastify

> HTTP transport implementation for MCP servers with OAuth 2.1 authentication — production-ready web API for AI applications.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/server @coremcp/server-fastify
```

```typescript
import { McpServer } from '@coremcp/server';
import { HTTPTransport } from '@coremcp/server-fastify';

// Create MCP server with session management
const server = new McpServer({
  serverInfo: { name: 'WebAPI', version: '1.0.0' },
  handlers: {
    handleCallTool: async (params) => {
      // Tool implementations
    },
  },
});

// Create HTTP transport with OAuth
const transport = new HTTPTransport({
  mcpServer: server,
  port: 8080,
  auth: {
    mode: 'built-in',
    config: {
      issuer: 'https://api.example.com',
    },
  },
});

await transport.start();
// Server available at http://localhost:8080/mcp
```

---

## ✨ Key Features

| Feature                    | @coremcp/server-fastify | Express + manual |
| -------------------------- | ----------------------- | ---------------- |
| 🔐 **OAuth 2.1 with PKCE** | ✅                      | ❌               |
| 🌐 **CORS support**        | ✅                      | 🔶               |
| 📡 **Session management**  | ✅                      | ❌               |
| 🚀 **High performance**    | ✅                      | 🔶               |
| 🛡️ **Security headers**    | ✅                      | ❌               |

_Top 3 reasons you'll love it_

- **Enterprise authentication** — Full OAuth 2.1 implementation with PKCE and dynamic client registration
- **Production ready** — Built on Fastify for high performance with comprehensive security features
- **Zero-config development** — Works out of the box with sensible defaults and easy customization

---

## 😩 Problem → 💡 Solution

> **The pain**: Building secure, scalable HTTP APIs for MCP servers requires OAuth implementation, session management, and robust security.
>
> **The fix**: @coremcp/server-fastify provides enterprise-grade HTTP transport with OAuth 2.1 — secure by default, scalable by design.

---

## 🚀 Usage

### Basic HTTP Server

```typescript
import { McpServer } from '@coremcp/server';
import { HTTPTransport } from '@coremcp/server-fastify';

const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '2.1.0' },

  handlers: {
    handleCallTool: async (params, session) => {
      switch (params.name) {
        case 'get_weather':
          return {
            content: [
              {
                type: 'text',
                text: `Weather in ${params.arguments.city}: 22°C`,
              },
            ],
          };
      }
    },
  },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 3000,
  host: '0.0.0.0',
});

await transport.start();
console.log('MCP server running on http://localhost:3000');
```

### OAuth 2.1 Authentication

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 8080,
  auth: {
    mode: 'built-in',
    config: {
      issuer: 'https://api.mycompany.com',
      supportedGrantTypes: ['authorization_code'],
      supportedResponseTypes: ['code'],
      supportedScopes: ['mcp:read', 'mcp:write', 'mcp:admin'],
    },
  },
});

// OAuth endpoints automatically available:
// GET  /.well-known/oauth-authorization-server
// POST /oauth/register
// GET  /oauth/authorize
// POST /oauth/token
// POST /mcp (with Bearer token)
```

### Production Configuration

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: parseInt(process.env.PORT || '8080'),
  host: process.env.HOST || '0.0.0.0',

  auth: {
    mode: 'built-in',
    config: {
      issuer: process.env.OAUTH_ISSUER || 'https://api.mycompany.com',
      disableDynamicClientRegistration: process.env.NODE_ENV === 'production',
      supportedScopes: ['mcp:read', 'mcp:write'],
    },
  },
});
```

---

## Session Management

Session management is split between McpServer (session lifecycle) and HTTPTransport (monitoring and management).

### Session Lifecycle (McpServer)

Control session ID generation and initialization callbacks through McpServer options.

#### Custom Session ID Generation

Provide your own session ID generation logic with automatic fallback on errors:

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
  sessionIdGenerator: () => {
    // Custom format: prefix + timestamp + random
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 3000,
});
```

**Validation & Fallback**:

- Generated IDs must be non-empty strings
- Invalid IDs trigger warning and fall back to default Base62 UUID
- Generator errors are caught, logged, and handled gracefully
- Session creation always succeeds regardless of generator issues

#### Session Lifecycle Hooks

Execute custom logic when sessions are initialized:

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
  onSessionInitialized: async (sessionId, userId) => {
    // Log session creation to database
    await database.logSession({
      sessionId,
      userId, // undefined for anonymous sessions
      createdAt: new Date(),
    });

    // Send notification
    await notificationService.notify(`New session: ${sessionId}`);
  },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 3000,
});
```

**Behavior**:

- Called AFTER session is committed to storage
- Async only (must return `Promise<void>`)
- Fire-and-forget: errors don't affect session creation
- Non-blocking: doesn't delay session initialization response
- Errors are logged with full context

### Session Monitoring & Management (HTTPTransport)

HTTPTransport provides monitoring and administrative operations for active sessions.

#### Monitoring Active Sessions

Track the number of currently active MCP sessions:

```typescript
import { HTTPTransport } from '@coremcp/server-fastify';

const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 3000,
});

await transport.start();

// Get current session count
const count = transport.getActiveSessionCount();
console.log(`Active sessions: ${count}`);
```

#### Administrative Session Cleanup

Clean up inactive sessions via secure management endpoint.

##### Setup Management Token

Configure authentication for management endpoints:

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
});

const transport = new HTTPTransport({
  mcpServer: server,
  managementToken: 'your-secure-token-here',
  port: 3000,
});

// Or use environment variable
process.env.COREMCP_MANAGEMENT_TOKEN = 'your-secure-token-here';
```

##### Cleanup Inactive Sessions

Remove sessions that haven't had activity within a specified timeframe:

```typescript
// Cleanup with default timeout (5 minutes)
const response = await fetch('http://localhost:3000/management/cleanup', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-secure-token-here',
    'Content-Type': 'application/json',
  },
});

const result = await response.json();
console.log(`Cleaned up ${result.sessionsCleanedUp} sessions`);

// Cleanup with custom timeout (1 hour)
const response = await fetch('http://localhost:3000/management/cleanup', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-secure-token-here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    inactivityTimeoutMs: 3600000, // 1 hour in milliseconds
  }),
});
```

##### Response Format

```typescript
{
  success: true,
  sessionsCleanedUp: 3,
  inactivityTimeoutMs: 300000,
  timestamp: "2025-01-15T10:30:00.000Z"
}
```

##### Security Considerations

- **Token Storage**: Store management tokens securely (environment variables, secret managers)
- **Token Rotation**: Rotate tokens regularly
- **Logging**: All unauthorized attempts are logged for security auditing
- **HTTPS**: Always use HTTPS in production to protect tokens in transit
- **Access Control**: Restrict management endpoint access at network level if possible

##### Error Responses

**401 Unauthorized** - Invalid or missing token:

```json
{
  "error": "unauthorized",
  "message": "Invalid or missing management token"
}
```

**400 Bad Request** - Invalid timeout value:

```json
{
  "error": "invalid_request",
  "message": "inactivityTimeoutMs must be a positive number"
}
```

### Complete Example: Production Setup

```typescript
import { HTTPTransport } from '@coremcp/server-fastify';
import { McpServer } from '@coremcp/server';
import { MemorySessionStore } from '@coremcp/core';

// Create MCP server with session lifecycle configuration
const mcpServer = new McpServer({
  serverInfo: {
    name: 'my-mcp-server',
    version: '1.0.0',
  },
  sessionStore: new MemorySessionStore(),

  // Custom session IDs
  sessionIdGenerator: () => `sess_${Date.now()}_${crypto.randomUUID()}`,

  // Session lifecycle tracking
  onSessionInitialized: async (sessionId, userId) => {
    await logger.info('Session created', { sessionId, userId });
    await metrics.incrementCounter('sessions.created');
  },
});

// Create HTTP transport with monitoring and management
const transport = new HTTPTransport({
  mcpServer,
  port: 3000,

  // Management endpoint security
  managementToken: process.env.MANAGEMENT_TOKEN,

  // OAuth authentication
  auth: {
    mode: 'external',
    config: {
      issuer: 'https://auth.example.com',
      clientCredentials: {
        clientId: process.env.CLIENT_ID!,
        clientSecret: process.env.CLIENT_SECRET!,
      },
    },
  },
});

await transport.start();

// Automated cleanup (optional cron job)
setInterval(async () => {
  const response = await fetch('http://localhost:3000/management/cleanup', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inactivityTimeoutMs: 600000, // 10 minutes
    }),
  });

  const result = await response.json();
  logger.info(
    `Cleanup completed: ${result.sessionsCleanedUp} sessions removed`,
  );
}, 300000); // Run every 5 minutes
```

---

### Custom Middleware

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 8080,
});

// Add custom middleware before starting
transport.server.addHook('preHandler', async (request, reply) => {
  // Request logging
  console.log(`${request.method} ${request.url}`);

  // Rate limiting
  const clientIp = request.ip;
  if (await isRateLimited(clientIp)) {
    reply.code(429).send({ error: 'Rate limit exceeded' });
    return;
  }

  // Custom authentication
  if (request.url.startsWith('/admin/')) {
    const token = request.headers.authorization;
    if (!(await verifyAdminToken(token))) {
      reply.code(403).send({ error: 'Admin access required' });
      return;
    }
  }
});

await transport.start();
```

### Multi-tenant Setup

```typescript
import { McpServer } from '@coremcp/server';

// Create tenant-specific servers
const createTenantServer = (tenantId: string) => {
  return new McpServer({
    serverInfo: { name: `tenant-${tenantId}`, version: '1.0.0' },

    handlers: {
      handleCallTool: async (params, session) => {
        // Tenant-specific logic
        const tenantData = await getTenantData(tenantId);
        // ...
      },
    },

    resolveUserId: async (context) => {
      // Extract tenant from request
      const tenantFromPath = context.path?.split('/')[1];
      if (tenantFromPath !== tenantId) {
        return null; // Wrong tenant
      }

      // Resolve user for this tenant
      return await getUserFromToken(context.headers?.authorization, tenantId);
    },
  });
};

// Setup tenant routing
const transport = new HTTPTransport({ port: 8080 });

transport.server.register(async function (fastify) {
  fastify.post('/tenant-a/mcp', async (request, reply) => {
    const server = createTenantServer('tenant-a');
    return handleMcpRequest(server, request, reply);
  });

  fastify.post('/tenant-b/mcp', async (request, reply) => {
    const server = createTenantServer('tenant-b');
    return handleMcpRequest(server, request, reply);
  });
});
```

---

## 🧩 API Reference

### HTTPTransport Class

| Method                    | Description                              | Status |
| ------------------------- | ---------------------------------------- | ------ |
| `constructor(options)`    | Create HTTP transport with configuration | ✅     |
| `start()`                 | Start Fastify server                     | ✅     |
| `stop()`                  | Stop server and cleanup                  | ✅     |
| `server`                  | Access underlying Fastify instance       | ✅     |
| `getActiveSessionCount()` | Get current count of active sessions     | ✅     |

### Transport Options

| Property          | Type          | Description                              | Status |
| ----------------- | ------------- | ---------------------------------------- | ------ |
| `mcpServer`       | `McpServer`   | MCP server instance (required)           | ✅     |
| `port`            | `number`      | Server port (default: 80)                | ✅     |
| `host`            | `string`      | Server host (default: '0.0.0.0')         | ✅     |
| `baseUrl`         | `string`      | Base URL (default: auto-detected)        | ✅     |
| `auth`            | `AuthOptions` | Authentication configuration             | ✅     |
| `log`             | `function`    | Custom logging function                  | ✅     |
| `managementToken` | `string`      | Management endpoint authentication token | ✅     |

### McpServer Options (Session Management)

| Property               | Type                                    | Description                  | Status |
| ---------------------- | --------------------------------------- | ---------------------------- | ------ |
| `sessionIdGenerator`   | `() => string`                          | Custom session ID generation | ✅     |
| `onSessionInitialized` | `(sessionId, userId?) => Promise<void>` | Session lifecycle callback   | ✅     |

### Authentication Configuration (AuthOptions)

| Property                | Type                                                    | Description                                            |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `mode`                  | `'built-in'` \| `'external'` \| `'anonymous'`           | Authentication mode                                    |
| `config`                | `BuiltInAuthServerConfig` \| `ExternalAuthServerConfig` | Configuration object (required for built-in/external)  |
| `requiredScopes`        | `string[]`                                              | Required OAuth scopes for MCP endpoints (optional)     |
| `introspectionCacheTTL` | `number`                                                | Token introspection cache TTL in seconds (default: 60) |

#### Built-in Auth Server Config

| Property                           | Type           | Description                    |
| ---------------------------------- | -------------- | ------------------------------ |
| `issuer`                           | `string`       | OAuth issuer URL               |
| `storage`                          | `OAuthStorage` | Token and client storage       |
| `tokenExpiry`                      | `object`       | Token expiry configuration     |
| `disableDynamicClientRegistration` | `boolean`      | Disable client registration    |
| `supportedGrantTypes`              | `string[]`     | Supported OAuth grant types    |
| `supportedResponseTypes`           | `string[]`     | Supported OAuth response types |
| `supportedScopes`                  | `string[]`     | Available OAuth scopes         |

---

## 🔐 OAuth 2.1 Implementation

### Authorization Server Metadata

```http
GET /.well-known/oauth-authorization-server
```

```json
{
  "issuer": "https://api.example.com",
  "authorization_endpoint": "https://api.example.com/oauth/authorize",
  "token_endpoint": "https://api.example.com/oauth/token",
  "registration_endpoint": "https://api.example.com/oauth/register",
  "grant_types_supported": ["authorization_code"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"]
}
```

### Dynamic Client Registration

```http
POST /oauth/register
Content-Type: application/json

{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://localhost:3000/callback"],
  "grant_types": ["authorization_code"],
  "response_types": ["code"]
}
```

### Authorization Code Flow with PKCE

```http
GET /oauth/authorize?response_type=code&client_id=abc123&redirect_uri=http://localhost:3000/callback&code_challenge=xyz&code_challenge_method=S256&state=random
```

### Token Exchange

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=auth_code&client_id=abc123&code_verifier=xyz&redirect_uri=http://localhost:3000/callback
```

### Authenticated MCP Requests

```http
POST /mcp
Authorization: Bearer access_token
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": { "query": "MCP protocol" }
  }
}
```

---

## 🌐 HTTP Endpoints

| Endpoint                                  | Method | Description                 |
| ----------------------------------------- | ------ | --------------------------- |
| `/.well-known/oauth-authorization-server` | GET    | OAuth server metadata       |
| `/oauth/register`                         | POST   | Dynamic client registration |
| `/oauth/authorize`                        | GET    | Authorization endpoint      |
| `/oauth/token`                            | POST   | Token endpoint              |
| `/mcp`                                    | POST   | MCP JSON-RPC endpoint       |
| `/management/cleanup`                     | POST   | Cleanup inactive sessions   |
| `/health`                                 | GET    | Health check (custom)       |

---

## 🌐 Compatibility

| Target         | Support                  |
| -------------- | ------------------------ |
| Node.js        | ≥ 18                     |
| TypeScript     | ≥ 5.0                    |
| Module formats | ESM                      |
| HTTP clients   | Any (curl, fetch, axios) |

---

## 🆚 Alternatives

| Approach                    | OAuth | CORS | Performance | Session Mgmt |
| --------------------------- | ----- | ---- | ----------- | ------------ |
| **@coremcp/server-fastify** | ✅    | ✅   | ✅          | ✅           |
| Express + manual setup      | ❌    | 🔶   | 🔶          | ❌           |
| @coremcp/server-stdio       | ❌    | ❌   | ✅          | ✅           |

> **When to choose @coremcp/server-fastify?**
>
> - Building web APIs accessible over HTTP
> - You need OAuth 2.1 authentication
> - You want high-performance server with enterprise features

---

## 🚦 Security Features

### Built-in Security

- **OAuth 2.1 with PKCE** — Secure authorization flow
- **Dynamic client registration** — Automated client onboarding
- **Session management** — Secure session handling with cleanup
- **Request validation** — JSON-RPC message validation
- **Error handling** — Secure error responses without information leakage

### Production Hardening

```typescript
const server = new McpServer({
  serverInfo: { name: 'APIServer', version: '1.0.0' },
});

const transport = new HTTPTransport({
  mcpServer: server,
  port: 443,
  auth: {
    mode: 'built-in',
    config: {
      issuer: 'https://secure-api.company.com',
      disableDynamicClientRegistration: true, // Pre-registered clients only
      supportedScopes: ['mcp:read'], // Minimal scope
    },
  },
});

// Add security middleware
transport.server.addHook('onRequest', async (request, reply) => {
  // Security headers
  reply.headers({
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '1; mode=block',
  });
});
```

---

## 🗺️ Roadmap

### Completed Features (v1.0)

The following features are now available:

- **Session Management API** — Programmatic session control
  - ✅ `sessionIdGenerator` option (McpServer) - Custom session ID generation
  - ✅ `onSessionInitialized` callback (McpServer) - Session lifecycle hooks
  - ✅ `getActiveSessionCount()` method (HTTPTransport) - Get number of active sessions
  - ✅ POST /management/cleanup endpoint (HTTPTransport) - Administrative session cleanup

### Planned Features (Future)

- **Advanced CORS** — Fine-grained CORS control
  - `enableCors` boolean option
  - Custom CORS configuration

- **Pushed Authorization Requests (PAR)** — Full RFC 9126 support
  - Currently returns "not required" stub

- **Enhanced Test Coverage** — 90%+ coverage (currently ~50%)

- **Storage Interface Consolidation** — Unified OAuth storage API

See [PLAN.md](./PLAN.md) for detailed implementation roadmap.

---

## 🚦 Related Packages

This transport works with:

- `@coremcp/server` - Main MCP server (peer dependency)
- `@coremcp/client-http` - Client-side HTTP transport
- `@coremcp/server-stdio` - Alternative STDIO transport
- `fastify` - Underlying HTTP framework

---

## 🤝 Contributing

1. **Fork → feature branch → PR**
2. Follow [Conventional Commits](https://www.conventionalcommits.org/)
3. `pnpm lint && pnpm test` must pass

> See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.

---

## 🛡️ Security

Found a vulnerability? Email **security@coremcp.dev** — we respond within **48h**.

---

## 📜 License

**MIT** © 2025 — free for personal & commercial use. See [LICENSE](../../LICENSE).
