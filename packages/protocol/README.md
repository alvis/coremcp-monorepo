# @coremcp/protocol

> TypeScript-first Model Context Protocol (MCP) types and runtime validation — complete protocol compliance with type safety.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/protocol
```

```typescript
import {
  CallToolRequest,
  validateJsonRpcMessage,
  getVersionedValidators,
} from '@coremcp/protocol';

// Type-safe MCP message handling
const validator = await getVersionedValidators('2025-06-18');
const validatedMessage = validator.validateCallToolRequest(request);
```

---

## ✨ Key Features

| Feature                        | @coremcp/protocol | Other MCP libs |
| ------------------------------ | ----------------- | -------------- |
| 🔒 **Full TypeScript support** | ✅                | ❌             |
| ⚡ **Runtime validation**      | ✅                | ❌             |
| 📋 **Multi-version support**   | ✅                | ❌             |
| 🎯 **JSON-RPC 2.0 compliant**  | ✅                | ✅             |
| 📦 **Zero config setup**       | ✅                | ❌             |

_Top 3 reasons you'll love it_

- **Type-safe by design** — Full TypeScript definitions for all MCP protocol versions
- **Runtime validated** — Comprehensive Zod-based validation for bulletproof message handling
- **Version agnostic** — Supports multiple MCP protocol versions with automatic negotiation

---

## 😩 Problem → 💡 Solution

> **The pain**: Building MCP clients/servers requires manual type definitions and error-prone message validation.
>
> **The fix**: @coremcp/protocol provides battle-tested types and validators for all MCP protocol versions — one import, full compliance.

---

## 🚀 Usage

### Basic Type Definitions

```typescript
import type {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  McpMessage,
} from '@coremcp/protocol';

// Use types for your MCP implementations
function handleToolCall(request: CallToolRequest): CallToolResult {
  // TypeScript knows exactly what's available
  const { method, params } = request;
  // ...
}
```

### Runtime Message Validation

```typescript
import {
  validateJsonRpcMessage,
  getVersionedValidators,
} from '@coremcp/protocol';

// Validate incoming JSON-RPC messages
const message = validateJsonRpcMessage(rawJsonData);

// Get protocol-specific validators
const validators = await getVersionedValidators('2025-06-18');
const toolRequest = validators.validateCallToolRequest(message);
```

### Protocol Version Negotiation

```typescript
import {
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@coremcp/protocol';

const clientVersion = '2025-06-18';
const negotiated = negotiateProtocolVersion(
  clientVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
);
// Returns highest mutually supported version
```

### Error Handling

```typescript
import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

try {
  const result = await handleMcpRequest(request);
} catch (error) {
  throw new JsonRpcError(
    MCP_ERROR_CODES.INVALID_PARAMS,
    'Invalid tool parameters',
    error,
  );
}
```

---

## 🧩 API Reference

### Core Types

| Export                    | Description                    |
| ------------------------- | ------------------------------ |
| `McpMessage`              | Base type for all MCP messages |
| `CallToolRequest/Result`  | Tool execution types           |
| `ListResourcesRequest`    | Resource listing types         |
| `GetPromptRequest/Result` | Prompt handling types          |
| `ServerCapabilities`      | Server capability declarations |

### Validation Functions

| Function                   | Description                          |
| -------------------------- | ------------------------------------ |
| `validateJsonRpcMessage`   | Validates basic JSON-RPC structure   |
| `getVersionedValidators`   | Returns protocol-specific validators |
| `negotiateProtocolVersion` | Negotiates protocol version          |

### Error Types

| Export            | Description                   |
| ----------------- | ----------------------------- |
| `JsonRpcError`    | Standard JSON-RPC error class |
| `MCP_ERROR_CODES` | MCP-specific error codes      |
| `McpError`        | Base MCP error type           |

---

## 🔧 Supported Protocol Versions

| Version    | Status | Features                                 |
| ---------- | ------ | ---------------------------------------- |
| 2024-11-05 | ✅     | Initial MCP specification                |
| 2025-03-26 | ✅     | Enhanced capabilities and error handling |
| 2025-06-18 | ✅     | Latest with improved streaming support   |

The package automatically selects the appropriate schema and validators based on the negotiated protocol version.

---

## 🌐 Compatibility

| Target         | Support |
| -------------- | ------- |
| Node.js        | ≥ 18    |
| TypeScript     | ≥ 5.0   |
| Module formats | ESM     |
| Browsers       | Modern  |

---

## 🆚 Alternatives

| Library               | Types | Validation | Multi-version |
| --------------------- | ----- | ---------- | ------------- |
| **@coremcp/protocol** | ✅    | ✅         | ✅            |
| @anthropic/mcp        | ✅    | ❌         | ❌            |
| Custom types          | 🔶    | ❌         | ❌            |

> **When to choose @coremcp/protocol?**
>
> - You need runtime validation for production apps
> - You want support for multiple MCP protocol versions
> - You prefer comprehensive TypeScript definitions

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
