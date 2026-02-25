# @coremcp/client

> Production-ready MCP client with multi-server management — connect AI applications to any MCP server with ease.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/client @coremcp/client-stdio
```

```typescript
import { McpClient } from '@coremcp/client';

// Connect to multiple MCP servers
const client = new McpClient({
  name: 'MyAIApp',
  version: '1.0.0',
  servers: [
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'mcp-server-filesystem',
    },
    { name: 'database', transport: 'http', url: 'http://localhost:8080/mcp' },
  ],
});

// Use tools from any connected server
const result = await client.callTool('filesystem', 'read_file', {
  path: '/etc/config.json',
});
```

---

## ✨ Key Features

| Feature                      | @coremcp/client | Custom MCP client |
| ---------------------------- | --------------- | ----------------- |
| 🔗 **Multi-server support**  | ✅              | ❌                |
| 🛠️ **Manager pattern**       | ✅              | ❌                |
| 🔄 **Auto-reconnection**     | ✅              | ❌                |
| 📡 **Connector abstraction** | ✅              | ❌                |
| 🎯 **Type-safe operations**  | ✅              | ❌                |

_Top 3 reasons you'll love it_

- **Multi-server ready** — Connect to multiple MCP servers simultaneously with unified API
- **Manager-based organization** — Clean separation of tools, resources, and prompts
- **Transport agnostic** — Works with stdio, HTTP, or custom transport implementations

---

## 😩 Problem → 💡 Solution

> **The pain**: Building AI applications requires integrating with multiple MCP servers, each with different tools and capabilities.
>
> **The fix**: @coremcp/client provides a unified interface for managing multiple MCP connections — one client, unlimited integrations.

---

## 🚀 Usage

### Basic Client Setup

```typescript
import { McpClient } from '@coremcp/client';

const client = new McpClient({
  name: 'MyAIAssistant',
  version: '2.1.0',
  // Optional: Connect to servers during initialization
  servers: [
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx mcp-server-filesystem',
      args: ['/home/user/projects'],
    },
  ],
});

// Client is ready to use
console.log('Connected servers:', Object.keys(client.servers));
```

### Multi-Server Management

```typescript
// Connect to additional servers dynamically
await client.connect({
  name: 'database',
  transport: 'http',
  url: 'https://api.example.com/mcp',
  headers: { Authorization: 'Bearer token123' },
});

await client.connect({
  name: 'search',
  transport: 'stdio',
  command: 'python',
  args: ['-m', 'search_server'],
});

// List all connected servers
const servers = client.listServers();
console.log(`Connected to ${Object.keys(servers).length} servers`);

// Disconnect from specific server
await client.disconnect('database');
```

### Tool Management

```typescript
// List all available tools across servers
const allTools = await client.listTools();
console.log(`${allTools.length} tools available`);

// Get tools from specific server
const fsTools = await client.listToolsFromServer('filesystem');

// Call tool with type-safe parameters
const fileContent = await client.callTool('filesystem', 'read_file', {
  path: '/config/app.json',
});

// Find tool across all servers
const searchTool = await client.getTool('search', 'web_search');
if (searchTool) {
  const results = await client.callTool('search', 'web_search', {
    query: 'MCP protocol documentation',
  });
}
```

### Resource Management

```typescript
// List all resources from all servers
const resources = await client.listResources();

// Read resource content
const configData = await client.readResource(
  'filesystem',
  'file:///etc/config.json',
);

// Subscribe to resource changes
await client.subscribeToResource('filesystem', 'file:///logs/app.log');

// Work with resource templates
const templates = await client.listResourceTemplates();
const completions = await client.completeResourceTemplate(
  'database',
  'db://tables/{table_name}',
  { name: 'table_name', value: 'user' },
);
```

### Prompt Management

```typescript
// List available prompts
const prompts = await client.listPrompts();

// Find specific prompt
const codeReviewPrompt = await client.findPrompt('code_review');

// Get completion for prompt arguments
const completions = await client.completePrompt(
  'assistant',
  'code_review',
  { name: 'language', value: 'typ' }, // Will suggest 'typescript'
);
```

### Root Directory Management

```typescript
// Add root directories for servers to access
await client.addRoot({
  uri: 'file:///home/user/projects',
  name: 'Projects',
});

await client.addRoot({
  uri: 'file:///home/user/documents',
  name: 'Documents',
});

// Remove root directory
await client.removeRoot('file:///home/user/documents');

// Get current roots
const roots = client.roots;
```

### Advanced Configuration

```typescript
const client = new McpClient({
  name: 'AdvancedAI',
  version: '3.0.0',
  // Handle server-to-client requests
  onElicitation: async (request) => {
    // Handle elicitation requests from servers
    return { content: 'User response...' };
  },
  onSampling: async (request) => {
    // Handle sampling requests from servers
    return {
      content: 'Generated response...',
      model: 'gpt-4',
      stopReason: 'end_turn',
    };
  },
  // Initial root directories
  roots: [
    { uri: 'file:///workspace', name: 'Workspace' },
    { uri: 'file:///data', name: 'Data' },
  ],
});

// Set logging level for all servers
await client.setLogLevel('debug');
```

---

## 🧩 API Reference

### McpClient Class

| Method              | Description                 |
| ------------------- | --------------------------- |
| `connect(endpoint)` | Connect to MCP server       |
| `disconnect(name)`  | Disconnect from server      |
| `disconnectAll()`   | Disconnect from all servers |
| `getServer(name)`   | Get server instance         |
| `listServers()`     | List all connected servers  |

### Tool Operations

| Method                         | Description                     |
| ------------------------------ | ------------------------------- |
| `callTool(server, name, args)` | Execute tool on server          |
| `listTools()`                  | List all tools from all servers |
| `listToolsFromServer(name)`    | List tools from specific server |
| `getTool(server, name)`        | Get specific tool definition    |

### Resource Operations

| Method                             | Description                   |
| ---------------------------------- | ----------------------------- |
| `readResource(server, uri)`        | Read resource content         |
| `listResources()`                  | List all resources            |
| `subscribeToResource(server, uri)` | Subscribe to resource changes |
| `listResourceTemplates()`          | List resource templates       |

### Prompt Operations

| Method                              | Description                     |
| ----------------------------------- | ------------------------------- |
| `listPrompts()`                     | List all prompts                |
| `findPrompt(name)`                  | Find prompt by name             |
| `completePrompt(server, name, arg)` | Get prompt argument completions |

---

## 🔧 Server Endpoint Configuration

### Stdio Connector

```typescript
{
  name: 'filesystem',
  transport: 'stdio',
  command: 'npx',
  args: ['mcp-server-filesystem', '/home/user'],
  env: { DEBUG: '1' }
}
```

### HTTP Connector

```typescript
{
  name: 'api-server',
  transport: 'http',
  url: 'https://api.example.com/mcp',
  headers: {
    'Authorization': 'Bearer your-token',
    'X-Client-Version': '1.0.0'
  }
}
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

### @coremcp/client vs Official MCP SDK

| Feature                 | @coremcp/client                           | Official MCP SDK                 |
| ----------------------- | ----------------------------------------- | -------------------------------- |
| **Architecture**        | Manager pattern with multi-server support | Single-connection client         |
| **Server Management**   | Multiple simultaneous connections         | One server per client instance   |
| **Type Safety**         | Full TypeScript + runtime validation      | TypeScript with basic validation |
| **Transport Support**   | STDIO + HTTP with abstraction             | STDIO + SSE with direct usage    |
| **Tool Organization**   | ToolManager with cross-server discovery   | Direct tool usage                |
| **Resource Management** | ResourceManager with subscriptions        | Basic resource access            |
| **Prompt Management**   | PromptManager with completion support     | Direct prompt usage              |
| **Connection Handling** | Auto-reconnection and error recovery      | Manual connection management     |
| **Production Features** | Session management, monitoring            | Development-focused              |

### When to Choose Each

#### Choose **@coremcp/client** when you need:

- Multi-server MCP client with unified API
- Manager-based organization of tools, resources, prompts
- Production-ready client with error handling and reconnection
- Cross-server tool discovery and capability management
- Enterprise features like session management

#### Choose **Official SDK** when you need:

- Simple single-server MCP client
- Direct control over MCP protocol interactions
- Minimal dependencies and straightforward patterns
- Educational or learning projects
- Quick prototyping with basic functionality

### Code Comparison

**Official SDK** approach:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'my-server',
});

const client = new Client(
  {
    name: 'example-client',
    version: '1.0.0',
  },
  {
    capabilities: {},
  },
);

await client.connect(transport);

// Direct protocol usage
const tools = await client.listTools();
const result = await client.callTool({
  name: 'my-tool',
  arguments: { param: 'value' },
});
```

**@coremcp/client** approach:

```typescript
import { McpClient } from '@coremcp/client';

const client = new McpClient({
  name: 'example-client',
  version: '1.0.0',
  servers: [
    { name: 'server1', transport: 'stdio', command: 'my-server' },
    { name: 'server2', transport: 'http', url: 'http://api.example.com/mcp' },
  ],
});

// Manager-based abstraction
const allTools = await client.listTools(); // From all servers
const result = await client.callTool('server1', 'my-tool', { param: 'value' });

// Cross-server capabilities
const tool = await client.getTool('server2', 'other-tool');
```

Both are excellent choices depending on your specific architecture and complexity requirements.

---

## 🚦 Connector Packages

@coremcp/client works with pluggable transport implementations:

- `@coremcp/client-stdio` - Process-based communication
- `@coremcp/client-http` - HTTP-based communication

```bash
# Install connector packages as needed
npm i @coremcp/client-stdio
npm i @coremcp/client-http
```

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
