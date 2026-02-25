# @coremcp/client-http

> HTTP connector implementation for MCP clients — connect to MCP servers over HTTP with authentication support.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/client @coremcp/client-http
```

```typescript
import { McpClient } from '@coremcp/client';
import { HttpTransport } from '@coremcp/client-http';

// Connect to MCP server over HTTP
const client = new McpClient({
  name: 'MyApp',
  version: '1.0.0',
  servers: [
    {
      name: 'api-server',
      transport: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer token123' },
    },
  ],
});
```

---

## ✨ Key Features

| Feature                            | @coremcp/client-http | fetch() only |
| ---------------------------------- | -------------------- | ------------ |
| 🔌 **Transport abstraction**       | ✅                   | ❌           |
| 🔐 **OAuth 2.1 authentication**    | ✅                   | ❌           |
| 🎫 **Dynamic client registration** | ✅                   | ❌           |
| 🔄 **Automatic token refresh**     | ✅                   | ❌           |
| 📡 **Server-Sent Events (SSE)**    | ✅                   | ❌           |
| 🛡️ **Error handling**              | ✅                   | 🔶           |

_Top 3 reasons you'll love it_

- **OAuth 2.1 ready** — Full OAuth support with automatic client registration and token management
- **Seamless integration** — Drop-in HTTP connector for @coremcp/client
- **Standards compliant** — Implements RFC 7591 (dynamic registration), RFC 7636 (PKCE), and RFC 9728 (resource metadata)

---

## 😩 Problem → 💡 Solution

> **The pain**: Connecting MCP clients to HTTP-based servers requires custom fetch logic and error handling.
>
> **The fix**: @coremcp/client-http provides a standardized HTTP connector that integrates seamlessly with the MCP client.

---

## 🚀 Usage

### Basic HTTP Connection

```typescript
import { McpClient } from '@coremcp/client';

const client = new McpClient({
  name: 'WebApp',
  version: '2.1.0',
  servers: [
    {
      name: 'remote-tools',
      transport: 'http',
      url: 'https://tools.example.com/mcp',
    },
  ],
});

// Use tools from HTTP server
const result = await client.callTool('remote-tools', 'web_search', {
  query: 'MCP protocol documentation',
});
```

### Authentication Headers

```typescript
const client = new McpClient({
  name: 'AuthenticatedApp',
  version: '1.0.0',
  servers: [
    {
      name: 'secure-api',
      transport: 'http',
      url: 'https://api.mycompany.com/mcp',
      headers: {
        'Authorization': 'Bearer your-jwt-token',
        'X-API-Key': 'your-api-key',
        'X-Client-Version': '1.0.0',
      },
    },
  ],
});
```

### OAuth 2.1 Authentication

The HTTP connector provides robust OAuth 2.1 authentication powered by the industry-standard [`openid-client`](https://github.com/panva/node-openid-client) library with automatic token management, PKCE support, and proactive token refresh.

**Key Features**:

- 🔐 **OAuth 2.1** with PKCE (RFC 7636) for public clients
- 🔄 **Automatic Token Refresh** (proactive refresh 5 minutes before expiration)
- 🎫 **Dynamic Client Registration** (RFC 7591) when supported by authorization server
- 🛡️ **Secure by Default** - HTTPS-only endpoints, audience validation, state protection
- 📋 **RFC Compliance** - RFC 9728 (resource metadata), RFC 8707 (resource parameter)

#### Basic OAuth Flow

```typescript
import { HttpMcpConnector } from '@coremcp/client-http';
import { MemoryTokenStore } from '@coremcp/client-http/oauth';

const tokenStore = new MemoryTokenStore();

const connector = new HttpMcpConnector({
  name: 'oauth-server',
  url: 'https://api.example.com/mcp',
  oauth: {
    clientId: 'my-client-id', // Your OAuth client ID
    redirectUri: 'https://myapp.com/oauth/callback',
    tokenStore,
    onAuth: async (url) => {
      console.log('Please authorize:', url);
      // Open browser or display URL to user
      const code = await getUserAuthCode(); // Your implementation
      return code;
    },
  },
});

await connector.connect();
```

#### Advanced OAuth Configuration

```typescript
const connector = new HttpMcpConnector({
  name: 'oauth-server',
  url: 'https://api.example.com/mcp',
  oauth: {
    clientId: 'my-registered-client-id',
    redirectUri: 'https://myapp.com/oauth/callback',
    tokenStore,
    onAuth: async (url) => {
      // Handle authorization flow
      return await getAuthorizationCode(url);
    },
    additionalScopes: ['custom.scope'], // Optional extra scopes beyond server requirements
  },
});
```

**How OAuth Works in @coremcp/client-http**:

1. **Challenge Detection**: Server responds with `401 Unauthorized` + `WWW-Authenticate` header
2. **Metadata Discovery**: Connector fetches OAuth metadata via RFC 9728 resource metadata
3. **Authorization URL**: Generates authorization URL with PKCE code challenge
4. **User Authorization**: `onAuth` callback receives URL for user to authorize
5. **Token Exchange**: After user authorizes, call `submitAuthCode()` to exchange authorization code for tokens
6. **Automatic Refresh**: Tokens are automatically refreshed 5 minutes before expiration
7. **Secure Storage**: Tokens stored per-issuer in your `TokenStore` implementation

#### Token Store Implementation

Implement persistent token storage:

```typescript
import { TokenStore } from '@coremcp/client-http/oauth';

class PersistentTokenStore implements TokenStore {
  async getAccessToken(issuer: string): Promise<string | null> {
    return await db.getToken(issuer, 'access');
  }

  async getRefreshToken(issuer: string): Promise<string | null> {
    return await db.getToken(issuer, 'refresh');
  }

  async setTokens(
    issuer: string,
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number,
  ): Promise<void> {
    await db.saveTokens(issuer, { accessToken, refreshToken, expiresIn });
  }

  async getTokenExpiration(issuer: string): Promise<number | null> {
    return await db.getExpiration(issuer);
  }

  async clearTokens(issuer: string): Promise<void> {
    await db.deleteTokens(issuer);
  }
}
```

### Custom Headers and Configuration

```typescript
const client = new McpClient({
  name: 'EnterpriseApp',
  version: '3.0.0',
  servers: [
    {
      name: 'internal-tools',
      transport: 'http',
      url: 'https://internal.company.com/mcp',
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
        'X-Tenant-ID': 'tenant-123',
        'X-Request-ID': crypto.randomUUID(),
        'User-Agent': 'EnterpriseApp/3.0.0',
      },
    },
  ],
});

// The transport automatically includes these headers in all requests
```

### Multiple HTTP Servers

```typescript
const client = new McpClient({
  name: 'MultiServerApp',
  version: '1.0.0',
  servers: [
    {
      name: 'auth-service',
      transport: 'http',
      url: 'https://auth.example.com/mcp',
      headers: { 'X-Service': 'auth' },
    },
    {
      name: 'data-service',
      transport: 'http',
      url: 'https://data.example.com/mcp',
      headers: { 'X-Service': 'data' },
    },
    {
      name: 'ai-service',
      transport: 'http',
      url: 'https://ai.example.com/mcp',
      headers: { 'X-Service': 'ai' },
    },
  ],
});

// Use tools from different services
const userInfo = await client.callTool('auth-service', 'get_user', {
  id: '123',
});
const userData = await client.callTool('data-service', 'query', {
  sql: 'SELECT * FROM users',
});
const aiResponse = await client.callTool('ai-service', 'generate', {
  prompt: 'Hello',
});
```

### Direct Transport Usage

```typescript
import { HttpTransport } from '@coremcp/client-http';

// Create transport directly
const transport = new HttpTransport('https://api.example.com/mcp', {
  'Authorization': 'Bearer token',
  'Content-Type': 'application/json',
});

// Listen for responses
transport.on('message', (response) => {
  console.log('Received:', response);
});

// Send JSON-RPC message
await transport.send({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'calculate',
    arguments: { expression: '2 + 2' },
  },
});
```

### Error Handling

```typescript
const client = new McpClient({
  name: 'RobustApp',
  version: '1.0.0',
  servers: [
    {
      name: 'unreliable-server',
      transport: 'http',
      url: 'https://flaky.example.com/mcp',
    },
  ],
});

try {
  const result = await client.callTool(
    'unreliable-server',
    'risky_operation',
    {},
  );
} catch (error) {
  if (error.message.includes('HTTP error! status: 401')) {
    console.error('Authentication failed');
    // Handle auth error
  } else if (error.message.includes('HTTP error! status: 500')) {
    console.error('Server error');
    // Handle server error
  } else {
    console.error('Network or other error:', error);
  }
}
```

---

## 🧩 API Reference

### HttpTransport Class

| Method                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `constructor(url, headers)` | Create HTTP connector with URL and headers |
| `send(message)`             | Send JSON-RPC message via HTTP POST        |
| `close()`                   | Close transport (no-op for HTTP)           |

### Server Endpoint Configuration

| Property    | Type                     | Description              |
| ----------- | ------------------------ | ------------------------ |
| `name`      | `string`                 | Unique server identifier |
| `transport` | `'http'`                 | Transport type           |
| `url`       | `string`                 | HTTP endpoint URL        |
| `headers`   | `Record<string, string>` | Optional HTTP headers    |

### Events

| Event     | Description                            |
| --------- | -------------------------------------- |
| `message` | Emitted when HTTP response is received |
| `error`   | Emitted when HTTP request fails        |

---

## 🔧 HTTP Protocol Details

### Request Format

All requests are sent as `POST` to the configured URL with:

```http
POST /mcp HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer your-token

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { ... }
  }
}
```

### Response Handling

The transport expects standard JSON-RPC responses:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "Tool response" }]
  }
}
```

### Error Responses

HTTP errors are converted to meaningful exceptions:

- **401 Unauthorized** → Authentication error
- **403 Forbidden** → Permission error
- **404 Not Found** → Server not available
- **500 Internal Server Error** → Server error
- **Network errors** → Connection error

---

## 🌐 Compatibility

| Target         | Support             |
| -------------- | ------------------- |
| Node.js        | ≥ 18                |
| TypeScript     | ≥ 5.0               |
| Module formats | ESM                 |
| Browsers       | Modern (with fetch) |

---

## 🆚 Alternatives

| Approach                 | Integration | Headers | Events |
| ------------------------ | ----------- | ------- | ------ |
| **@coremcp/client-http** | ✅          | ✅      | ✅     |
| Custom fetch()           | ❌          | 🔶      | ❌     |
| Axios/other HTTP libs    | ❌          | ✅      | ❌     |

> **When to choose @coremcp/client-http?**
>
> - You're using @coremcp/client and need HTTP connectivity
> - You want standardized error handling and event support
> - You need easy header management for authentication

---

## 🚦 Related Packages

This transport works with:

- `@coremcp/client` - Main MCP client (peer dependency)
- `@coremcp/client-stdio` - Alternative stdio connector
- `@coremcp/server-fastify` - Server-side HTTP connector

---

## 🔄 Migration Guide

### Migrating from 0.0.x to 0.1.x

**Version 0.1.0** migrates from custom OAuth implementation to the industry-standard [`openid-client`](https://github.com/panva/node-openid-client) library for better standards compliance and maintainability.

#### ✅ No Changes Required for HttpMcpConnector Users

If you're using `HttpMcpConnector` class directly, **no code changes are required**. The public API remains unchanged:

```typescript
// This code works in both 0.0.x and 0.1.x
const connector = new HttpMcpConnector({
  name: 'my-server',
  url: 'https://api.example.com/mcp',
  oauth: {
    clientId: 'my-client-id',
    redirectUri: 'https://myapp.com/oauth/callback',
    tokenStore,
    onAuth: async (url) => {
      /* ... */
    },
  },
});
```

#### ⚠️ Breaking Changes for OAuth Utility Users

If you were using internal OAuth utility functions directly, these have been removed in favor of `openid-client`:

**Removed APIs**:

- `getAuthorizeUrl()` - Use `openid-client`'s `Issuer` and `Client` classes
- `getIssuerFromAuthHeader()` - Use `AuthorizationFlow.handleAuthorizationChallenge()`
- `validateTokenAudience()` - Handled automatically by `openid-client`
- `refreshAccessToken()` - Use `TokenRefreshManager`
- `registerDynamicClient()` - Use `openid-client`'s client registration

**Migration Path**:

```typescript
// OLD (0.0.x) - Custom OAuth utilities
import { getAuthorizeUrl } from '@coremcp/client-http/oauth';
const { url, codeVerifier } = await getAuthorizeUrl(
  authHeader,
  redirectUri,
  clientId,
);

// NEW (0.1.x) - Use openid-client directly or new flow modules
import { AuthorizationFlow } from '@coremcp/client-http/oauth';
import { OpenIdClientAdapter } from '@coremcp/client-http/oauth';

const adapter = new OpenIdClientAdapter(/* ... */);
const flow = new AuthorizationFlow(adapter /* ... */);
const { authUrl, state } = await flow.handleAuthorizationChallenge(
  authHeader,
  serverUrl,
);
```

**Benefits of Migration**:

- ✅ 85% code reduction (~1,697 lines removed)
- ✅ Better RFC compliance (OpenID Connect, OAuth 2.1)
- ✅ Industry-standard library with extensive testing
- ✅ Built-in support for DPoP, PAR, and other extensions
- ✅ Ongoing maintenance and security updates

**Need Help?** File an issue at https://github.com/alvis/coremcp-monorepo/issues

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
