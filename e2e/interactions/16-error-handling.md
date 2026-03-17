# 16. Error Handling Flows

This section catalogs standard JSON-RPC and MCP-specific error codes and the interactions that trigger them.

**Standard JSON-RPC Error Codes:**
| Code | Name | Description |
|---|---|---|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid request | Not a valid JSON-RPC request |
| -32601 | Method not found | Method does not exist |
| -32602 | Invalid params | Invalid method parameters |
| -32603 | Internal error | Internal JSON-RPC error |

**MCP-Specific Error Codes (coremcp):**
| Code | Name | Description |
|---|---|---|
| -32001 | Resource not found | Resource URI not found |
| -32002 | Authentication required | Authentication is required |

---

## 16.1 Invalid JSON-RPC Message

| Field | Value |
|-------|-------|
| **ID** | `ERROR-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A peer sends malformed JSON or a JSON-RPC message missing required fields.

**Message Sequence:**

1. **Client -> Server**: Malformed JSON
   ```
   {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params":
   ```

2. **Server -> Client**: Parse error
   ```json
   {
     "jsonrpc": "2.0",
     "id": null,
     "error": {
       "code": -32700,
       "message": "Parse error"
     }
   }
   ```

Alternative: Missing `jsonrpc` field

1. **Client -> Server**: Invalid JSON-RPC
   ```json
   { "id": 1, "method": "tools/list" }
   ```

2. **Server -> Client**: Invalid request
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32600,
       "message": "Invalid Request: missing jsonrpc field"
     }
   }
   ```

**Error Cases:**
- Truncated JSON -> `-32700`
- Missing `jsonrpc` field -> `-32600`
- `jsonrpc` not equal to `"2.0"` -> `-32600`
- Missing `method` field on request -> `-32600`

**Edge Cases:**
- `id` may be `null` in the error response if the server could not determine it from the malformed message
- stdio: Connection should remain open after parse error
- HTTP: Parse error returns as HTTP 400 or as JSON-RPC error within the response stream

---

## 16.2 Method Not Found

| Field | Value |
|-------|-------|
| **ID** | `ERROR-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client sends a request with an unknown method name.

**Message Sequence:**

1. **Client -> Server**: Unknown method
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "nonexistent/method",
     "params": {}
   }
   ```

2. **Server -> Client**: Method not found error
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32601,
       "message": "Method not found: nonexistent/method"
     }
   }
   ```

**Error Cases:**
- Typo in method name (e.g., `tool/list` instead of `tools/list`) -> `-32601`
- Method exists but not supported in this protocol version -> `-32601`
- Notification method used as request (with `id`) -> Behavior undefined; server may process or return error

**Edge Cases:**
- Server SHOULD include the method name in the error message for debugging
- Connection should remain functional after method-not-found errors

---

## 16.3 Invalid Params

| Field | Value |
|-------|-------|
| **ID** | `ERROR-003` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client sends a request with a valid method but invalid parameters.

**Message Sequence:**

1. **Client -> Server**: Valid method, invalid params
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "prompts/get",
     "params": {
       "wrong_field": "simple-prompt"
     }
   }
   ```

2. **Server -> Client**: Invalid params error
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32602,
       "message": "Invalid params: missing required field 'name'"
     }
   }
   ```

**Error Cases:**
- Missing required parameter -> `-32602`
- Wrong parameter type (string where number expected) -> `-32602`
- Extra unexpected parameters -> Server MAY ignore or return `-32602`

**Edge Cases:**
- Some servers are lenient with extra parameters (ignore them)
- Error message SHOULD indicate which parameter is invalid and why

---

## 16.4 Internal Error

| Field | Value |
|-------|-------|
| **ID** | `ERROR-004` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Server encounters an unexpected internal error during request processing.

**Message Sequence:**

1. **Client -> Server**: Valid request
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": { "name": "crash_tool", "arguments": {} }
   }
   ```

2. **Server -> Client**: Internal error
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32603,
       "message": "Internal error"
     }
   }
   ```

**Error Cases:**
- Unhandled exception in tool handler -> `-32603`
- Database connection failure -> `-32603`
- Out of memory -> `-32603`

**Edge Cases:**
- Server SHOULD NOT expose sensitive internal details in production
- The `data` field is optional and MAY contain additional error context
- Connection should remain functional after internal errors

---

## 16.5 Resource Not Found

| Field | Value |
|-------|-------|
| **ID** | `ERROR-005` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | Server: `capabilities.resources` |
| **Existing Coverage** | `client-connector-http.spec.e2e.ts:419` (invalid resource URI), `server-transport-http.spec.e2e.ts:269` (read binary resource validates URI) |

**Preconditions:** Client attempts to read a resource with a URI that does not exist on the server.

**Message Sequence:**

1. **Client -> Server**: `resources/read` with nonexistent URI
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/read",
     "params": {
       "uri": "test://nonexistent/resource"
     }
   }
   ```

2. **Server -> Client**: Resource not found error
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32001,
       "message": "Resource not found: test://nonexistent/resource"
     }
   }
   ```

**Error Cases:**
- URI scheme not supported -> `-32001` or `-32602`
- Resource existed but was deleted -> `-32001`
- URI format valid but resource unavailable -> `-32001`

**Edge Cases:**
- Some servers may return `-32602` (invalid params) instead of `-32001` for nonexistent resources
- After a resource-not-found error, the connection should remain active
- Server MAY include the URI in the error message for debugging

---

## 16.6 Tool Not Found

| Field | Value |
|-------|-------|
| **ID** | `ERROR-006` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | Server: `capabilities.tools` |
| **Existing Coverage** | `client.spec.e2e.ts:203` (nonexistent tool), `client-connector-stdio.spec.e2e.ts:206` (unknown tool error), `server-transport-stdio.spec.e2e.ts:201` (unknown tool error), `server-transport-http.spec.e2e.ts:233` (unknown tool error), `client-connector-http.spec.e2e.ts:413` (invalid tool call) |

**Preconditions:** Client calls a tool that does not exist on the server.

**Message Sequence:**

1. **Client -> Server**: `tools/call` with nonexistent tool
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "nonExistentTool",
       "arguments": {}
     }
   }
   ```

2. **Server -> Client**: Error response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32602,
       "message": "Unknown tool: nonExistentTool"
     }
   }
   ```

**Error Cases:**
- Tool name typo -> `-32602` with descriptive message
- Tool was removed after `tools/list` (race condition) -> `-32602`

**Edge Cases:**
- Error code varies by implementation: some use `-32602`, others use application-specific codes
- The error message format varies: `"Unknown tool: X"`, `"Tool not found: X"`, etc.
- Connection MUST remain active after tool-not-found errors (verified in `server-transport-stdio.spec.e2e.ts:457`)

---

## 16.7 Unsupported Protocol Version

| Field | Value |
|-------|-------|
| **ID** | `ERROR-007` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | None (initialization) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client sends `initialize` with a protocol version the server does not support.

**Message Sequence:**

1. **Client -> Server**: `initialize` with unsupported version
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "1.0.0",
       "capabilities": {},
       "clientInfo": { "name": "test-client", "version": "1.0.0" }
     }
   }
   ```

2. **Server -> Client**: Error with supported versions
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32602,
       "message": "Unsupported protocol version",
       "data": {
         "supported": ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"],
         "requested": "1.0.0"
       }
     }
   }
   ```

**Error Cases:**
- Version string format invalid -> `-32602`
- Version too old (server dropped support) -> `-32602` with `data.supported`

**Edge Cases:**
- The `data` field SHOULD include both `supported` (list of versions) and `requested` (what client sent)
- Client MAY retry with a different version from the `supported` list
- Alternatively, server MAY respond successfully with a lower version it supports instead of erroring

---

## 16.8 Capability Mismatch

| Field | Value |
|-------|-------|
| **ID** | `ERROR-008` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Depends on the feature being accessed |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client uses a feature that was not advertised in the server's `capabilities` response during initialization.

**Message Sequence:**

Example: Client calls `resources/list` but server did not advertise `capabilities.resources`.

1. **Client -> Server**: `resources/list` (server has no resources capability)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/list",
     "params": {}
   }
   ```

2. **Server -> Client**: Error or empty response (implementation-dependent)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32601,
       "message": "Server does not support resources"
     }
   }
   ```

   OR (lenient implementation):
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "resources": []
     }
   }
   ```

**Error Cases:**
- `resources/list` without `capabilities.resources` -> `-32601` or empty result
- `prompts/list` without `capabilities.prompts` -> `-32601` or empty result
- `tools/list` without `capabilities.tools` -> `-32601` or empty result
- `sampling/createMessage` without client `capabilities.sampling` -> Client returns `-32601`
- `elicitation/create` without client `capabilities.elicitation` -> Client returns `-32601`

**Edge Cases:**
- Behavior is implementation-dependent: strict servers return errors, lenient servers return empty results
- Client SHOULD check server capabilities before making requests
- Server SHOULD check client capabilities before sending server-to-client requests
- Capability mismatch is a programming error, not a runtime error

---
