# 8. Sampling Flows (Server -> Client)

These are requests FROM the server TO the client, asking the client's host LLM to generate text. The server initiates the request and the client responds with the LLM's output.

## 8.1 Create Message - Basic

| Field | Value |
|-------|-------|
| **ID** | `SAMPLING-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.sampling` |
| **Existing Coverage** | NONE |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.sampling` in its `initialize` request.

**Message Sequence:**

1. **Server -> Client**: `sampling/createMessage`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "What is 2+2?"
           }
         }
       ],
       "maxTokens": 100,
       "systemPrompt": "You are a helpful math assistant",
       "temperature": 0.7,
       "includeContext": "thisServer"
     }
   }
   ```

2. **Client -> Server**: CreateMessageResult
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "role": "assistant",
       "content": {
         "type": "text",
         "text": "2+2 = 4"
       },
       "model": "claude-sonnet-4-20250514",
       "stopReason": "endTurn"
     }
   }
   ```

**Params Schema:**
- `messages` (array, required): Array of message objects with `role` (user/assistant) and `content` (TextContent or ImageContent)
- `maxTokens` (integer, required): Maximum number of tokens to generate
- `systemPrompt` (string, optional): System-level prompt for the LLM
- `temperature` (number, optional): Sampling temperature (0.0 to 1.0)
- `stopSequences` (string[], optional): Sequences that trigger generation stop
- `includeContext` (string, optional): Context inclusion preference - `"none"`, `"thisServer"`, or `"allServers"`
- `metadata` (object, optional): Provider-specific metadata _(since 2025-03-26)_

**Note:** The `systemPrompt`, `temperature`, `includeContext`, and `stopSequences` fields are optional and may not be sent by all server trigger tools. The example above shows all available fields for illustration.

**Result Schema:**
- `role` (Role, required): Role of the generated message (`assistant`)
- `content` (SamplingContent, required): Generated content (TextContent or ImageContent)
- `model` (string, required): Identifier of the model that generated the response
- `stopReason` (string, optional): Why generation stopped - `"endTurn"`, `"stopSequence"`, `"maxTokens"`

**Error Cases:**
- Client does not support sampling -> Server should not send this request; if received, client returns:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32601,
      "message": "Method not found: sampling/createMessage"
    }
  }
  ```
- LLM generation fails -> Client returns internal error:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32603,
      "message": "Internal error: LLM generation failed"
    }
  }
  ```
- User denies sampling request (human-in-the-loop) -> Client returns error:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32600,
      "message": "User denied sampling request"
    }
  }
  ```

**Edge Cases:**
- Multi-turn conversations: messages array contains alternating user/assistant messages
- Client MAY modify the request (adjust temperature, add safety prompts) before sending to LLM
- Client SHOULD implement human-in-the-loop approval for sampling requests
- Image content in messages (ImageContent with base64 data and mimeType)
- Very large maxTokens value - client may cap at its own limit
- Empty messages array - server should include at least one message

---

## 8.2 Create Message - With Model Preferences

| Field | Value |
|-------|-------|
| **ID** | `SAMPLING-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.sampling` |
| **Existing Coverage** | NONE |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.sampling`.

**Message Sequence:**

1. **Server -> Client**: `sampling/createMessage` with `modelPreferences`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "Summarize this document concisely"
           }
         }
       ],
       "maxTokens": 500,
       "modelPreferences": {
         "hints": [
           { "name": "claude-sonnet" },
           { "name": "gpt-4o" }
         ],
         "costPriority": 0.3,
         "speedPriority": 0.8,
         "intelligencePriority": 0.5
       }
     }
   }
   ```

2. **Client -> Server**: CreateMessageResult
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "role": "assistant",
       "content": {
         "type": "text",
         "text": "Here is a concise summary..."
       },
       "model": "claude-sonnet-4-20250514",
       "stopReason": "endTurn"
     }
   }
   ```

**ModelPreferences Schema:**
- `hints` (array, optional): Array of objects with `name` (string) - substring patterns for model name matching
- `costPriority` (number, optional): Priority for cost optimization (0.0 to 1.0)
- `speedPriority` (number, optional): Priority for speed (0.0 to 1.0)
- `intelligencePriority` (number, optional): Priority for intelligence/capability (0.0 to 1.0)

**Error Cases:**
- Same as SAMPLING-001

**Edge Cases:**
- Client MAY ignore model preferences entirely and use whatever model is available
- Hint names are substring matches, not exact model identifiers
- All priority values are guidance only; client makes final model selection
- Priority values outside 0-1 range should be clamped or rejected
- Empty hints array - client uses default model selection
- Multiple hints - client tries to match in order of preference

---

## 8.3 Create Message - With Tools

| Field | Value |
|-------|-------|
| **ID** | `SAMPLING-003` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.sampling` |
| **Existing Coverage** | NONE |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.sampling`.

**Message Sequence:**

1. **Server -> Client**: `sampling/createMessage` with `tools` and optional `toolChoice`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "What's the weather in London?"
           }
         }
       ],
       "maxTokens": 500,
       "tools": [
         {
           "name": "get_weather",
           "description": "Get current weather for a location",
           "inputSchema": {
             "type": "object",
             "properties": {
               "city": { "type": "string", "description": "City name" },
               "units": { "type": "string", "enum": ["celsius", "fahrenheit"] }
             },
             "required": ["city"]
           }
         }
       ],
       "toolChoice": { "mode": "auto" }
     }
   }
   ```

2. **Client -> Server**: CreateMessageResult with ToolUseContent
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "role": "assistant",
       "content": {
         "type": "tool_use",
         "id": "toolu_01abc123",
         "name": "get_weather",
         "input": { "city": "London", "units": "celsius" }
       },
       "model": "claude-sonnet-4-20250514",
       "stopReason": "toolUse"
     }
   }
   ```

**Additional Params (since 2025-11-25):**
- `tools` (array, optional): Array of tool definitions with `name`, `description`, and `inputSchema`
- `toolChoice` (object, optional): Tool selection policy - `{ "mode": "auto" }`, `{ "mode": "required" }`, or `{ "mode": "none" }`

**Additional Content Types (since 2025-11-25):**
- `ToolUseContent`: `{ "type": "tool_use", "id": string, "name": string, "input": object }`
- `ToolResultContent`: `{ "type": "tool_result", "tool_use_id": string, "content": string | array }`

**SamplingContent** can now be a single content block OR an array of content blocks.

**stopReason** can now include `"toolUse"` when model decides to use a tool.

**Error Cases:**
- Invalid tool schema -> Client returns invalid params error
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32602,
      "message": "Invalid params: tool 'get_weather' has invalid inputSchema"
    }
  }
  ```

**Edge Cases:**
- Content returned as array with mixed text and tool_use blocks
- Multi-turn tool use flow: server sends subsequent createMessage requests with tool_result in messages
- toolChoice `"none"` prevents tool use; toolChoice `"any"` forces tool use
- Tool with empty inputSchema (no parameters)
- Multiple tools provided; model selects one or none
- Client may not support tool use in sampling - should return error or ignore tools

---

## 8.4 Create Message - Task-Augmented (Client-Side Async Tasks)

| Field | Value |
|-------|-------|
| **ID** | `SAMPLING-004` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.sampling` AND `capabilities.tasks.requests.sampling.createMessage` |
| **Existing Coverage** | NONE |

**Note:** This flow describes client-side async task sampling, where the client returns a `CreateTaskResult` instead of an immediate `CreateMessageResult`. This is distinct from server-side `_meta` related-task injection (see SAMPLING-005 below), which is what the current E2E tests validate.

**Preconditions:** Client and server have completed the initialization handshake. Client advertises both `capabilities.sampling` and `capabilities.tasks.requests.sampling.createMessage`.

**Message Sequence:**

1. **Server -> Client**: `sampling/createMessage` with `task` metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "Write a detailed analysis of this codebase"
           }
         }
       ],
       "maxTokens": 4096,
       "task": {
         "ttl": 120000
       }
     }
   }
   ```

2. **Client -> Server**: CreateTaskResult (instead of immediate CreateMessageResult)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "taskId": "task-abc-123",
       "status": "working",
       "createdAt": "2026-03-16T10:00:00Z",
       "lastUpdatedAt": "2026-03-16T10:00:00Z",
       "ttl": 120000
     }
   }
   ```

3. **Server -> Client** (poll): `tasks/get`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "tasks/get",
     "params": {
       "taskId": "task-abc-123"
     }
   }
   ```

4. **Client -> Server**: Task status
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "taskId": "task-abc-123",
       "status": "completed",
       "createdAt": "2026-03-16T10:00:00Z",
       "lastUpdatedAt": "2026-03-16T10:00:05Z",
       "ttl": 120000
     }
   }
   ```

5. **Server -> Client**: `tasks/result` to get final payload
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "method": "tasks/result",
     "params": {
       "taskId": "task-abc-123"
     }
   }
   ```

6. **Client -> Server**: The original CreateMessageResult payload
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "result": {
       "role": "assistant",
       "content": {
         "type": "text",
         "text": "Here is a detailed analysis..."
       },
       "model": "claude-sonnet-4-20250514",
       "stopReason": "endTurn"
     }
   }
   ```

**Task Params:**
- `task` (object, optional): `{ "ttl": number }` - Time-to-live in milliseconds for the task result

**Task Status Values:** `working`, `input_required`, `completed`, `failed`, `cancelled`

**Alternative: Push-style notification** (if server supports `notifications/tasks/status`):
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tasks/status",
  "params": {
    "taskId": "task-abc-123",
    "status": "completed",
    "createdAt": "2026-03-16T10:00:00Z",
    "lastUpdatedAt": "2026-03-16T10:00:05Z",
    "ttl": 120000
  }
}
```

**Error Cases:**
- Task not found:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 2,
    "error": {
      "code": -32602,
      "message": "Task not found: task-abc-123"
    }
  }
  ```
- Task expired (TTL exceeded):
  ```json
  {
    "jsonrpc": "2.0",
    "id": 2,
    "error": {
      "code": -32600,
      "message": "Task expired: task-abc-123"
    }
  }
  ```
- Task failed:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 2,
    "result": {
      "taskId": "task-abc-123",
      "status": "failed",
      "statusMessage": "LLM generation failed due to content policy",
      "createdAt": "2026-03-16T10:00:00Z",
      "lastUpdatedAt": "2026-03-16T10:00:03Z",
      "ttl": 120000
    }
  }
  ```

**Edge Cases:**
- Server cancels task via `tasks/cancel` before completion
- TTL expiry during generation - client should clean up and mark task as failed
- `pollInterval` hint in task status response - server should respect suggested interval
- Client does not support tasks capability - should return normal CreateMessageResult synchronously
- Concurrent task-augmented requests producing multiple active tasks

---

## 8.5 Create Message - Server-Side Related-Task Metadata

| Field | Value |
|-------|-------|
| **ID** | `SAMPLING-005` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.sampling` |
| **Existing Coverage** | ✅ `server-transport-http/08-sampling.spec.e2e.ts:341` ✅ `server-transport-stdio/08-sampling.spec.e2e.ts:246` |

**Note:** This flow describes the server-side `_meta` related-task injection pattern. When the server triggers `sampling/createMessage` from within a running server-side task context, it SHOULD include `_meta` with `io.modelcontextprotocol/related-task` containing the task ID. This is orthogonal to SAMPLING-004 (client-side async tasks).

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.sampling`. Server is executing a tool call within a task context.

**Message Sequence:**

1. **Server -> Client**: `sampling/createMessage` with `_meta` containing related-task metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "Process this data"
           }
         }
       ],
       "maxTokens": 100,
       "_meta": {
         "io.modelcontextprotocol/related-task": "task-abc-123"
       }
     }
   }
   ```

2. **Client -> Server**: Normal `CreateMessageResult`

**Protocol Rules:**
- The `_meta` field with `io.modelcontextprotocol/related-task` SHOULD be present when sampling is triggered from within a task execution context
- The value SHOULD be the task ID string of the originating task

---
