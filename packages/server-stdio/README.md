# @coremcp/server-stdio

> STDIO transport implementation for MCP servers — enable process-based communication with AI applications.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/server @coremcp/server-stdio
```

```typescript
import { McpServer } from '@coremcp/server';
import { McpStdioServerTransport } from '@coremcp/server-stdio';

// Create MCP server with STDIO transport
const server = new McpServer({
  serverInfo: { name: 'MyMCPServer', version: '1.0.0' },
  handlers: {
    handleCallTool: async (params) => {
      // Tool implementations
    },
  },
});

const transport = new McpStdioServerTransport({ server });
await transport.start();
```

---

## ✨ Key Features

| Feature                      | @coremcp/server-stdio | Raw stdin/stdout |
| ---------------------------- | --------------------- | ---------------- |
| 🔌 **Transport abstraction** | ✅                    | ❌               |
| 📡 **Message parsing**       | ✅                    | ❌               |
| 🛡️ **Error handling**        | ✅                    | ❌               |
| 🔄 **Session management**    | ✅                    | ❌               |
| 📝 **Protocol validation**   | ✅                    | ❌               |

_Top 3 reasons you'll love it_

- **Zero-config process communication** — Perfect for CLI tools and spawned processes
- **Robust message handling** — Proper JSON-RPC parsing with comprehensive error handling
- **Session lifecycle** — Automatic session initialization and management

---

## 😩 Problem → 💡 Solution

> **The pain**: Building MCP servers that communicate via stdin/stdout requires complex message parsing and session management.
>
> **The fix**: @coremcp/server-stdio handles all protocol details — focus on your tools, not transport mechanics.

---

## 🚀 Usage

### Basic Server Setup

```typescript
import { McpServer } from '@coremcp/server';
import { McpStdioServerTransport } from '@coremcp/server-stdio';

const server = new McpServer({
  serverInfo: {
    name: 'FileSystemServer',
    version: '1.2.0',
  },

  handlers: {
    handleCallTool: async (params, session) => {
      switch (params.name) {
        case 'read_file':
          const content = await fs.readFile(params.arguments.path, 'utf8');
          return {
            content: [{ type: 'text', text: content }],
          };

        case 'list_directory':
          const files = await fs.readdir(params.arguments.path);
          return {
            content: [{ type: 'text', text: files.join('\n') }],
          };
      }
    },
  },
});

// Create and start STDIO transport
const transport = new McpStdioServerTransport({ server });
await transport.start();

// Server is now listening on stdin/stdout
console.error('MCP FileSystem server started'); // Use stderr for logging
```

### CLI Tool Pattern

```typescript
#!/usr/bin/env node
import { McpServer } from '@coremcp/server';
import { McpStdioServerTransport } from '@coremcp/server-stdio';

const server = new McpServer({
  serverInfo: { name: 'calculator', version: '1.0.0' },

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

  handlers: {
    handleCallTool: async (params) => {
      if (params.name === 'add') {
        const result = params.arguments.a + params.arguments.b;
        return {
          content: [{ type: 'text', text: String(result) }],
        };
      }
    },
  },
});

// Graceful shutdown handling
const transport = new McpStdioServerTransport({ server });

process.on('SIGINT', async () => {
  console.error('\nShutting down...');
  await transport.stop();
  process.exit(0);
});

await transport.start();
```

### Package.json Binary

```json
{
  "name": "my-mcp-tools",
  "bin": {
    "my-mcp-server": "./dist/index.js"
  },
  "scripts": {
    "start": "node ./dist/index.js"
  }
}
```

### Development Server

```typescript
import { McpServer } from '@coremcp/server';
import { McpStdioServerTransport } from '@coremcp/server-stdio';

const server = new McpServer({
  serverInfo: { name: 'dev-tools', version: '1.0.0' },

  handlers: {
    handleListTools: async () => ({
      tools: [
        {
          name: 'run_command',
          description: 'Execute shell commands',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string' },
              cwd: { type: 'string' },
            },
          },
        },
      ],
    }),

    handleCallTool: async (params) => {
      if (params.name === 'run_command') {
        const { command, cwd = process.cwd() } = params.arguments;

        try {
          const result = await execAsync(command, { cwd });
          return {
            content: [{ type: 'text', text: result.stdout }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error.message}\n${error.stderr}`,
              },
            ],
            isError: true,
          };
        }
      }
    },
  },

  // Log to stderr to not interfere with JSON-RPC
  log: (level, message, meta) => {
    console.error(`[${level}] ${message}`, meta);
  },
});

const transport = new McpStdioServerTransport({ server });
await transport.start();
```

### Resource Server

```typescript
const server = new McpServer({
  serverInfo: { name: 'document-server', version: '1.0.0' },

  handlers: {
    handleListResources: async () => {
      const files = await fs.readdir('/documents');
      return {
        resources: files
          .filter((f) => f.endsWith('.md'))
          .map((file) => ({
            uri: `file:///documents/${file}`,
            name: file,
            description: `Markdown document: ${file}`,
            mimeType: 'text/markdown',
          })),
      };
    },

    handleReadResource: async (params) => {
      if (params.uri.startsWith('file:///documents/')) {
        const path = params.uri.replace('file://', '');
        const content = await fs.readFile(path, 'utf8');

        return {
          contents: [
            {
              uri: params.uri,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      }

      throw new Error('Resource not found');
    },
  },
});

const transport = new McpStdioServerTransport({ server });
await transport.start();
```

### Environment-based Configuration

```typescript
const server = new McpServer({
  serverInfo: {
    name: process.env.MCP_SERVER_NAME || 'generic-server',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
  },

  handlers: {
    handleCallTool: async (params, session) => {
      // Access environment in handlers
      const apiKey = process.env.API_KEY;
      const baseUrl = process.env.BASE_URL || 'https://api.example.com';

      // Tool implementation using env vars
    },
  },

  // Conditional logging based on debug mode
  log: process.env.DEBUG
    ? (level, msg, meta) => console.error(`[${level}] ${msg}`, meta)
    : undefined,
});

const transport = new McpStdioServerTransport({ server });
await transport.start();
```

---

## 🧩 API Reference

### McpStdioServerTransport Class

| Method                 | Description                        |
| ---------------------- | ---------------------------------- |
| `constructor(options)` | Create STDIO transport with server |
| `start()`              | Begin listening on stdin           |
| `stop()`               | Stop transport and cleanup         |

### Transport Options

| Property | Type        | Description               |
| -------- | ----------- | ------------------------- |
| `server` | `McpServer` | MCP server instance       |
| `log`    | `Log`       | Optional logging function |

### Message Flow

1. **Client → Server (stdin)**: JSON-RPC requests
2. **Server → Client (stdout)**: JSON-RPC responses
3. **Server → stderr**: Logging and debug output

---

## 🔧 Protocol Details

### Message Format

All communication uses newline-delimited JSON-RPC 2.0:

**Initialize request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "clientInfo": { "name": "Claude", "version": "1.0" },
    "capabilities": {}
  }
}
```

**Tool call request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/etc/hosts" }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{ "type": "text", "text": "file contents..." }]
  }
}
```

### Error Handling

The transport automatically handles:

- **JSON parsing errors** → Logged, no response sent
- **Protocol validation errors** → Error response with details
- **Uninitialized session** → INVALID_REQUEST error
- **Embedded newlines** → Runtime error (prevents protocol corruption)

### Logging Guidelines

Since stdout is used for JSON-RPC communication:

- ✅ **Use stderr** for all logging: `console.error()`
- ✅ **Log to files** for production
- ❌ **Avoid stdout** completely (breaks protocol)

---

## 🌐 Compatibility

| Target         | Support        |
| -------------- | -------------- |
| Node.js        | ≥ 18           |
| TypeScript     | ≥ 5.0          |
| Module formats | ESM            |
| OS             | Cross-platform |

---

## 🆚 Alternatives

| Approach                      | Integration | Parsing | Session | Validation |
| ----------------------------- | ----------- | ------- | ------- | ---------- |
| **@coremcp/server-stdio**     | ✅          | ✅      | ✅      | ✅         |
| Raw readline + manual parsing | ❌          | 🔶      | ❌      | ❌         |
| Other JSON-RPC libraries      | ❌          | ✅      | ❌      | 🔶         |

> **When to choose @coremcp/server-stdio?**
>
> - Building CLI tools or spawnable MCP servers
> - You want zero-config process communication
> - You need robust JSON-RPC protocol handling

---

## 🚦 Deployment Patterns

### NPX Distribution

```json
{
  "name": "my-mcp-tools",
  "bin": {
    "my-tools": "./dist/server.js"
  }
}
```

Usage: `npx my-mcp-tools`

### Global Installation

```bash
npm install -g my-mcp-tools
my-tools  # Available globally
```

### Python Integration

```python
import subprocess
import json

process = subprocess.Popen(
    ['node', 'mcp-server.js'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True
)

# Send initialization
init_msg = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {...}
}
process.stdin.write(json.dumps(init_msg) + '\n')
```

---

## 🚦 Related Packages

This transport works with:

- `@coremcp/server` - Main MCP server (peer dependency)
- `@coremcp/client-stdio` - Client-side STDIO transport
- `@coremcp/server-fastify` - Alternative HTTP transport

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
