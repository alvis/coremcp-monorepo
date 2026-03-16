# Core MCP Monorepo Architecture

## Overview

This is a comprehensive TypeScript-based implementation of the Model Context Protocol (MCP) organized as a monorepo. It provides both client and server implementations with multiple transport options, comprehensive authentication, and a production-ready architecture. The Model Context Protocol is an open standard introduced by Anthropic that standardizes how AI applications connect with external tools, data sources, and systems - essentially serving as "USB for AI integrations."

### Key Benefits

- **Standardization**: Common protocol across different AI systems
- **Extensibility**: Easy to add new capabilities via tools, resources, and prompts
- **Security**: Built-in authentication and authorization support with OAuth 2.1
- **Flexibility**: Multiple transport options for different deployment scenarios
- **Type Safety**: Comprehensive runtime validation with versioned schemas
- **Production Ready**: Enterprise-grade session management and error handling

## Monorepo Package Structure

The codebase is organized into 9 packages following a clean layered architecture:

### Package Overview

```plantext
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

### Package Dependencies

```plantext
       coremcp
      /       \
     /         \
@coremcp/     @coremcp/
  client       server
     |           |
     |           |
 transport    transport
 packages     packages
     |           |
     |           |
  @coremcp/core
         |
         |
  @coremcp/protocol
```

### Individual Package Details

#### 1. Foundation Layer

**@coremcp/protocol**

- **Purpose**: Core MCP protocol types and validation
- **Key Features**:
  - Supports multiple protocol versions (2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25)
  - Runtime validation with Zod schemas
  - JSON-RPC 2.0 message definitions
  - Type-safe request/response handling
- **Dependencies**: ajv (for validation)
- **Consumers**: All other packages depend on this

#### 2. Common Layer

**@coremcp/core**

- **Purpose**: Shared utilities and session management
- **Key Features**:
  - Session class with comprehensive lifecycle management
  - Storage abstraction for different backends
  - User management and authentication types
  - Logging utilities
- **Dependencies**: @coremcp/protocol
- **Consumers**: Client and server packages

#### 3. Core Layer

**@coremcp/client**

- **Purpose**: MCP client implementation
- **Key Features**:
  - Manager pattern for organizing capabilities (PromptManager, ResourceManager, ToolManager)
  - Multi-server connection management
  - Transport abstraction
  - Root directory management
- **Dependencies**: @coremcp/core, @coremcp/protocol
- **Consumers**: CLI and user applications

**@coremcp/server**

- **Purpose**: MCP server implementation
- **Key Features**:
  - Message routing and validation
  - Capability negotiation
  - Handler-based extensibility
  - Session initialization and management
- **Dependencies**: @coremcp/core, @coremcp/protocol
- **Consumers**: CLI and server applications

#### 4. Transport Layer

**@coremcp/client-http**

- **Purpose**: HTTP transport for client
- **Peer Dependencies**: @coremcp/client
- **Key Features**: HTTP-based client communication

**@coremcp/client-stdio**

- **Purpose**: STDIO transport for client
- **Peer Dependencies**: @coremcp/client
- **Key Features**: Process-based client communication

**@coremcp/server-stdio**

- **Purpose**: STDIO transport for server
- **Key Features**:
  - Readline-based message processing
  - Process signal handling
  - Newline-delimited JSON-RPC
- **Dependencies**: @coremcp/core, @coremcp/protocol
- **Peer Dependencies**: @coremcp/server

**@coremcp/server-fastify**

- **Purpose**: HTTP transport for server using Fastify
- **Key Features**:
  - OAuth 2.1 authentication support
  - Session management with automatic cleanup
  - CORS support
  - Health check endpoints
- **Dependencies**: fastify, @fastify/formbody
- **Peer Dependencies**: @coremcp/server

#### 5. CLI Layer

**coremcp**

- **Purpose**: Command-line interface and server orchestration
- **Key Features**:
  - Unified CLI for both stdio and HTTP transports
  - Server factory functions
  - Graceful shutdown handling
  - Configuration management
- **Dependencies**: cleye, pino, all other workspace packages
- **Consumers**: End users and deployment scripts

### Package Design Principles

#### Clean Dependency Graph

- **No Circular Dependencies**: All packages form a directed acyclic graph
- **Peer Dependencies**: Transport packages use peer dependencies to avoid tight coupling
- **Minimal External Dependencies**: Most packages have minimal external dependencies
- **Type Safety**: Full TypeScript throughout with proper interface definitions

#### Separation of Concerns

- **Protocol First**: All MCP types defined in the protocol package
- **Transport Agnostic**: Core logic separated from transport mechanisms
- **Capability Based**: Features organized by MCP capability types
- **Session Centric**: All operations occur within session context

#### Extensibility Patterns

- **Handler Based**: Server uses handler functions for custom behavior
- **Manager Pattern**: Client organizes capabilities through managers
- **Plugin Architecture**: Transport packages can be swapped easily
- **Configuration Driven**: CLI provides flexible configuration options

## Protocol-First Architecture

### MCP Protocol Foundation

The `@coremcp/protocol` package serves as the foundation for the entire system, implementing a protocol-first design that ensures type safety and specification compliance.

#### Protocol Version Support

The system supports multiple MCP protocol versions with automatic negotiation:

- **2024-11-05**: Initial MCP specification
- **2025-03-26**: Enhanced features and capabilities
- **2025-06-18**: Latest specification with improved streaming support
- **2025-11-25**: Tasks, richer metadata, and Streamable HTTP refinements

```typescript
// From packages/protocol/src/constants.ts
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
];
```

#### Runtime Validation with Zod

All protocol messages undergo runtime validation using Zod schemas:

```typescript
// Versioned validators ensure compatibility
const validator = await getVersionedValidators(session.protocolVersion);
const validatedMessage = validator.validateCallToolRequest(message);
```

#### Type Safety Throughout

The protocol package exports comprehensive types for all MCP operations:

- **JSON-RPC Types**: `JsonRpcMessage`, `JsonRpcRequest`, `JsonRpcResponse`
- **MCP Messages**: `CallToolMessage`, `ListResourcesMessage`, `GetPromptMessage`
- **Capability Types**: `ServerCapabilities`, `ClientCapabilities`
- **Content Types**: `TextContent`, `ImageContent`, `AudioContent`
- **Error Handling**: `McpError`, `JsonRpcError` with standardized error codes

#### Schema-Driven Development

The protocol package uses JSON Schema definitions for each supported version:

```plantext
packages/protocol/src/schemas/
├── 2024-11-05/
│   ├── schema.json
│   └── schema.ts
├── 2025-03-26/
│   ├── schema.json
│   └── schema.ts
├── 2025-06-18/
│   ├── schema.json
│   └── schema.ts
└── 2025-11-25/
    ├── schema.json
    └── schema.ts
```

#### Protocol Negotiation

The system automatically negotiates the highest mutually supported protocol version:

```typescript
const negotiatedVersion = negotiateProtocolVersion(
  params.protocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
);
```

## Core Components

### 1. McpServer (`packages/server/src/server.ts`)

- **Purpose**: Main protocol handler implementing JSON-RPC 2.0 MCP specification
- **Responsibilities**:
  - Message routing and validation using versioned validators
  - Capability negotiation and declaration
  - Session initialization and management
  - Error handling with proper JSON-RPC error codes
- **Key Methods**:
  - `handleMessage()`: Routes incoming JSON-RPC requests with validation
  - `initializeSession()`: Handles session creation and protocol negotiation
  - Capability-specific handlers for tools, resources, and prompts

### 2. Transport Layer Architecture

The transport layer implements a clean abstraction using symbol-based protected methods and pluggable implementations.

#### Abstract Transport Base (`packages/server/src/transport.ts`)

- **Purpose**: Defines transport interface using symbol-based encapsulation
- **Key Features**:
  - Symbol-based protected methods: `[start]`, `[stop]`, `[send]`, `[handleMessage]`
  - Lifecycle management with proper error handling
  - Session initialization abstraction
  - Graceful shutdown with signal handling

#### STDIO Transport (`packages/server-transport-stdio/src/index.ts`)

- **Purpose**: Process-based communication using stdin/stdout
- **Key Features**:
  - Readline interface for line-delimited JSON-RPC
  - Process signal handling for graceful shutdown
  - Session management with initialization validation
  - Newline-delimited message framing
- **Dependencies**: @coremcp/core, @coremcp/protocol

#### HTTP Transport (`packages/server-transport-fastify/src/http.ts`)

- **Purpose**: HTTP-based communication using Fastify
- **Key Features**:
  - Session management with automatic cleanup
  - OAuth 2.1 authentication support
  - CORS support for cross-origin requests
  - Health check and metadata endpoints
  - Comprehensive request/response logging
- **Dependencies**: fastify, @fastify/formbody

### 3. Session Management Architecture

The session management system provides comprehensive state management for MCP protocol operations.

#### Session Class (`packages/common/src/session.ts`)

- **Purpose**: Centralized session state management for all MCP operations
- **Key Features**:
  - Protocol version negotiation and storage
  - Client/server capability management
  - Tool, prompt, and resource registration
  - Message history tracking
  - Activity-based lifecycle management
  - JSON serialization for persistence

#### Session Lifecycle

```typescript
// Session creation with comprehensive initialization
const session = new Session({
  id: sessionId,
  userId: authenticatedUserId,
  protocolVersion: negotiatedVersion,
  clientInfo: params.clientInfo,
  serverInfo: this.serverInfo,
  capabilities: {
    client: params.capabilities,
    server: this.capabilities,
  },
  tools: this.tools,
  prompts: this.prompts,
  resources: this.resources,
  messages: [],
  createdAt: Date.now(),
  lastActivity: Date.now(),
});
```

#### Session Storage Abstraction

```typescript
// Storage interface for different backends
interface SessionStorage {
  get(sessionId: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  delete(sessionId: string): Promise<void>;
  cleanup(): Promise<void>;
}
```

#### Session Features

- **State Management**: Tracks tools, prompts, resources, and capabilities
- **Activity Tracking**: Automatic last activity updates
- **Message History**: Maintains conversation history
- **Type Safety**: Generic user type support
- **Persistence**: JSON serialization for storage backends
- **Lifecycle Events**: Creation, update, and cleanup hooks

#### Session Resume and Continuity

The server implementation supports session resumption for authenticated users:

```typescript
// Resume existing session if user matches
if (previousSession && previousSession.user?.id === user?.id) {
  // Update session with new client info
  // Maintain message history and state
}
```

### 4. Client Architecture (`packages/client/src/index.ts`)

The MCP client uses a manager pattern to organize different capability types.

#### Manager Pattern Implementation

```typescript
export class McpClient {
  #promptManager: PromptManager;
  #resourceManager: ResourceManager;
  #toolManager: ToolManager;
  #servers = new Map<string, ClientServer>();

  constructor(options: McpClientOptions) {
    this.#promptManager = new PromptManager(this.#servers);
    this.#resourceManager = new ResourceManager(this.#servers);
    this.#toolManager = new ToolManager(this.#servers);
  }
}
```

#### Capability Managers

- **PromptManager**: Handles prompt discovery, execution, and completion
- **ResourceManager**: Manages resource access, subscriptions, and templates
- **ToolManager**: Orchestrates tool calls across multiple servers

#### Multi-Server Support

```typescript
// Connect to multiple servers simultaneously
const client = new McpClient({
  name: 'MyAIApp',
  version: '1.0.0',
  servers: [
    { name: 'filesystem', transport: 'stdio' },
    { name: 'database', transport: 'http' },
  ],
});

// Use tools from any connected server
const result = await client.callTool('filesystem', 'read_file', {
  path: '/etc/config.json',
});
```

### 5. Server Architecture (`packages/server/src/server.ts`)

The MCP server implements comprehensive message routing and capability management.

#### Message Routing

```typescript
public async handleMessage(
  message: JsonRpcRequestEnvelope | JsonRpcNotificationEnvelope,
  session: Session
): Promise<JsonRpcResultData | null> {
  const validator = await getVersionedValidators(session.protocolVersion);

  switch (message.method) {
    case 'tools/call':
      return await this.handleCallTool(message, session);
    case 'resources/read':
      return await this.handleReadResource(message, session);
    // ... other methods
  }
}
```

#### Handler-Based Extensibility

```typescript
interface ServerHandler {
  handleListTools?: (params: ListToolsParams) => Promise<ListToolsResult>;
  handleCallTool?: (params: CallToolParams) => Promise<CallToolResult>;
  handleListResources?: (
    params: ListResourcesParams,
  ) => Promise<ListResourcesResult>;
  // ... other handlers
}
```

#### Capability Declaration

```typescript
// Server automatically declares capabilities based on available handlers
this.capabilities = {
  tools:
    params.tools || params.handlers.handleListTools
      ? {
          listChanged: true,
        }
      : undefined,
  resources:
    params.resources || params.handlers.handleListResources
      ? {
          listChanged: true,
          subscribe: true,
        }
      : undefined,
};
```

## OAuth 2.1 Authentication Architecture

The HTTP transport provides comprehensive OAuth 2.1 support for secure authentication.

### OAuth Flow Implementation

```plantext
1. Client Registration
   POST /oauth/register
   → { client_id, client_secret }

2. Authorization Request
   GET /oauth/authorize?response_type=code&client_id=...
   → Redirect with authorization code

3. Token Exchange
   POST /oauth/token
   → { access_token, token_type, expires_in }

4. Authenticated Requests
   POST /mcp (with Authorization: Bearer token)
```

### OAuth Endpoints

#### Authorization Server Metadata

- **Endpoint**: `/.well-known/oauth-authorization-server`
- **Purpose**: Provides OAuth server configuration per RFC 8414
- **Features**: Advertises supported grant types, scopes, and endpoints

#### Dynamic Client Registration

- **Endpoint**: `/oauth/register`
- **Purpose**: Allows clients to register dynamically per RFC 7591
- **Features**: Generates client credentials and stores client metadata

#### Authorization Endpoint

- **Endpoint**: `/oauth/authorize`
- **Purpose**: Handles authorization requests with PKCE support
- **Features**:
  - Authorization code flow
  - PKCE (Proof Key for Code Exchange) support
  - State parameter for CSRF protection
  - Redirect URI validation

#### Token Endpoint

- **Endpoint**: `/oauth/token`
- **Purpose**: Exchanges authorization codes for access tokens
- **Features**:
  - Authorization code grant type
  - PKCE verification
  - Client authentication
  - Token expiration management

### Security Features

```typescript
// PKCE Support
if (authData.code_challenge) {
  const hash = crypto
    .createHash('sha256')
    .update(code_verifier)
    .digest('base64url');
  if (hash !== authData.code_challenge) {
    throw new Error('Invalid code_verifier');
  }
}

// Token Management
this._accessTokens.set(accessToken, {
  client_id,
  scope: authData.scope,
  expires_at: Date.now() + 3600 * 1000, // 1 hour
  issued_at: Date.now(),
});
```

### Client Authentication Methods

- **client_secret_basic**: HTTP Basic authentication
- **client_secret_post**: Client credentials in request body
- **none**: Public clients without client secret

## MCP Client-Server Model

```plantext
┌─────────────────┐     JSON-RPC 2.0      ┌─────────────────┐
│   MCP Client    │◄────────────────────►│   MCP Server    │
│ (AI Assistant)  │                      │ (This codebase) │
└─────────────────┘                      └─────────────────┘
        │                                         │
        │                                         ▼
        ▼                                   ┌─────────────┐
┌─────────────────┐                         │   Tools     │
│      Host       │                         │ Resources   │
│ (Claude Desktop,│                         │  Prompts    │
│  IDE, etc.)     │                         │ OAuth 2.1   │
└─────────────────┘                         └─────────────┘
```

## CLI Architecture

The CLI package provides a unified interface for server deployment and management.

### Command Structure

```bash
# STDIO Transport
coremcp start stdio

# HTTP Transport with Options
coremcp start http --host localhost --port 8080 --no-cors
```

### Factory Pattern

```typescript
// Server creation with transport abstraction
function createMcpServer(config: McpServerConfig): McpServer {
  const server = new McpServer({
    name: config.name || 'mcp-server',
    version: config.version || '1.0.0',
    transport: config.transport,
  });

  // Add default capabilities
  server.addTool(helloWorldTool, helloWorldHandler);
  return server;
}
```

### Graceful Shutdown

```typescript
const shutdown = async () => {
  console.error('\n🛑 Shutting down server...');
  await mcpServer.stop();
  console.error('✅ Server shut down gracefully');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

## System Architecture Strengths

### Production-Ready Features

1. **Type Safety Throughout**
   - Comprehensive TypeScript implementation
   - Runtime validation with Zod schemas
   - Versioned protocol support
   - Compile-time error detection

2. **Robust Error Handling**
   - Standardized JSON-RPC error codes
   - Proper error propagation through layers
   - Graceful degradation on failures
   - Comprehensive logging and debugging

3. **Enterprise Authentication**
   - OAuth 2.1 implementation
   - PKCE support for public clients
   - Dynamic client registration
   - Token lifecycle management

4. **Scalable Session Management**
   - Activity-based session expiration
   - Persistent session storage abstraction
   - Session resumption for authenticated users
   - Automatic cleanup of expired sessions

5. **Extensible Architecture**
   - Handler-based server extensibility
   - Manager pattern for client organization
   - Pluggable transport layer
   - Capability-based feature detection

## Data Flow Architecture

### STDIO Transport Flow

```plantext
Client Process
    │
    │ JSON-RPC over stdin/stdout
    │
    ▼
McpStdioServerTransport
    │
    │ validateJsonRpcMessage()
    │
    ▼
ServerTransport[initializeSession]
    │
    │ Session creation/validation
    │
    ▼
McpServer.handleMessage()
    │
    │ Message routing & validation
    │
    ▼
Capability Handlers
    │
    │ tools/call, resources/read, etc.
    │
    ▼
JSON-RPC Response
```

### HTTP Transport Flow

```plantext
HTTP Client
    │
    │ POST /mcp with JSON-RPC
    │
    ▼
Fastify Server
    │
    │ CORS, OAuth, session validation
    │
    ▼
StreamableHTTPTransport
    │
    │ Session management
    │
    ▼
McpServer.handleMessage()
    │
    │ Protocol-specific routing
    │
    ▼
Capability Handlers
    │
    │ Versioned validation
    │
    ▼
JSON Response (200 OK)
```

### Message Processing Pipeline

1. **Transport Reception**: Message received via stdio or HTTP
2. **Protocol Validation**: JSON-RPC format and schema validation
3. **Session Resolution**: Session lookup and authentication
4. **Message Routing**: Route to appropriate handler based on method
5. **Capability Execution**: Execute tool/resource/prompt operation
6. **Response Serialization**: Format response according to protocol
7. **Transport Delivery**: Send response via same transport mechanism

### Client Connection Flow

```plantext
McpClient
    │
    │ connect(ServerEndpoint)
    │
    ▼
Transport Selection
    │
    ├── stdio → StdioTransport
    │
    └── http → HttpTransport
    │
    ▼
Initialization Handshake
    │
    │ Protocol negotiation
    │ Capability exchange
    │
    ▼
Manager Initialization
    │
    ├── PromptManager
    ├── ResourceManager
    └── ToolManager
    │
    ▼
Ready for Operations
```

## Updated Implementation Analysis

### Key Improvements Over Original Design

The current implementation resolves all the issues mentioned in the original architecture document:

1. **Transport Initialization**: Clean symbol-based interface eliminates the confusing onMessage pattern
2. **Session Management**: Proper abstraction in common layer with comprehensive state management
3. **Protocol Compliance**: Full MCP specification support with versioned validation
4. **Error Handling**: Standardized JSON-RPC error codes and proper propagation
5. **Type Safety**: Comprehensive TypeScript implementation with runtime validation

### Configuration & Entry Points

#### CLI Interface (`packages/cli/src/executable.ts`)

- Modern command-line interface using `cleye`
- Support for both `stdio` and `http` transports
- Flexible configuration options
- Graceful shutdown handling

#### Factory Pattern (`e2e/index.ts`)

```typescript
// Unified server creation
function createMcpServer(config: McpServerConfig): McpServer;

// Transport-specific factories
function createHttpTransport(
  config: HttpTransportConfig,
): StreamableHTTPTransport;
function createStdioTransport(): StdioTransport;
```

#### Configuration Options

- **HTTP Transport**: host, port, CORS, OAuth settings
- **STDIO Transport**: Process-based communication
- **Session Management**: Storage backend configuration
- **Authentication**: OAuth 2.1 client registration settings

## Current Implementation Status

### Resolved Architecture Issues

The current implementation successfully addresses all previously identified concerns:

#### 1. ✅ Clean Transport Interface

**Solution**: Symbol-based protected methods provide clean encapsulation

```typescript
// Clean initialization pattern
const transport = new McpStdioServerTransport({
  log: logger,
  mcp: server
});

// Symbol-based method access
protected async [handleMessage](message, session) {
  // Handle message with proper typing
}
```

#### 2. ✅ Proper Session Management

**Solution**: Session management abstracted to common layer

```typescript
// Session class in @coremcp/core
export class Session {
  // Comprehensive session state management
  // Activity tracking and lifecycle
  // Storage abstraction
}
```

#### 3. ✅ Capability-Based Architecture

**Solution**: Handler-based extensibility with proper capability declaration

```typescript
interface ServerHandler {
  handleListTools?: (params) => Promise<ListToolsResult>;
  handleCallTool?: (params) => Promise<CallToolResult>;
  // ... other capability handlers
}
```

#### 4. ✅ Type Safety and Validation

**Solution**: Protocol-first design with comprehensive validation

```typescript
// Versioned validators ensure compatibility
const validator = await getVersionedValidators(session.protocolVersion);
const validatedMessage = validator.validateCallToolRequest(message);
```

### Current Architecture Strengths

1. **Production Ready**: Comprehensive error handling, logging, and monitoring
2. **Secure**: OAuth 2.1 implementation with PKCE support
3. **Scalable**: Session management with storage abstraction
4. **Extensible**: Handler-based architecture for custom capabilities
5. **Type Safe**: Full TypeScript with runtime validation
6. **Standards Compliant**: Proper MCP specification implementation

## Future Enhancement Opportunities

### 1. Server-Sent Events (SSE) Implementation

**Current**: HTTP transport uses JSON request/response
**Enhancement**: Add true SSE streaming support per MCP specification

```typescript
// Potential SSE implementation
interface StreamableTransport extends Transport {
  streamNotification(notification: Notification): void;
  streamProgress(progress: Progress): void;
  maintainEventStream(): void;
}
```

### 2. Enhanced Monitoring and Observability

**Current**: Basic logging with console output
**Enhancement**: OpenTelemetry integration for distributed tracing

```typescript
// Structured observability
interface ObservabilityConfig {
  tracing: OpenTelemetryConfig;
  metrics: PrometheusConfig;
  logging: StructuredLogConfig;
}
```

### 3. Advanced Session Storage

**Current**: In-memory session storage
**Enhancement**: Redis/database backends for distributed deployments

```typescript
// Distributed session storage
interface DistributedSessionStorage extends SessionStorage {
  enableClustering(): void;
  syncAcrossInstances(): void;
  handleFailover(): void;
}
```

### 4. Plugin Ecosystem

**Current**: Handler-based extensibility
**Enhancement**: Formal plugin system with marketplace

```typescript
// Plugin system
interface PluginRegistry {
  loadPlugin(pluginId: string): Promise<Plugin>;
  validatePlugin(plugin: Plugin): boolean;
  manageLifecycle(plugin: Plugin): void;
}
```

### 5. Performance Optimizations

**Current**: Functional implementation
**Enhancement**: Caching, connection pooling, and batch processing

```typescript
// Performance enhancements
interface PerformanceConfig {
  connectionPooling: boolean;
  messageBuffering: boolean;
  responseCache: CacheConfig;
}
```

## Comparison with Official TypeScript SDK

### Architectural Philosophy

**CoreMCP** and the **[Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** represent two distinct approaches to MCP implementation, each optimized for different use cases and deployment scenarios.

### Key Differences

| Aspect                | CoreMCP Monorepo                            | Official TypeScript SDK              |
| --------------------- | ------------------------------------------- | ------------------------------------ |
| **Architecture**      | Modular monorepo (9 packages)               | Monolithic single package            |
| **Design Philosophy** | Enterprise-first, production-ready          | Developer-first, simplicity-focused  |
| **Target Use Case**   | Production deployments, large-scale systems | Prototyping, education, simple tools |
| **Learning Curve**    | Moderate (enterprise patterns)              | Low (direct examples)                |
| **Dependencies**      | Structured with peer dependencies           | Minimal, self-contained              |

### Technical Feature Comparison

#### Protocol Implementation

- **CoreMCP**: Multi-version support (2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25) with automatic negotiation
- **Official SDK**: Latest version focus with forward compatibility

#### Type Safety & Validation

- **CoreMCP**: Full TypeScript + comprehensive runtime validation with Zod schemas
- **Official SDK**: TypeScript with basic JSON-RPC validation

#### Authentication & Security

- **CoreMCP**: Complete OAuth 2.1 implementation with PKCE, dynamic client registration, session management
- **Official SDK**: Simple authentication patterns, manual security implementation

#### Session Management

- **CoreMCP**: Enterprise session storage, automatic cleanup, activity tracking, persistence abstraction
- **Official SDK**: Basic connection state management

#### Transport Architecture

- **CoreMCP**: Pluggable transport layer with symbol-based encapsulation (STDIO + HTTP)
- **Official SDK**: Direct transport implementation (STDIO + SSE)

#### Error Handling

- **CoreMCP**: Standardized JSON-RPC error codes, comprehensive logging, graceful degradation
- **Official SDK**: Direct error propagation, basic error handling

#### Testing & Quality

- **CoreMCP**: Comprehensive test suites, integration tests, protocol compliance tests
- **Official SDK**: Example-focused testing, functional validation

### When to Choose Each Implementation

#### Choose **CoreMCP** when you need:

1. **Production-Ready Deployment**
   - Enterprise authentication and authorization
   - Session persistence and management
   - Multi-version protocol support
   - Comprehensive monitoring and logging

2. **Scalable Architecture**
   - Multi-server client implementations
   - Pluggable transport abstractions
   - Handler-based server extensibility
   - Modular package organization

3. **Enterprise Requirements**
   - OAuth 2.1 compliance
   - Audit logging and session tracking
   - Role-based access control
   - High availability and clustering support

4. **Team Development**
   - Strict type safety and validation
   - Clear architectural boundaries
   - Comprehensive testing frameworks
   - Standardized development patterns

#### Choose **Official SDK** when you need:

1. **Rapid Prototyping**
   - Quick MCP server/client setup
   - Minimal configuration overhead
   - Direct protocol access
   - Simple dependency management

2. **Educational Projects**
   - Learning MCP protocol concepts
   - Understanding core functionality
   - Straightforward examples
   - Community-standard patterns

3. **Simple Integrations**
   - Single-server implementations
   - Basic tool/resource providers
   - Development-focused tools
   - Minimal infrastructure requirements

### Code Style Comparison

**Official SDK Pattern**:

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
```

**CoreMCP Pattern**:

```typescript
import { McpServer } from '@coremcp/server';

const server = new McpServer({
  serverInfo: { name: 'example-server', version: '1.0.0' },
  sessionStorage: new RedisSessionStorage(),
  resolveUserId: async (context) => await authenticateUser(context),

  handlers: {
    handleListTools: async (params, session) => {
      // Full session context, user auth, etc.
      return { tools: [...] };
    }
  }
});
```

### Ecosystem Considerations

#### CoreMCP Advantages

- **Modularity**: Individual packages can be used independently
- **Production Features**: Session management, OAuth, monitoring out-of-the-box
- **Enterprise Integration**: Designed for large-scale deployments
- **Type Safety**: Comprehensive runtime validation
- **Transport Flexibility**: Multiple transport options with clean abstractions

#### Official SDK Advantages

- **Simplicity**: Direct, straightforward implementation
- **Community Standard**: Reference implementation endorsed by Anthropic
- **Minimal Dependencies**: Self-contained with fewer external dependencies
- **Learning-Friendly**: Clear examples and direct protocol access
- **Rapid Development**: Quick setup for prototypes and simple tools

### Migration Considerations

Both implementations are fully MCP-compliant and can interoperate. Teams can:

1. **Start with Official SDK** for prototyping, migrate to CoreMCP for production
2. **Use CoreMCP clients** with Official SDK servers (and vice versa)
3. **Adopt CoreMCP incrementally** by replacing individual components
4. **Maintain hybrid environments** with both implementations as needed

### System Strengths

### Architecture Excellence

1. **Protocol-First Design**: Type-safe MCP implementation with versioned schemas
2. **Clean Separation**: Well-defined package boundaries with minimal coupling
3. **Production Ready**: Comprehensive error handling, authentication, and monitoring
4. **Standards Compliant**: Full JSON-RPC 2.0 and MCP specification support
5. **Extensible**: Handler-based architecture for custom capabilities

### Implementation Quality

1. **Type Safety**: Full TypeScript with runtime validation
2. **Security**: OAuth 2.1 with PKCE and proper token management
3. **Performance**: Efficient session management and cleanup
4. **Reliability**: Proper error propagation and graceful degradation
5. **Developer Experience**: Comprehensive documentation and examples

## Key Dependencies

### Core Dependencies

- **fastify**: High-performance HTTP server framework
- **ajv**: JSON schema validation
- **cleye**: Modern CLI argument parsing
- **@fastify/formbody**: OAuth form parsing support

### Development Dependencies

- **typescript**: Type safety and development experience
- **vitest**: Testing framework
- **presetter**: Monorepo build orchestration
- **eslint**: Code quality and consistency

## Development Roadmap

### Phase 1: Core Enhancements (Q1)

1. **SSE Streaming**: Implement true streaming for HTTP transport
2. **Client Transports**: Complete HTTP client transport implementation
3. **Task Lifecycle UX**: Reduce polling friction and expose richer task helpers
4. **Transport Diagnostics**: Improve reconnection, buffering, and stream visibility
5. **Testing**: Comprehensive test suite for all packages
6. **Documentation**: Interactive API documentation portal

### Phase 2: Enterprise Features (Q2)

1. **Distributed Sessions**: Redis/database session storage
2. **Rate Limiting**: Protection against abuse
3. **Metrics**: Prometheus/OpenTelemetry integration
4. **Audit Logging**: Comprehensive activity tracking

### Phase 3: Ecosystem (Q3)

1. **Plugin System**: Formalized plugin architecture
2. **SDK Generation**: Auto-generate client libraries
3. **Testing Framework**: MCP-specific testing utilities
4. **Deployment**: Docker containers and Kubernetes manifests

### Phase 4: Advanced Features (Q4)

1. **Multi-tenancy**: Isolated environments
2. **High Availability**: Clustering and failover
3. **Streaming**: Advanced streaming capabilities
4. **Marketplace**: Tool and plugin distribution

## Contributing Guidelines

### Architecture Principles

1. **Maintain Package Boundaries**: No cross-layer dependencies outside the defined hierarchy
2. **Protocol Compliance**: Follow MCP specification strictly
3. **Backward Compatibility**: Ensure existing integrations continue to work
4. **Test Coverage**: Comprehensive testing for all new capabilities
5. **Documentation**: Update architecture documentation with any changes

### Development Workflow

1. **Package-First Development**: Changes should be contained within appropriate packages
2. **Type Safety**: All new code must be fully typed with proper interfaces
3. **Validation**: Add appropriate Zod schemas for new message types
4. **Error Handling**: Implement proper error propagation and logging
5. **Session Management**: Ensure new features integrate with session lifecycle

### Testing Strategy

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test package interactions and message flow
3. **Protocol Tests**: Validate MCP specification compliance
4. **Transport Tests**: Test both stdio and HTTP transports
5. **End-to-End Tests**: Validate complete client-server workflows

### Performance Considerations

1. **Memory Management**: Proper cleanup of sessions and resources
2. **Connection Handling**: Efficient transport management
3. **Validation Performance**: Optimize schema validation for high throughput
4. **Session Storage**: Consider storage backend performance characteristics
5. **Error Boundaries**: Prevent cascading failures across components
