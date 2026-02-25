# Core MCP Monorepo

> Complete TypeScript implementation of the Model Context Protocol (MCP) — the standard for connecting AI applications with external tools and data sources.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
# Install the CLI globally
npm install -g coremcp

# Start an MCP server in seconds
mcp-server start stdio

# Or create HTTP API with OAuth
mcp-server start http --port 8080 --oauth
```

```typescript
// Build MCP clients
import { McpClient } from '@coremcp/client';

const client = new McpClient({
  name: 'MyAI',
  version: '1.0.0',
  servers: [{ name: 'tools', transport: 'stdio', command: 'my-mcp-server' }],
});

const result = await client.callTool('tools', 'search_web', {
  query: 'MCP protocol',
});
```

---

## ✨ What is MCP?

The **Model Context Protocol (MCP)** is an open standard that enables AI applications to securely connect with external tools, data sources, and services. Instead of building M×N custom integrations, MCP creates a standardized M+N approach where:

- **AI Applications** implement MCP clients
- **Tool Providers** implement MCP servers
- **Everyone** speaks the same protocol

### Key Benefits

- 🔌 **Standardized Integration** — One protocol for all AI-tool connections
- 🛡️ **Enterprise Security** — Built-in OAuth 2.1 and session management
- 🚀 **Production Ready** — Type-safe, validated, and battle-tested
- 🔄 **Bi-directional** — Tools, resources, prompts, and real-time updates
- 📦 **Transport Agnostic** — Works over stdio, HTTP, or custom transports

---

## 🏗️ Architecture Overview

This monorepo provides a complete MCP implementation organized in clean architectural layers:

```
┌─────────────────────────────────┐
│        CLI Layer                │
│     coremcp (executable)        │
├─────────────────────────────────┤
│        Core Layer               │
│  @coremcp/client (McpClient)    │
│  @coremcp/server (McpServer)    │
├─────────────────────────────────┤
│      Transport Layer            │
│ @coremcp/client-transport-*     │
│ @coremcp/server-transport-*     │
├─────────────────────────────────┤
│       Common Layer              │
│ @coremcp/core (utilities)     │
├─────────────────────────────────┤
│      Foundation Layer           │
│ @coremcp/protocol (types)       │
└─────────────────────────────────┘
```

## 📦 Package Ecosystem

### 🏗️ Core Packages

| Package                                      | Description                 | Use Case                  |
| -------------------------------------------- | --------------------------- | ------------------------- |
| **[@coremcp/protocol](./packages/protocol)** | Protocol types & validation | Type-safe MCP development |
| **[@coremcp/core](./packages/common)**       | Shared utilities & sessions | Common infrastructure     |
| **[@coremcp/client](./packages/client)**     | MCP client implementation   | AI applications           |
| **[@coremcp/server](./packages/server)**     | MCP server implementation   | Tool providers            |

### 🚀 Transport Packages

| Package                                                            | Description            |
| ------------------------------------------------------------------ | ---------------------- |
| **[@coremcp/client-stdio](./packages/client-transport-stdio)**     | STDIO client transport |
| **[@coremcp/client-http](./packages/client-transport-http)**       | HTTP client transport  |
| **[@coremcp/server-stdio](./packages/server-transport-stdio)**     | STDIO server transport |
| **[@coremcp/server-fastify](./packages/server-transport-fastify)** | HTTP server transport  |

### 🛠️ CLI & Tools

| Package                       | Description          | Use Case                 |
| ----------------------------- | -------------------- | ------------------------ |
| **[coremcp](./packages/cli)** | Complete CLI toolkit | Development & deployment |

---

## 🚀 Getting Started

### For AI Application Developers (Client)

```bash
npm install @coremcp/client @coremcp/client-stdio
```

```typescript
import { McpClient } from '@coremcp/client';

// Connect to multiple MCP servers
const client = new McpClient({
  name: 'MyAI',
  version: '1.0.0',
  servers: [
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['mcp-server-filesystem', '/workspace'],
    },
    {
      name: 'database',
      transport: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer token123' },
    },
  ],
});

// Use tools from any connected server
const files = await client.callTool('filesystem', 'list_directory', {
  path: '/src',
});
const data = await client.callTool('database', 'execute_query', {
  sql: 'SELECT * FROM users',
});

// Access resources
const config = await client.readResource(
  'filesystem',
  'file:///etc/config.json',
);

// Use prompts
const codeReview = await client.getPrompt('database', 'code_review', {
  language: 'typescript',
  code: '...',
});
```

### For Tool Providers (Server)

```bash
npm install @coremcp/server @coremcp/server-stdio
```

```typescript
import { McpServer } from '@coremcp/server';
import { McpStdioServerTransport } from '@coremcp/server-stdio';

// Create MCP server with tools
const server = new McpServer({
  serverInfo: { name: 'MyTools', version: '1.0.0' },

  tools: [
    {
      name: 'calculate',
      description: 'Perform mathematical calculations',
      inputSchema: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'Math expression to evaluate',
          },
        },
        required: ['expression'],
      },
    },
  ],

  handlers: {
    handleCallTool: async (params, session) => {
      if (params.name === 'calculate') {
        try {
          const result = eval(params.arguments.expression); // Use safe-eval in production
          return {
            content: [{ type: 'text', text: String(result) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    },
  },
});

// Start with STDIO transport
const transport = new McpStdioServerTransport({ server });
await transport.start();
```

### HTTP Server with OAuth

```bash
npm install @coremcp/server @coremcp/server-fastify
```

```typescript
import { McpServer } from '@coremcp/server';
import { StreamableHTTPTransport } from '@coremcp/server-fastify';

const server = new McpServer({
  serverInfo: { name: 'WebAPI', version: '1.0.0' },

  handlers: {
    handleCallTool: async (params, session) => {
      // Access authenticated user
      console.log(`Tool called by user: ${session.user?.name}`);

      // Tool implementation...
    },
  },

  // User authentication from OAuth tokens
  resolveUserId: async (context) => {
    const token = context.headers?.authorization?.replace('Bearer ', '');
    if (token) {
      const user = await verifyJWT(token);
      return { id: user.sub, name: user.name, role: user.role };
    }
    return null;
  },
});

// HTTP transport with OAuth 2.1
const transport = new StreamableHTTPTransport({
  port: 8080,
  enableCors: true,
  oauth: {
    issuer: 'https://api.mycompany.com',
    supportedScopes: ['mcp:read', 'mcp:write'],
  },
});

await transport.start();
console.log('MCP server running at http://localhost:8080');

// OAuth endpoints automatically available:
// /.well-known/oauth-authorization-server
// /oauth/register, /oauth/authorize, /oauth/token
// /mcp (authenticated endpoint)
```

---

## 🛠️ CLI Development

The `coremcp` CLI provides instant development and deployment:

```bash
# Install CLI globally
npm install -g coremcp

# Start development server
mcp-server start stdio --log-level debug

# Start HTTP server with OAuth
mcp-server start http --port 8080 --oauth --cors

# Test with client
mcp-client connect stdio ./my-mcp-server
mcp-client list-tools
mcp-client call-tool echo --message "Hello, MCP!"

# Get server information
mcp-server info
```

---

## 🔧 Key Features

### 🔒 Enterprise Security

- **OAuth 2.1 with PKCE** — Complete authorization server implementation
- **Dynamic Client Registration** — RFC 7591 compliant client onboarding
- **Session Management** — Secure session handling with customizable storage
- **Input Validation** — Runtime JSON-RPC and schema validation

### 🚀 Production Ready

- **Multi-transport Support** — STDIO for processes, HTTP for web APIs
- **Type Safety** — Full TypeScript with runtime validation
- **Performance** — Built on Fastify for high-throughput HTTP
- **Monitoring** — Comprehensive logging and error handling

### 🧩 Developer Experience

- **Zero Config** — Works out of the box with sensible defaults
- **Hot Reload** — Development mode with automatic restarts
- **Rich CLI** — Complete tooling for development and deployment
- **Extensible** — Plugin architecture for custom capabilities

---

## 📋 Protocol Support

| Protocol Version | Status      | Features                               |
| ---------------- | ----------- | -------------------------------------- |
| **2024-11-05**   | ✅ Complete | Initial MCP specification              |
| **2025-03-26**   | ✅ Complete | Enhanced capabilities & error handling |
| **2025-06-18**   | ✅ Complete | Latest with streaming support          |

### Supported Capabilities

- ✅ **Tools** — Function calls with JSON schema validation
- ✅ **Resources** — File and data access with subscriptions
- ✅ **Prompts** — Template generation with argument completion
- ✅ **Sampling** — AI model integration for server-to-client requests
- ✅ **Elicitation** — Interactive user input collection
- ✅ **Logging** — Structured logging with level control
- ✅ **Progress** — Real-time operation progress reporting

---

## 🏢 Production Examples

### Microservice Architecture

```typescript
// API Gateway with MCP federation
const client = new McpClient({
  name: 'APIGateway',
  version: '2.0.0',
  servers: [
    { name: 'auth', transport: 'http', url: 'https://auth.company.com/mcp' },
    { name: 'users', transport: 'http', url: 'https://users.company.com/mcp' },
    {
      name: 'billing',
      transport: 'http',
      url: 'https://billing.company.com/mcp',
    },
    {
      name: 'analytics',
      transport: 'http',
      url: 'https://analytics.company.com/mcp',
    },
  ],
});

// Federated tool calls across services
const user = await client.callTool('users', 'get_user', { id: '123' });
const billing = await client.callTool('billing', 'get_subscription', {
  userId: '123',
});
const insights = await client.callTool('analytics', 'user_insights', {
  userId: '123',
});
```

### Enterprise Tool Server

```typescript
const server = new McpServer({
  serverInfo: { name: 'EnterpriseTools', version: '3.0.0' },

  handlers: {
    handleCallTool: async (params, session) => {
      // Role-based access control
      if (!session.user || !hasPermission(session.user, params.name)) {
        throw new Error('Insufficient permissions');
      }

      // Audit logging
      auditLog.info('Tool execution', {
        userId: session.user.id,
        tool: params.name,
        arguments: params.arguments,
        timestamp: new Date().toISOString(),
      });

      // Tool execution with enterprise integrations
      switch (params.name) {
        case 'deploy_application':
          return await kubernetesDeployment(params.arguments);
        case 'query_database':
          return await secureDbQuery(params.arguments, session.user);
        case 'send_notification':
          return await slackNotification(params.arguments);
      }
    },
  },

  // Custom session storage (Redis cluster)
  sessionStorage: new RedisSessionStorage({
    cluster: ['redis-1:6379', 'redis-2:6379', 'redis-3:6379'],
    ttl: 24 * 60 * 60, // 24 hours
  }),

  // LDAP/SAML user resolution
  resolveUserId: async (context) => {
    const token = extractBearerToken(context);
    return await ldapUserLookup(token);
  },
});
```

---

## 🧪 Testing & Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Watch mode for development
pnpm watch
```

### Package Development

```bash
# Work on specific package
cd packages/server
pnpm test --watch

# Test integration
cd packages/server-transport-fastify
pnpm test
```

---

## 🗺️ Roadmap

### ✅ Completed

- Complete MCP protocol implementation
- STDIO and HTTP transports
- OAuth 2.1 authentication
- Session management
- CLI tooling

### 🚧 In Progress

- Server-Sent Events (SSE) streaming
- Enhanced monitoring and observability
- Plugin ecosystem

### 📋 Planned

- **Q2 2025**: Distributed session storage backends
- **Q3 2025**: Plugin marketplace and registry
- **Q4 2025**: Multi-tenancy and enterprise features

---

## 🆚 vs Official TypeScript SDK

### Architecture Comparison

**CoreMCP** uses a modular monorepo architecture with enterprise-grade features, while the **[Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** prioritizes simplicity and developer accessibility.

| Feature                 | CoreMCP                                        | Official TypeScript SDK                |
| ----------------------- | ---------------------------------------------- | -------------------------------------- |
| **Architecture**        | Modular monorepo (9 packages)                  | Monolithic single package              |
| **Protocol Versions**   | All versions (2024-2025)                       | Latest version focus                   |
| **Type Safety**         | Full TypeScript + runtime validation           | TypeScript with basic validation       |
| **Authentication**      | OAuth 2.1 + PKCE + session management          | Simple authentication patterns         |
| **Transports**          | STDIO + HTTP with abstractions                 | STDIO + SSE with direct implementation |
| **Session Management**  | Enterprise session storage + cleanup           | Basic connection state                 |
| **Error Handling**      | Standardized JSON-RPC errors + logging         | Direct error propagation               |
| **Testing**             | Comprehensive test suites                      | Example-focused testing                |
| **Production Features** | Session storage, monitoring, graceful shutdown | Development-first approach             |
| **Learning Curve**      | Moderate (enterprise patterns)                 | Low (simple examples)                  |
| **Use Case**            | Production deployments, enterprise             | Prototyping, simple tools              |

### When to Choose Each

#### Choose **CoreMCP** when you need

- Production-ready MCP servers with enterprise features
- OAuth 2.1 authentication and session management
- Multiple protocol version support with validation
- Scalable architecture for large applications
- Comprehensive testing and monitoring capabilities
- Team development with strict type safety

#### Choose **Official SDK** when you need

- Quick prototyping and simple MCP tools
- Minimal dependencies and setup
- Educational or learning projects
- Direct examples and straightforward patterns
- Community-standard approach

### Code Comparison

**Official SDK** (Simple Server):

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'example-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const transport = new StdioServerTransport();
server.connect(transport);
```

**CoreMCP** (Production Server):

```typescript
import { McpServer } from '@coremcp/server';
import { McpStdioServerTransport } from '@coremcp/server-stdio';

const server = new McpServer({
  serverInfo: { name: 'production-server', version: '1.0.0' },
  tools: [...],
  handlers: { handleCallTool: async (params, session) => { ... } },
  sessionStorage: new RedisSessionStorage(),
  resolveUserId: async (context) => await authenticateUser(context)
});

const transport = new McpStdioServerTransport({ server });
await transport.start();
```

Both implementations are excellent choices depending on your specific requirements and deployment context.

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for:

- Code style and conventions
- Testing requirements
- Pull request process
- Issue reporting

### Development Setup

```bash
git clone https://github.com/alvis/coremcp-monorepo
cd coremcp-monorepo
pnpm install
pnpm build
pnpm test
```

---

## 📄 License

**MIT** © 2025 — Free for personal and commercial use.

See [LICENSE](LICENSE) for complete terms.

---

## 🔗 Links & Resources

- **[MCP Specification](https://modelcontextprotocol.io/)** — Official protocol documentation
- **[Architecture Guide](ARCHITECTURE.md)** — Deep dive into the codebase architecture
- **[API Documentation](https://docs.coremcp.dev)** — Complete API reference
- **[Examples Repository](https://github.com/alvis/coremcp-examples)** — Sample implementations
- **[Discord Community](https://discord.gg/mcp)** — Join the conversation

---

<div align="center">

**⭐ Star this repo if Core MCP helps you build better AI integrations!**

[Report Bug](https://github.com/alvis/coremcp-monorepo/issues) · [Request Feature](https://github.com/alvis/coremcp-monorepo/issues) · [Ask Question](https://github.com/alvis/coremcp-monorepo/discussions)

</div>
