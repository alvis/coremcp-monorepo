# 1. Lifecycle Flows

## 1.1 Happy Path Initialization

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required (lifecycle is always available) |
| **Existing Coverage** | ✅ `server-transport-http/01-lifecycle.spec.e2e.ts:45` ✅ `server-transport-stdio/01-lifecycle.spec.e2e.ts:45` |

**Preconditions:** Transport connection established (stdio process spawned or HTTP endpoint available). No prior initialization on this connection/session.

**Message Sequence:**

1. **Client → Server**: `initialize`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "2025-11-25",
       "capabilities": {
         "roots": { "listChanged": true },
         "sampling": {},
         "elicitation": {}
       },
       "clientInfo": {
         "name": "example-client",
         "version": "1.0.0"
       }
     }
   }
   ```

2. **Server → Client**: Initialize response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "protocolVersion": "2025-11-25",
       "capabilities": {
         "tools": { "listChanged": true },
         "resources": { "subscribe": true, "listChanged": true },
         "prompts": { "listChanged": true },
         "logging": {},
         "completions": {}
       },
       "serverInfo": {
         "name": "example-server",
         "version": "1.0.0"
       },
       "instructions": "Optional human-readable instructions for the client."
     }
   }
   ```

3. **Client → Server**: `notifications/initialized`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/initialized"
   }
   ```

**Error Cases:**
- Client sends requests (other than `ping`) before server responds to `initialize` → Server SHOULD respond with error code `-32600` (Invalid Request)
- Server sends requests (other than `ping` and `notifications/message`) before receiving `notifications/initialized` → Client SHOULD respond with error code `-32600` (Invalid Request)

**Edge Cases:**
- Client sends `initialize` twice on the same session → Server SHOULD reject with error
- Server includes `instructions` field (optional, since 2025-03-26) → Client may use for UX but MUST NOT act on it programmatically
- Large capability objects → Both sides must handle arbitrary capability structures

---

## 1.2 Version Negotiation — Compatible

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:136` ✅ `server-transport-http.spec.e2e.ts:149` ✅ `client-connector-stdio.spec.e2e.ts:87` ✅ `client-connector-http.spec.e2e.ts:92` |

**Preconditions:** Transport connection established. Client knows which protocol version it supports.

**Message Sequence:**

1. **Client → Server**: `initialize` with supported protocol version
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "2025-11-25",
       "capabilities": {},
       "clientInfo": { "name": "client", "version": "1.0.0" }
     }
   }
   ```

2. **Server → Client**: Response with the same protocol version
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "protocolVersion": "2025-11-25",
       "capabilities": {},
       "serverInfo": { "name": "server", "version": "1.0.0" }
     }
   }
   ```

**Error Cases:**
- None for the compatible case. Both sides agree on the protocol version.

**Edge Cases:**
- Server supports multiple versions and selects the client's version → Response version matches request version
- Protocol version string format is always `YYYY-MM-DD`

---

## 1.3 Version Negotiation — Incompatible

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-003` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Transport connection established. Client sends a protocol version the server does not support.

**Message Sequence:**

1. **Client → Server**: `initialize` with unsupported protocol version
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "9999-01-01",
       "capabilities": {},
       "clientInfo": { "name": "client", "version": "1.0.0" }
     }
   }
   ```

2. **Server → Client**: Either an error response or a success with a different version (both are equally valid per spec):

   **Option A**: Error response with supported versions
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "error": {
       "code": -32602,
       "message": "Unsupported protocol version",
       "data": {
         "supported": ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]
       }
     }
   }
   ```

   **Option B**: Server responds successfully with a version it supports:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "protocolVersion": "2025-11-25",
       "capabilities": {},
       "serverInfo": { "name": "server", "version": "1.0.0" }
     }
   }
   ```

3. If the server responds with a version the client does not support, the **Client SHOULD disconnect**.

**Error Cases:**
- Server returns error code `-32602` with `data.supported` array listing supported versions
- Client does not support server's offered version → Client SHOULD disconnect and report the incompatibility

**Edge Cases:**
- Server supports only one version → `data.supported` array has one element
- Client retries with a version from `data.supported` → Should succeed if the version is mutually supported

---

## 1.4 Capability Negotiation

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-004` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Declared during `initialize` handshake |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:124` ✅ `server-transport-http.spec.e2e.ts:154` ✅ `client-connector-stdio.spec.e2e.ts:92` ✅ `client-connector-http.spec.e2e.ts:96` ✅ `client.spec.e2e.ts:90` |

**Preconditions:** Transport connection established. Both client and server are about to perform `initialize` handshake.

**Message Sequence:**

1. **Client → Server**: `initialize` with client capabilities
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "initialize",
     "params": {
       "protocolVersion": "2025-11-25",
       "capabilities": {
         "roots": { "listChanged": true },
         "sampling": {},
         "elicitation": {},
         "tasks": { "pushNotifications": true }
       },
       "clientInfo": { "name": "client", "version": "1.0.0" }
     }
   }
   ```

2. **Server → Client**: Response with server capabilities
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "protocolVersion": "2025-11-25",
       "capabilities": {
         "tools": { "listChanged": true },
         "resources": { "subscribe": true, "listChanged": true },
         "prompts": { "listChanged": true },
         "logging": {},
         "completions": {},
         "tasks": { "pushNotifications": true }
       },
       "serverInfo": { "name": "server", "version": "1.0.0" }
     }
   }
   ```

**Client Capabilities:**
- `roots` — Client can provide filesystem root URIs; `roots.listChanged` enables `notifications/roots/list_changed`
- `sampling` — Client supports `sampling/createMessage` requests from the server
- `elicitation` — Client supports `elicitation/create` requests from the server (since 2025-06-18)
- `tasks` — Client supports task-related methods; `tasks.pushNotifications` enables `notifications/tasks/status` (since 2025-11-25)

**Server Capabilities:**
- `tools` — Server provides tools; `tools.listChanged` enables `notifications/tools/list_changed`
- `resources` — Server provides resources; `resources.subscribe` enables subscriptions; `resources.listChanged` enables `notifications/resources/list_changed`
- `prompts` — Server provides prompts; `prompts.listChanged` enables `notifications/prompts/list_changed`
- `logging` — Server supports `logging/setLevel` and `notifications/message`
- `completions` — Server supports `completion/complete`
- `tasks` — Server supports task methods; `tasks.pushNotifications` enables `notifications/tasks/status` (since 2025-11-25)

**Error Cases:**
- Client calls a method for which server did not declare capability → Server SHOULD respond with error code `-32601` (Method not found)
- Server sends a request/notification for which client did not declare capability → Client SHOULD respond with error code `-32601` (Method not found)

**Edge Cases:**
- Empty capabilities object `{}` → Peer supports no optional features
- Capability declared without sub-fields (e.g., `"tools": {}`) → Feature is available but list-changed notifications are not
- Both sides MUST respect negotiated capabilities for the lifetime of the session

---

## 1.5 Shutdown — stdio

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-005` |
| **Since** | 2024-11-05 |
| **Transport** | stdio |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:94` ✅ `client-connector-stdio.spec.e2e.ts:460` |

**Preconditions:** Active stdio MCP session. Client wants to terminate.

**Message Sequence:**

1. **Client**: Closes stdin to the server process
2. **Client**: Waits for the server process to exit gracefully
3. **Client**: Sends `SIGTERM` if server does not exit within a reasonable timeout
4. **Client**: Sends `SIGKILL` if server still does not exit

Alternatively, the **server** MAY initiate shutdown:

1. **Server**: Closes stdout and exits
2. **Client**: Detects closed stdout, cleans up

**Error Cases:**
- Server ignores closed stdin and hangs → Client escalates to `SIGTERM` then `SIGKILL`
- Server crashes during shutdown → Client detects via process exit code

**Edge Cases:**
- Pending requests at shutdown time → Responses will never arrive; client should reject pending promises
- Multiple `disconnect()` calls → Should be idempotent (second call is a no-op)
- Server writes partial JSON before exit → Client should discard incomplete messages

---

## 1.6 Shutdown — HTTP

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-006` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ⚠️ `client-connector-http.spec.e2e.ts:385` (disconnect tested, but not HTTP DELETE verification) |

**Preconditions:** Active HTTP MCP session with a valid `MCP-Session-Id`.

**Message Sequence:**

1. **Client → Server**: HTTP DELETE to MCP endpoint
   ```
   DELETE /mcp HTTP/1.1
   MCP-Session-Id: session-abc-123
   ```

2. **Server → Client**: HTTP response
   ```
   HTTP/1.1 200 OK
   ```
   Or:
   ```
   HTTP/1.1 204 No Content
   ```

   Or if server does not support client-initiated termination:
   ```
   HTTP/1.1 405 Method Not Allowed
   ```

**Error Cases:**
- Missing `MCP-Session-Id` header → Server responds `400 Bad Request`
- Invalid/expired session ID → Server responds `404 Not Found`
- Server does not support DELETE → Server responds `405 Method Not Allowed`

**Edge Cases:**
- Client has open SSE streams when sending DELETE → Server should close all SSE streams for the session
- DELETE sent after session already expired → Server responds `404`

---

## 1.7 Session Expiry

| Field | Value |
|-------|-------|
| **ID** | `LIFECYCLE-007` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Server → Client |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Active HTTP MCP session. Server decides to terminate the session (timeout, resource limits, etc.).

**Message Sequence:**

1. **Client → Server**: Any request with the session ID
   ```
   POST /mcp HTTP/1.1
   MCP-Session-Id: session-abc-123
   Content-Type: application/json

   { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }
   ```

2. **Server → Client**: HTTP 404 response indicating session is no longer valid
   ```
   HTTP/1.1 404 Not Found
   ```

3. **Client**: MUST start a new session by sending a fresh `initialize` request (without `MCP-Session-Id`)

**Error Cases:**
- Client continues to use expired session ID → Server consistently returns `404`
- Client does not reinitialize after `404` → All subsequent requests will also fail with `404`

**Edge Cases:**
- Session expires while SSE stream is open → Server closes the SSE stream
- Session expires between two sequential requests → First succeeds, second gets `404`
- Race condition: session expires during in-flight request → Request may get `404` or may complete

---
