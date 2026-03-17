# 2. Transport Flows

## 2.1 stdio — Basic Message Exchange

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-001` |
| **Since** | 2024-11-05 |
| **Transport** | stdio |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:85` ✅ `client-connector-stdio.spec.e2e.ts:75` |

**Preconditions:** Server process spawned. stdin/stdout pipes connected.

**Message Sequence:**

1. **Client → Server** (via stdin): One JSON-RPC message per line
   ```
   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"client","version":"1.0.0"}}}\n
   ```

2. **Server → Client** (via stdout): One JSON-RPC message per line
   ```
   {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{},"serverInfo":{"name":"server","version":"1.0.0"}}}\n
   ```

**Protocol Rules:**
- Messages MUST be newline-delimited (`\n`)
- Messages MUST NOT contain embedded newlines within the JSON
- Server MUST NOT write non-MCP content to stdout
- Client MUST NOT write non-MCP content to stdin
- Server MAY use stderr for logging (see TRANSPORT-004)

**Error Cases:**
- Non-JSON content on stdin → Server should return JSON-RPC parse error
- Non-JSON content on stdout → Client should handle gracefully

**Edge Cases:**
- Empty lines between messages → Should be ignored
- Very large messages → Must be handled as a single line
- Concurrent writes from multiple goroutines → Must be serialized (one message per line)

---

## 2.2 stdio — Server Crash Detection

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-002` |
| **Since** | 2024-11-05 |
| **Transport** | stdio |
| **Direction** | Server → Client (passive detection) |
| **Capabilities** | None required |
| **Existing Coverage** | ⚠️ `server-transport-stdio/02-transport.spec.e2e.ts:146` (maintains connection after error, but no crash detection test) |

**Preconditions:** Active stdio MCP session. Server process unexpectedly terminates.

**Message Sequence:**

1. **Server**: Process crashes (segfault, unhandled exception, OOM kill)
2. **Client**: Detects closed stdout/stderr streams
3. **Client**: Rejects all pending request promises with an error
4. **Client** (optional): May restart server process and reinitialize

**Error Cases:**
- Server dies mid-message → Client receives partial JSON, should discard and detect disconnect
- Server exits with non-zero exit code → Client should log the exit code

**Edge Cases:**
- Multiple pending requests at crash time → All should be rejected
- Client tries to send message after server crash → Write to closed stdin fails
- Server dies during initialization → Client should handle initialization failure

---

## 2.3 stdio — Invalid JSON

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-003` |
| **Since** | 2024-11-05 |
| **Transport** | stdio |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Active stdio MCP session.

**Message Sequence (invalid JSON from client):**

1. **Client → Server** (via stdin): Invalid JSON
   ```
   this is not valid json\n
   ```

2. **Server → Client** (via stdout): JSON-RPC parse error
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

**Message Sequence (invalid JSON from server):**

1. **Server → Client** (via stdout): Invalid JSON
   ```
   {broken json\n
   ```

2. **Client**: Should discard the invalid message and log the error. Connection should remain open.

**Error Cases:**
- Truncated JSON → Parse error with `id: null`
- Valid JSON but not a JSON-RPC message (missing `jsonrpc` field) → Error code `-32600` (Invalid Request)
- Valid JSON-RPC but unknown method → Error code `-32601` (Method not found)

**Edge Cases:**
- Binary data on stdin → Parse error, connection should survive
- UTF-8 BOM at start of message → Should be handled or rejected gracefully
- Multiple invalid messages in sequence → Each gets its own error response

---

## 2.4 stdio — stderr Logging

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-004` |
| **Since** | 2024-11-05 |
| **Transport** | stdio |
| **Direction** | Server → Client (informational) |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Active stdio MCP session. Server writes diagnostic information.

**Message Sequence:**

1. **Server** writes UTF-8 text to stderr:
   ```
   [INFO] Server started on pid 12345
   [DEBUG] Processing request id=1
   [ERROR] Failed to read resource: file not found
   ```

2. **Client**: MAY capture stderr for logging, MAY forward to user, MAY ignore entirely.

**Protocol Rules:**
- Server MAY write UTF-8 strings to stderr for logging purposes
- Messages on stderr are informational: debug, info, warning, error
- Client SHOULD NOT assume that stderr output indicates an error condition
- stderr is NOT part of the MCP protocol — it is a transport-level side channel

**Error Cases:**
- None — stderr is purely informational

**Edge Cases:**
- Server writes binary data to stderr → Client should handle gracefully
- Very high volume stderr output → Client should not block on stderr reads
- stderr closed before stdout → Server process may still be running
- Clarified in 2025-11-25 that stderr is for logging, not protocol messages

---

## 2.5 Streamable HTTP — POST with JSON Response

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-005` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-http.spec.e2e.ts:192` ✅ `client-connector-http.spec.e2e.ts:131` |

**Preconditions:** HTTP MCP session established (post-initialization).

**Message Sequence:**

1. **Client → Server**: HTTP POST with JSON-RPC request
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   Accept: application/json, text/event-stream
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25

   {"jsonrpc":"2.0","id":1,"method":"tools/list"}
   ```

2. **Server → Client**: HTTP response with JSON body
   ```
   HTTP/1.1 200 OK
   Content-Type: application/json

   {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"echo","description":"Echoes input","inputSchema":{"type":"object","properties":{"message":{"type":"string"}}}}]}}
   ```

**Error Cases:**
- Missing `Content-Type` header → Server responds `415 Unsupported Media Type`
- Invalid JSON body → Server responds with JSON-RPC parse error (code `-32700`)
- Missing `MCP-Session-Id` (after initialization) → Server responds `400 Bad Request`

**Edge Cases:**
- Client sends `Accept: application/json` only (no SSE) → Server MUST respond with JSON, not SSE
- Notification requests (no `id`) → Server responds `202 Accepted` with empty body
- Batch JSON-RPC requests → Server may respond with JSON array or SSE stream

---

## 2.6 Streamable HTTP — POST with SSE Response

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-006` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Client → Server (request), Server → Client (SSE stream) |
| **Capabilities** | None required |
| **Existing Coverage** | ⚠️ `server-transport-http/02-transport.spec.e2e.ts:173` (test exists but assertion too permissive) |

**Preconditions:** HTTP MCP session established. Client accepts SSE responses.

**Message Sequence:**

1. **Client → Server**: HTTP POST with JSON-RPC request
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   Accept: application/json, text/event-stream
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25

   {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"longRunningOperation","arguments":{"duration":5,"steps":10}}}
   ```

2. **Server → Client**: SSE stream with progress and final response
   ```
   HTTP/1.1 200 OK
   Content-Type: text/event-stream

   id: evt-001
   event: message
   data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":1,"progress":1,"total":10,"message":"Step 1 of 10"}}

   id: evt-002
   event: message
   data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":1,"progress":5,"total":10,"message":"Step 5 of 10"}}

   id: evt-003
   event: message
   data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Operation completed"}]}}

   ```

**Protocol Rules:**
- Server SHOULD immediately send an SSE event with an `id` field to prime reconnection
- Server may interleave progress notifications and server-initiated requests before the final response
- After sending the JSON-RPC response for the original request, server SHOULD close the SSE stream
- Each SSE event uses `event: message` and `data:` contains a JSON-RPC message

**Error Cases:**
- SSE stream disconnects before response → Client should reconnect using `Last-Event-ID`
- Server sends malformed SSE event → Client should skip and continue reading

**Edge Cases:**
- Server sends server-initiated requests (e.g., `sampling/createMessage`) interleaved in the SSE stream
- Multiple JSON-RPC requests batched → Server may send all responses on a single SSE stream
- Empty SSE keep-alive comments (`:`) → Client should ignore them

---

## 2.7 Streamable HTTP — GET for Server Messages

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-007` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Server → Client |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** HTTP MCP session established. Client wants to receive server-initiated messages.

**Message Sequence:**

1. **Client → Server**: HTTP GET to MCP endpoint
   ```
   GET /mcp HTTP/1.1
   Accept: text/event-stream
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25
   ```

2. **Server → Client**: SSE stream for server-initiated messages
   ```
   HTTP/1.1 200 OK
   Content-Type: text/event-stream

   id: evt-100
   event: message
   data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}

   id: evt-101
   event: message
   data: {"jsonrpc":"2.0","id":"srv-1","method":"sampling/createMessage","params":{"messages":[{"role":"user","content":{"type":"text","text":"Hello"}}],"maxTokens":100}}

   ```

**Protocol Rules:**
- Messages on GET stream SHOULD be unrelated to concurrent POST requests
- Server MUST NOT send JSON-RPC responses on the GET stream unless resuming a previous stream (via `Last-Event-ID`)
- Both client and server may close the GET SSE stream at any time
- Client may open multiple GET streams; server should send each message on only one

**Error Cases:**
- GET without `MCP-Session-Id` → Server responds `400 Bad Request`
- GET without prior `initialize` → Server responds `400 Bad Request`
- Server does not support GET streams → Server responds `405 Method Not Allowed`

**Edge Cases:**
- Client has no GET stream open → Server-initiated messages queue or are sent via POST response streams
- Client reconnects GET stream → Server should continue sending pending messages
- Server has nothing to send → Stream stays open with periodic keep-alive comments

---

## 2.8 Streamable HTTP — Session Management

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-008` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-http.spec.e2e.ts:471` |

**Preconditions:** Client sends `initialize` request. Server supports session management.

**Message Sequence:**

1. **Client → Server**: `initialize` request (no session ID yet)
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   Accept: application/json, text/event-stream

   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"client","version":"1.0.0"}}}
   ```

2. **Server → Client**: Response with `MCP-Session-Id` header
   ```
   HTTP/1.1 200 OK
   Content-Type: application/json
   MCP-Session-Id: a1b2c3d4-e5f6-7890-abcd-ef1234567890

   {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{},"serverInfo":{"name":"server","version":"1.0.0"}}}
   ```

3. **Client → Server**: All subsequent requests include session ID
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   MCP-Session-Id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   MCP-Protocol-Version: 2025-11-25

   {"jsonrpc":"2.0","id":2,"method":"tools/list"}
   ```

**Protocol Rules:**
- Server assigns session via `MCP-Session-Id` response header on the `initialize` response
- Client MUST include `MCP-Session-Id` on ALL subsequent requests (POST, GET, DELETE)
- Session IDs MUST be cryptographically secure and unpredictable (e.g., UUID v4)
- Missing session header on post-initialize requests → Server responds `400 Bad Request`

**Error Cases:**
- Request with unknown session ID → Server responds `404 Not Found`
- Request with malformed session ID → Server responds `400 Bad Request`
- Multiple `initialize` requests on same session → Server should reject

**Edge Cases:**
- Server does not use sessions (single-user mode) → No `MCP-Session-Id` header; client omits it
- Session ID rotation → Not specified; server should use a stable ID for the session lifetime
- Concurrent requests with same session ID → All should succeed

---

## 2.9 Streamable HTTP — Client Termination

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-009` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ⚠️ `client-connector-http.spec.e2e.ts:385` (disconnect tested but DELETE method not explicitly verified) |

**Preconditions:** Active HTTP MCP session with valid `MCP-Session-Id`.

**Message Sequence:**

1. **Client → Server**: HTTP DELETE
   ```
   DELETE /mcp HTTP/1.1
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25
   ```

2. **Server → Client**: Success response
   ```
   HTTP/1.1 200 OK
   ```

**Error Cases:**
- Server does not support client-initiated termination → `405 Method Not Allowed`
- Invalid session ID → `404 Not Found`
- Missing session ID → `400 Bad Request`

**Edge Cases:**
- Client has open SSE streams when sending DELETE → Server should close them
- DELETE sent twice → Second should get `404` (session already terminated) or `200` (idempotent)

---

## 2.10 Streamable HTTP — Server Termination

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-010` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Server → Client |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Active HTTP MCP session. Server decides to terminate.

**Message Sequence:**

1. **Client → Server**: Any request with session ID
   ```
   POST /mcp HTTP/1.1
   MCP-Session-Id: session-abc-123
   Content-Type: application/json
   MCP-Protocol-Version: 2025-11-25

   {"jsonrpc":"2.0","id":5,"method":"ping"}
   ```

2. **Server → Client**: HTTP 404
   ```
   HTTP/1.1 404 Not Found
   ```

3. **Client**: MUST reinitialize by sending a new `initialize` request without session ID

**Error Cases:**
- Client does not handle 404 → Subsequent requests continue to fail

**Edge Cases:**
- Open SSE streams are closed by server before returning 404 on new requests
- Server may close SSE streams without sending 404 — client detects disconnect

---

## 2.11 Streamable HTTP — Reconnection with Last-Event-ID

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-011` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Client was connected to an SSE stream that disconnected. Client has the last received event ID.

**Message Sequence:**

1. **Client → Server**: Reconnect POST or GET with `Last-Event-ID`
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   Accept: application/json, text/event-stream
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25
   Last-Event-ID: evt-042

   {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"message":"retry"}}}
   ```

2. **Server → Client**: SSE stream replaying missed events
   ```
   HTTP/1.1 200 OK
   Content-Type: text/event-stream

   id: evt-043
   event: message
   data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":1,"progress":8,"total":10}}

   id: evt-044
   event: message
   data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Echo: retry"}]}}

   ```

**Protocol Rules:**
- Event IDs MUST be globally unique across all SSE streams within a session
- Server MAY replay missed messages from the last known event ID
- Server MAY reject reconnection if too much time has passed (respond with `404`)

**Error Cases:**
- Server does not support resumability → Ignores `Last-Event-ID`, starts fresh
- Unknown `Last-Event-ID` → Server may start fresh or return error

**Edge Cases:**
- Client reconnects to a different SSE stream (POST vs GET) → Server should still honor `Last-Event-ID`
- Event IDs must be unique across all streams in a session to avoid conflicts

---

## 2.12 Streamable HTTP — Multiple SSE Streams

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-012` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Client has multiple open SSE streams (e.g., one GET stream and one or more POST response streams).

**Message Sequence:**

1. **Client**: Opens GET SSE stream
2. **Client**: Sends POST request that returns SSE stream
3. **Server**: Sends messages on appropriate streams

**Protocol Rules:**
- Server MUST send each JSON-RPC message on only ONE stream (no broadcasting/duplicating)
- Risk of message loss if a stream disconnects is mitigated by resumability (`Last-Event-ID`)
- Server should prefer sending responses on the same POST stream that received the request
- Server-initiated messages (notifications, requests) should go on the GET stream

**Error Cases:**
- Stream disconnects → Messages may be lost if server does not support resumability

**Edge Cases:**
- All streams disconnect simultaneously → Server queues messages until client reconnects
- Client opens many concurrent POST streams → Server must track which response goes where
- Server has only one message to send → It picks one stream (should be deterministic)

---

## 2.13 Streamable HTTP — Protocol Version Header

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-013` |
| **Since** | 2025-11-25 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** HTTP MCP session established. Protocol version negotiated during initialization.

**Message Sequence:**

1. **Client → Server**: All post-initialization requests include version header
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25

   {"jsonrpc":"2.0","id":2,"method":"tools/list"}
   ```

2. **Server**: Validates the `MCP-Protocol-Version` header matches the negotiated version

**Protocol Rules:**
- Client MUST include `MCP-Protocol-Version` header on all requests after initialization
- Server MUST validate that the header matches the negotiated protocol version
- If header is invalid or unsupported → Server responds `400 Bad Request`
- If header is missing → Server assumes `2025-03-26` (backwards compatibility)

**Error Cases:**
- `MCP-Protocol-Version: 9999-01-01` → Server responds `400 Bad Request`
- `MCP-Protocol-Version` mismatches negotiated version → Server responds `400 Bad Request`

**Edge Cases:**
- Missing header from older clients → Server assumes `2025-03-26` for backwards compatibility
- Header present on `initialize` request → Should be ignored (version is in the JSON body)

---

## 2.14 Streamable HTTP — Origin Validation

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-014` |
| **Since** | 2025-11-25 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** HTTP MCP server running. Client sends request with `Origin` header.

**Message Sequence:**

1. **Client → Server**: Request with Origin header
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   Origin: https://trusted-app.example.com
   MCP-Session-Id: session-abc-123
   MCP-Protocol-Version: 2025-11-25

   {"jsonrpc":"2.0","id":1,"method":"ping"}
   ```

2. **Server**: Validates Origin against allowlist

   **Valid origin:**
   ```
   HTTP/1.1 200 OK
   Content-Type: application/json

   {"jsonrpc":"2.0","id":1,"result":{}}
   ```

   **Invalid origin:**
   ```
   HTTP/1.1 403 Forbidden
   ```

**Protocol Rules:**
- Server MUST validate the `Origin` header on all requests
- Invalid origin → `403 Forbidden`
- Local MCP servers SHOULD bind to `127.0.0.1` only (not `0.0.0.0`)
- This prevents DNS rebinding and cross-origin attacks

**Error Cases:**
- Missing `Origin` header → Server policy-dependent (may allow or reject)
- `Origin: null` → Server should generally reject
- `Origin` from untrusted domain → `403 Forbidden`

**Edge Cases:**
- Requests from non-browser clients (e.g., CLI tools) may not include `Origin`
- Server configured with wildcard origin → Should still validate
- `localhost` vs `127.0.0.1` in Origin → Server should handle both for local servers

---

## 2.15 Streamable HTTP — HTTP+SSE Backwards Compat

| Field | Value |
|-------|-------|
| **ID** | `TRANSPORT-015` |
| **Since** | 2025-03-26 |
| **Transport** | HTTP |
| **Direction** | Client → Server |
| **Capabilities** | None required |
| **Existing Coverage** | ❌ NONE |

**Preconditions:** Client does not know if server supports Streamable HTTP or the older HTTP+SSE transport (2024-11-05).

**Message Sequence (Streamable HTTP server — happy path):**

1. **Client → Server**: POST `initialize` request
   ```
   POST /mcp HTTP/1.1
   Content-Type: application/json
   Accept: application/json, text/event-stream

   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"client","version":"1.0.0"}}}
   ```

2. **Server → Client**: JSON or SSE response → Client proceeds normally

**Message Sequence (Fallback to HTTP+SSE — older server):**

1. **Client → Server**: POST `initialize` request → Gets `400`, `404`, or `405`
2. **Client**: Falls back to GET expecting SSE with `endpoint` event
   ```
   GET /sse HTTP/1.1
   Accept: text/event-stream
   ```

3. **Server → Client**: SSE stream with `endpoint` event
   ```
   event: endpoint
   data: /messages?sessionId=abc123
   ```

4. **Client**: Uses the provided endpoint for subsequent POST requests

**Error Cases:**
- Neither transport works → Client should report connection failure
- Fallback endpoint returns invalid SSE → Client should fail

**Edge Cases:**
- Server supports both transports → Client should prefer Streamable HTTP
- Server changes transport between connections → Client should detect and adapt

---
