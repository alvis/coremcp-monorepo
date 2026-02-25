# @coremcp/client-stdio

> stdio connector implementation for MCP clients — spawn and communicate with MCP servers via stdin/stdout.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/client @coremcp/client-stdio
```

```typescript
import { McpClient } from '@coremcp/client';

// Connect to MCP server via process spawning
const client = new McpClient({
  name: 'MyApp',
  version: '1.0.0',
  servers: [
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['mcp-server-filesystem', '/home/user/documents'],
    },
  ],
});
```

---

## ✨ Key Features

| Feature                      | @coremcp/client-stdio | child_process only |
| ---------------------------- | --------------------- | ------------------ |
| 🔌 **Transport abstraction** | ✅                    | ❌                 |
| 📡 **Event-based messaging** | ✅                    | 🔶                 |
| 🛡️ **Error handling**        | ✅                    | 🔶                 |
| 🔄 **Message buffering**     | ✅                    | ❌                 |
| 🧹 **Cleanup management**    | ✅                    | 🔶                 |

_Top 3 reasons you'll love it_

- **Process management** — Automatic spawning, communication, and cleanup of MCP server processes
- **Message parsing** — Handles newline-delimited JSON-RPC messages with proper buffering
- **Error resilience** — Graceful handling of process errors and malformed messages

---

## 😩 Problem → 💡 Solution

> **The pain**: Spawning and communicating with MCP servers via stdin/stdout requires complex process management and message parsing.
>
> **The fix**: @coremcp/client-stdio handles all the complexity — just provide a command and start communicating.

---

## 🚀 Usage

### Basic Process Spawning

```typescript
import { McpClient } from '@coremcp/client';

const client = new McpClient({
  name: 'FileBrowser',
  version: '1.0.0',
  servers: [
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['mcp-server-filesystem', '/workspace'],
    },
  ],
});

// Use filesystem tools
const files = await client.callTool('filesystem', 'list_directory', {
  path: '/workspace/src',
});
```

### Python MCP Servers

```typescript
const client = new McpClient({
  name: 'DataAnalyzer',
  version: '2.0.0',
  servers: [
    {
      name: 'data-tools',
      transport: 'stdio',
      command: 'python',
      args: ['-m', 'mcp_server_data', '--config', '/etc/data-config.json'],
    },
  ],
});

// Use Python-based data tools
const analysis = await client.callTool('data-tools', 'analyze_csv', {
  file_path: '/data/sales.csv',
  columns: ['date', 'revenue'],
});
```

### Custom Binary Servers

```typescript
const client = new McpClient({
  name: 'SystemAdmin',
  version: '1.0.0',
  servers: [
    {
      name: 'system-tools',
      transport: 'stdio',
      command: '/usr/local/bin/mcp-system-server',
      args: ['--verbose', '--allow-sudo'],
    },
  ],
});

// Use system administration tools
const status = await client.callTool('system-tools', 'check_service', {
  service_name: 'nginx',
});
```

### Environment Variables

```typescript
const client = new McpClient({
  name: 'DevTools',
  version: '1.0.0',
  servers: [
    {
      name: 'development',
      transport: 'stdio',
      command: 'node',
      args: ['./dev-server.js'],
      env: {
        NODE_ENV: 'development',
        DEBUG: '1',
        DATABASE_URL: 'postgresql://localhost/dev',
      },
    },
  ],
});
```

### Multiple STDIO Servers

```typescript
const client = new McpClient({
  name: 'MultiToolApp',
  version: '1.0.0',
  servers: [
    {
      name: 'git-tools',
      transport: 'stdio',
      command: 'npx',
      args: ['mcp-server-git'],
    },
    {
      name: 'docker-tools',
      transport: 'stdio',
      command: 'python',
      args: ['-m', 'mcp_docker_server'],
    },
    {
      name: 'aws-tools',
      transport: 'stdio',
      command: './aws-mcp-server',
      args: ['--region', 'us-east-1'],
    },
  ],
});

// Use tools from different servers
const gitStatus = await client.callTool('git-tools', 'status', {});
const containers = await client.callTool('docker-tools', 'list_containers', {});
const buckets = await client.callTool('aws-tools', 'list_s3_buckets', {});
```

### Direct Transport Usage

```typescript
import { StdioTransport } from '@coremcp/client-stdio';

// Create transport directly
const transport = new StdioTransport('npx', ['mcp-server-filesystem']);

// Listen for messages
transport.on('message', (message) => {
  console.log('Received:', message);
});

// Listen for errors
transport.on('error', (error) => {
  console.error('Process error:', error);
});

// Listen for process close
transport.on('close', (code) => {
  console.log('Process exited with code:', code);
});

// Send JSON-RPC message
await transport.send({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'read_file',
    arguments: { path: '/etc/hosts' },
  },
});

// Clean up
await transport.close();
```

### Error Handling

```typescript
const client = new McpClient({
  name: 'RobustApp',
  version: '1.0.0',
  servers: [
    {
      name: 'flaky-server',
      transport: 'stdio',
      command: './flaky-mcp-server',
    },
  ],
});

try {
  await client.connect({
    name: 'flaky-server',
    transport: 'stdio',
    command: './non-existent-server',
  });
} catch (error) {
  console.error('Failed to connect to server:', error.message);
  // Handle connection errors
}

// Server process monitoring
const server = client.getServer('flaky-server');
if (server) {
  server.on('error', (error) => {
    console.error('Server process error:', error);
    // Implement restart logic
  });

  server.on('close', (code) => {
    console.log(`Server exited with code: ${code}`);
    // Handle server shutdown
  });
}
```

---

## 🧩 API Reference

### StdioTransport Class

| Method                       | Description                              |
| ---------------------------- | ---------------------------------------- |
| `constructor(command, args)` | Spawn process with command and arguments |
| `send(message)`              | Send JSON-RPC message via stdin          |
| `close()`                    | Terminate process and cleanup            |

### Server Endpoint Configuration

| Property    | Type                     | Description              |
| ----------- | ------------------------ | ------------------------ |
| `name`      | `string`                 | Unique server identifier |
| `transport` | `'stdio'`                | Transport type           |
| `command`   | `string`                 | Executable command       |
| `args`      | `string[]`               | Command line arguments   |
| `env`       | `Record<string, string>` | Environment variables    |

### Events

| Event     | Description                            |
| --------- | -------------------------------------- |
| `message` | Emitted when JSON-RPC message received |
| `error`   | Emitted when process encounters error  |
| `close`   | Emitted when process terminates        |

---

## 🔧 Process Communication Details

### Message Protocol

All communication uses newline-delimited JSON-RPC 2.0:

**Client → Server (stdin):**

```
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"example","arguments":{}}}

```

**Server → Client (stdout):**

```
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Result"}]}}

```

### Process Management

- **Spawning**: Uses Node.js `child_process.spawn()` with piped stdio
- **Communication**: stdin/stdout for JSON-RPC, stderr inherited for logging
- **Buffering**: Handles partial messages and accumulates complete JSON lines
- **Cleanup**: Automatic process termination on transport close

### Error Handling

The transport handles various error scenarios:

- **Process spawn errors** → `error` event
- **Process crashes** → `close` event with exit code
- **Malformed JSON** → Silently ignored (logged in debug mode)
- **Stdin write errors** → Promise rejection

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

| Approach                  | Integration | Buffering | Events |
| ------------------------- | ----------- | --------- | ------ |
| **@coremcp/client-stdio** | ✅          | ✅        | ✅     |
| Raw child_process.spawn() | ❌          | ❌        | 🔶     |
| Other process libraries   | ❌          | 🔶        | 🔶     |

> **When to choose @coremcp/client-stdio?**
>
> - You're using @coremcp/client with local MCP servers
> - You want robust process management and error handling
> - You need cross-platform compatibility

---

## 🚦 Common Server Commands

### Node.js Servers

```typescript
{
  command: 'npx',
  args: ['mcp-server-package', ...options]
}
```

### Python Servers

```typescript
{
  command: 'python',
  args: ['-m', 'mcp_server_module', ...options]
}
```

### Binary Servers

```typescript
{
  command: '/path/to/mcp-server',
  args: ['--config', '/etc/config.json']
}
```

---

## 🚦 Related Packages

This transport works with:

- `@coremcp/client` - Main MCP client (peer dependency)
- `@coremcp/client-http` - Alternative HTTP connector
- `@coremcp/server-stdio` - Server-side stdio connector

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
