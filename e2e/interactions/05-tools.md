# 5. Tool Flows

## 5.1 tools/list

| Field | Value |
|-------|-------|
| **ID** | `TOOL-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.tools` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:147` ✅ `server-transport-http.spec.e2e.ts:172` ✅ `client-connector-stdio.spec.e2e.ts:110` ✅ `client-connector-http.spec.e2e.ts:107` ✅ `client.spec.e2e.ts:104` |

**Preconditions:** Session initialized. Server declared `capabilities.tools`.

**Message Sequence:**

1. **Client → Server**: `tools/list`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/list",
     "params": {}
   }
   ```

2. **Server → Client**: Tool list response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "tools": [
         {
           "name": "echo",
           "description": "Echoes the input text",
           "inputSchema": {
             "type": "object",
             "properties": {
               "text": {
                 "type": "string",
                 "description": "The text to echo"
               }
             },
             "required": ["text"]
           }
         },
         {
           "name": "add",
           "description": "Adds two numbers",
           "inputSchema": {
             "type": "object",
             "properties": {
               "a": { "type": "number" },
               "b": { "type": "number" }
             },
             "required": ["a", "b"]
           }
         }
       ]
     }
   }
   ```

**Pagination (optional):**

Same pattern as `resources/list` — `cursor` in params, `nextCursor` in result.

**Note:** Since 2025-11-25, tools may include an `execution` field with `taskSupport` indicating the tool supports asynchronous task-based execution.

**Error Cases:**
- Server does not declare `capabilities.tools` → Error code `-32601`

**Edge Cases:**
- Server has no tools → `tools` array is empty `[]`
- Tool with empty `inputSchema` → `{"type": "object"}` (accepts no arguments)
- Tool `inputSchema` uses advanced JSON Schema features → Client should validate accordingly

---

## 5.2 tools/call — Success

| Field | Value |
|-------|-------|
| **ID** | `TOOL-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.tools` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:157` ✅ `server-transport-http.spec.e2e.ts:192` ✅ `client-connector-stdio.spec.e2e.ts:136` ✅ `client-connector-http.spec.e2e.ts:131` ✅ `client.spec.e2e.ts:145` |

**Preconditions:** Session initialized. Server declared `capabilities.tools`. Tool name is known.

**Message Sequence:**

1. **Client → Server**: `tools/call`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "echo",
       "arguments": {
         "text": "Hello, world!"
       }
     }
   }
   ```

2. **Server → Client**: Tool result
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [
         {
           "type": "text",
           "text": "Echo: Hello, world!"
         }
       ]
     }
   }
   ```

**Content Types:**
- `TextContent`: `{ "type": "text", "text": "..." }`
- `ImageContent`: `{ "type": "image", "data": "base64...", "mimeType": "image/png" }`
- `EmbeddedResource`: `{ "type": "resource", "resource": { "uri": "...", "text": "..." } }`

**Error Cases:**
- Unknown tool name → Server returns JSON-RPC error
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
- Invalid arguments (wrong type, missing required) → Server returns JSON-RPC error

**Edge Cases:**
- Tool returns multiple content items → `content` array has multiple elements
- Tool returns no content → `content` may be empty `[]`
- `isError` field is omitted when tool succeeds (falsy)
- `arguments` may be omitted if tool requires no input

---

## 5.3 tools/call — Error

| Field | Value |
|-------|-------|
| **ID** | `TOOL-003` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.tools` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:201` ✅ `server-transport-http.spec.e2e.ts:233` ✅ `client-connector-stdio.spec.e2e.ts:206` ✅ `client-connector-http.spec.e2e.ts:413` ✅ `client.spec.e2e.ts:202` |

**Preconditions:** Session initialized. Tool execution encounters an error.

**Message Sequence:**

1. **Client → Server**: `tools/call`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "echo",
       "arguments": {}
     }
   }
   ```

2. **Server → Client**: Tool error result (application-level error, NOT JSON-RPC error)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [
         {
           "type": "text",
           "text": "Error: missing required argument 'text'"
         }
       ],
       "isError": true
     }
   }
   ```

**Important Distinction:**
- **Application-level errors** (tool logic fails): Returned as a successful JSON-RPC response with `isError: true` in the result
- **Protocol-level errors** (unknown tool, invalid params): Returned as JSON-RPC error responses with `error` object

**Error Cases:**
- Tool throws exception → `isError: true` with error description in `content`
- Tool timeout → Implementation-defined (may be `isError: true` or JSON-RPC error)

**Edge Cases:**
- `isError: true` with empty content → Client knows there was an error but no details
- Tool returns partial results alongside error → `content` may contain both data and error messages

---

## 5.4 tools/call — Structured Output

| Field | Value |
|-------|-------|
| **ID** | `TOOL-004` |
| **Since** | 2025-06-18 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.tools` |
| **Existing Coverage** | ✅ `server-transport-http/05-tools.spec.e2e.ts:106` ✅ `server-transport-stdio/05-tools.spec.e2e.ts:105` |

**Preconditions:** Session initialized. Server declared `capabilities.tools`. Tool supports structured output.

**Message Sequence:**

1. **Client → Server**: `tools/call`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "structuredContent",
       "arguments": {}
     }
   }
   ```

2. **Server → Client**: Tool result with `structuredContent`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [
         {
           "type": "text",
           "text": "Operation completed: 42 items processed"
         }
       ],
       "structuredContent": {
         "itemsProcessed": 42,
         "status": "complete",
         "results": [
           { "id": 1, "value": "alpha" },
           { "id": 2, "value": "beta" }
         ]
       }
     }
   }
   ```

**Protocol Rules:**
- `structuredContent` is an arbitrary JSON object alongside the `content` array
- `content` provides human-readable representation; `structuredContent` provides machine-readable data
- Client should prefer `structuredContent` for programmatic use when available

**Error Cases:**
- Tool does not support structured output → `structuredContent` is omitted from response
- `structuredContent` schema mismatch → Client should validate against expected schema

**Edge Cases:**
- `structuredContent` present but `content` is empty → Client should still use `structuredContent`
- `structuredContent` and `content` describe different aspects of the result
- `structuredContent` may contain nested objects and arrays

---

## 5.5 tools/call with Progress

| Field | Value |
|-------|-------|
| **ID** | `TOOL-005` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | `capabilities.tools` |
| **Existing Coverage** | ⚠️ `client-connector-http.spec.e2e.ts:170` (longRunningOperation tested but progress notifications not explicitly verified) |

**Preconditions:** Session initialized. Client includes `_meta.progressToken` in the request.

**Message Sequence:**

1. **Client → Server**: `tools/call` with progress token
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "longRunningOperation",
       "arguments": {
         "duration": 5,
         "steps": 10
       },
       "_meta": {
         "progressToken": "progress-abc-123"
       }
     }
   }
   ```

2. **Server → Client**: Progress notifications (zero or more)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-abc-123",
       "progress": 3,
       "total": 10,
       "message": "Step 3 of 10"
     }
   }
   ```

   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-abc-123",
       "progress": 7,
       "total": 10,
       "message": "Step 7 of 10"
     }
   }
   ```

3. **Server → Client**: Final tool result
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [
         {
           "type": "text",
           "text": "Long running operation completed. Duration: 5 seconds, Steps: 10."
         }
       ]
     }
   }
   ```

**Protocol Rules:**
- `progressToken` is a string or integer chosen by the client
- `progress` MUST increase monotonically across notifications for the same token
- `total` is optional; if provided, `progress` should approach `total`
- `message` is optional human-readable description
- Server MUST NOT send progress notifications after the final response

**Error Cases:**
- Client sends `_meta.progressToken` but server ignores it → No progress notifications, just final result
- Progress token collision (reused token) → Undefined behavior; client should use unique tokens

**Edge Cases:**
- `progress` exceeds `total` → Client should handle gracefully
- `total` changes between notifications → Client should handle
- Server sends progress after final response → Client should ignore
- No progress notifications at all → Client just receives the final response

---

## 5.6 notifications/tools/list_changed

| Field | Value |
|-------|-------|
| **ID** | `TOOL-006` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server → Client |
| **Capabilities** | `capabilities.tools.listChanged` |
| **Existing Coverage** | ✅ `server-transport-http/05-tools.spec.e2e.ts:185` ✅ `server-transport-stdio/05-tools.spec.e2e.ts:182` |

**Preconditions:** Session initialized. Server declared `capabilities.tools.listChanged`. Server's tool list has changed.

**Message Sequence:**

1. **Server → Client**: `notifications/tools/list_changed`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tools/list_changed"
   }
   ```

2. **Client**: Should re-fetch the tool list via `tools/list`

**Error Cases:**
- Server sends this without declaring `capabilities.tools.listChanged` → Client may ignore

**Edge Cases:**
- Same coalescing and timing considerations as RESOURCE-007
- Tool removed while client has a pending `tools/call` for it → The pending call may fail
- Tool's `inputSchema` changes → Client should re-validate any cached schemas

---
