# @coremcp/server

> Production-ready MCP server implementation — build powerful tool providers for AI applications with enterprise features.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/server @coremcp/server-stdio
```

```typescript
import { McpServer } from '@coremcp/server';

// Create MCP server with tools
const server = new McpServer({
  serverInfo: { name: 'MyTools', version: '1.0.0' },
  tools: [
    {
      name: 'calculate',
      description: 'Perform mathematical calculations',
      inputSchema: {
        type: 'object',
        properties: { expression: { type: 'string' } },
      },
    },
  ],
  handlers: {
    handleCallTool: async (params) => {
      if (params.name === 'calculate') {
        return {
          content: [{ type: 'text', text: eval(params.arguments.expression) }],
        };
      }
    },
  },
});
```

---

## ✨ Key Features

| Feature                           | @coremcp/server | Custom MCP server |
| --------------------------------- | --------------- | ----------------- |
| 🎯 **Handler-based architecture** | ✅              | ❌                |
| 🔒 **Session management**         | ✅              | ❌                |
| 🛡️ **User authentication**        | ✅              | ❌                |
| 📡 **Transport abstraction**      | ✅              | ❌                |
| ⚡ **Capability auto-detection**  | ✅              | ❌                |

_Top 3 reasons you'll love it_

- **Handler-based extensibility** — Clean separation between protocol handling and business logic
- **Enterprise session management** — Built-in user auth, session persistence, and activity tracking
- **Transport agnostic** — Works with stdio, HTTP, or custom transport implementations

---

## 😩 Problem → 💡 Solution

> **The pain**: Building MCP servers requires complex protocol handling, session management, and capability negotiation.
>
> **The fix**: @coremcp/server provides a production-ready foundation — focus on your tools and business logic, not infrastructure.

---

## 🚀 Usage

### Basic Server Setup

```typescript
import { McpServer } from '@coremcp/server';

const server = new McpServer({
  serverInfo: {
    name: 'CalculatorServer',
    version: '1.2.0',
  },

  // Static tool definitions
  tools: [
    {
      name: 'add',
      description: 'Add two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
    },
  ],

  // Handler functions for dynamic behavior
  handlers: {
    handleCallTool: async (params, session) => {
      switch (params.name) {
        case 'add':
          const { a, b } = params.arguments;
          return {
            content: [
              {
                type: 'text',
                text: `${a} + ${b} = ${a + b}`,
              },
            ],
          };
        default:
          throw new Error(`Unknown tool: ${params.name}`);
      }
    },
  },
});
```

### Dynamic Tool Management

```typescript
const server = new McpServer({
  serverInfo: { name: 'DynamicServer', version: '1.0.0' },

  handlers: {
    // Dynamically list available tools
    handleListTools: async (params, session) => {
      return {
        tools: [
          {
            name: 'current_time',
            description: 'Get current timestamp',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'user_info',
            description: 'Get current user information',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
    },

    handleCallTool: async (params, session) => {
      switch (params.name) {
        case 'current_time':
          return {
            content: [
              {
                type: 'text',
                text: new Date().toISOString(),
              },
            ],
          };

        case 'user_info':
          return {
            content: [
              {
                type: 'text',
                text: `User: ${session.user?.name || 'Anonymous'}`,
              },
            ],
          };
      }
    },
  },
});
```

### Resource Management

```typescript
const server = new McpServer({
  serverInfo: { name: 'FileServer', version: '1.0.0' },

  handlers: {
    handleListResources: async (params, session) => {
      const files = await fs.readdir('/data');
      return {
        resources: files.map((file) => ({
          uri: `file:///data/${file}`,
          name: file,
          mimeType: 'text/plain',
        })),
      };
    },

    handleReadResource: async (params, session) => {
      if (params.uri.startsWith('file:///data/')) {
        const filePath = params.uri.replace('file://', '');
        const content = await fs.readFile(filePath, 'utf8');
        return {
          contents: [
            {
              uri: params.uri,
              mimeType: 'text/plain',
              text: content,
            },
          ],
        };
      }
      throw new Error('Resource not found');
    },

    // Enable resource subscriptions
    handleSubscribe: async (params, session) => {
      // Set up file watching for the resource
      const watcher = fs.watch(params.uri.replace('file://', ''));
      // Store watcher in session or global state
    },
  },
});
```

### Prompt Management

```typescript
const server = new McpServer({
  serverInfo: { name: 'PromptServer', version: '1.0.0' },

  handlers: {
    handleListPrompts: async (params, session) => {
      return {
        prompts: [
          {
            name: 'code_review',
            description: 'Review code for best practices',
            arguments: [
              {
                name: 'language',
                description: 'Programming language',
                required: true,
              },
              { name: 'code', description: 'Code to review', required: true },
            ],
          },
        ],
      };
    },

    handleGetPrompt: async (params, session) => {
      if (params.name === 'code_review') {
        const { language, code } = params.arguments || {};
        return {
          description: 'Code review prompt',
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please review this ${language} code for best practices:\n\n${code}`,
              },
            },
          ],
        };
      }
    },

    // Auto-completion for prompt arguments
    handleComplete: async (params, session) => {
      if (
        params.ref.type === 'ref/prompt' &&
        params.argument?.name === 'language'
      ) {
        return {
          completion: {
            values: ['javascript', 'typescript', 'python', 'rust'].filter(
              (lang) => lang.startsWith(params.argument.value),
            ),
          },
        };
      }
    },
  },
});
```

### User Authentication & Sessions

```typescript
interface User {
  id: string;
  name: string;
  role: 'admin' | 'user';
  permissions: string[];
}

const server = new McpServer<User>({
  serverInfo: { name: 'SecureServer', version: '1.0.0' },

  // Resolve user from connection context
  resolveUserId: async (context) => {
    const token = context.headers?.authorization?.replace('Bearer ', '');
    if (!token) return null;

    // Verify JWT token and extract user info
    const user = await verifyToken(token);
    return {
      id: user.sub,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    };
  },

  handlers: {
    handleCallTool: async (params, session) => {
      // Access authenticated user
      if (!session.user) {
        throw new Error('Authentication required');
      }

      // Check permissions
      if (params.name === 'admin_tool' && session.user.role !== 'admin') {
        throw new Error('Admin access required');
      }

      // Tool implementation...
    },
  },
});
```

### Session Storage

```typescript
import { MemoryStorage } from '@coremcp/core';

// Use custom session storage
const server = new McpServer({
  serverInfo: { name: 'PersistentServer', version: '1.0.0' },
  sessionStorage: new MemoryStorage(), // or RedisStorage, DatabaseStorage, etc.

  handlers: {
    handleCallTool: async (params, session) => {
      // Session state is automatically persisted
      session.addMessage({
        method: 'tools/call',
        params,
        id: Math.random().toString(),
      });

      // Access session history
      console.log(`Session has ${session.messages.length} messages`);
    },
  },
});
```

---

## 🧩 API Reference

### McpServer Class

| Method                      | Description                       |
| --------------------------- | --------------------------------- |
| `new McpServer(options)`    | Create server with configuration  |
| `handleMessage(msg, ctx)`   | Process incoming JSON-RPC message |
| `initializeSession(params)` | Initialize new client session     |

### Handler Interface

| Handler               | Description                   |
| --------------------- | ----------------------------- |
| `handleListTools`     | List available tools          |
| `handleCallTool`      | Execute tool with parameters  |
| `handleListResources` | List available resources      |
| `handleReadResource`  | Read resource content         |
| `handleListPrompts`   | List available prompts        |
| `handleGetPrompt`     | Get prompt template           |
| `handleComplete`      | Provide auto-completions      |
| `handleSubscribe`     | Subscribe to resource changes |

### Server Options

| Option           | Type             | Description                  |
| ---------------- | ---------------- | ---------------------------- |
| `serverInfo`     | `AppInfo`        | Server name and version      |
| `tools`          | `Tool[]`         | Static tool definitions      |
| `prompts`        | `Prompt[]`       | Static prompt definitions    |
| `resources`      | `Resource[]`     | Static resource definitions  |
| `handlers`       | `ServerHandler`  | Dynamic method handlers      |
| `sessionStorage` | `SessionStorage` | Session persistence backend  |
| `resolveUserId`  | `ResolveUser`    | User authentication function |

---

## 🔧 Transport Integration

@coremcp/server works with pluggable transport implementations:

```typescript
import { McpServer } from '@coremcp/server';
import { StdioTransport } from '@coremcp/server-stdio';
import { HttpTransport } from '@coremcp/server-fastify';

const server = new McpServer({
  /* config */
});

// STDIO transport for process communication
const stdioTransport = new StdioTransport({ server });
await stdioTransport.start();

// HTTP transport for web APIs
const httpTransport = new HttpTransport({
  server,
  port: 8080,
  cors: true,
});
await httpTransport.start();
```

---

## 🌐 Compatibility

| Target         | Support     |
| -------------- | ----------- |
| Node.js        | ≥ 18        |
| TypeScript     | ≥ 5.0       |
| Module formats | ESM         |
| Transports     | STDIO, HTTP |

---

## 🆚 vs Official TypeScript SDK

### @coremcp/server vs Official MCP SDK

| Feature                    | @coremcp/server                      | Official MCP SDK                 |
| -------------------------- | ------------------------------------ | -------------------------------- |
| **Architecture**           | Handler-based abstraction            | Direct protocol implementation   |
| **Type Safety**            | Full TypeScript + runtime validation | TypeScript with basic validation |
| **Session Management**     | Enterprise session storage + cleanup | Basic connection state           |
| **User Authentication**    | Built-in with resolveUserId function | Manual implementation required   |
| **Transport Abstraction**  | Pluggable transport layer            | Direct transport usage           |
| **Capability Declaration** | Auto-detected from handlers          | Manual configuration             |
| **Error Handling**         | Standardized JSON-RPC errors         | Basic error propagation          |
| **Production Features**    | Session persistence, monitoring      | Development-focused              |

### When to Choose Each

#### Choose **@coremcp/server** when you need

- Production-ready MCP servers with enterprise features
- Built-in session management and user authentication
- Handler-based extensibility for complex business logic
- Multiple transport support with clean abstractions
- Automatic capability declaration and protocol validation

#### Choose **Official SDK** when you need

- Simple MCP servers with minimal dependencies
- Direct control over protocol implementation
- Educational or learning projects
- Quick prototyping with straightforward patterns

### Code Comparison

**Official SDK** approach:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({
  name: "example-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [...] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Direct protocol handling
  return { content: [...] };
});
```

**@coremcp/server** approach:

```typescript
import { McpServer } from '@coremcp/server';

const server = new McpServer({
  serverInfo: { name: 'example-server', version: '1.0.0' },

  handlers: {
    handleListTools: async (params, session) => {
      return { tools: [...] };
    },

    handleCallTool: async (params, session) => {
      // Access session, user auth, and abstractions
      return { content: [...] };
    }
  }
});
```

Both are excellent choices depending on your specific requirements and deployment context.

---

## 🚦 Transport Packages

@coremcp/server works with pluggable transport implementations:

- `@coremcp/server-stdio` - Process-based communication
- `@coremcp/server-fastify` - HTTP-based communication with OAuth

```bash
# Install transport packages as needed
npm i @coremcp/server-stdio
npm i @coremcp/server-fastify
```

---

## 🤝 Contributing

1. **Fork → feature branch → PR**
2. Follow [Conventional Commits](https://www.conventionalcommits.org/)
3. `pnpm lint && pnpm test` must pass

> See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.

---

## 🛡️ Security

Found a vulnerability? Email **<security@coremcp.dev>** — we respond within **48h**.

---

## 📜 License

**MIT** © 2025 — free for personal & commercial use. See [LICENSE](../../LICENSE).
