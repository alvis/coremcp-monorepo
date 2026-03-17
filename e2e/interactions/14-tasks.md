# 14. Task Flows

Tasks are durable state machines for long-running requests, introduced as an experimental feature in the 2025-11-25 protocol version. Tasks have 5 possible states: `working`, `input_required`, `completed`, `failed`, `cancelled`.

**State Transition Diagram:**

```
                    +---> completed
                    |
working ---+--------+---> failed
   ^       |        |
   |       |        +---> cancelled
   |       v
   +--- input_required
```

Valid transitions:
- `working` -> `input_required`, `completed`, `failed`, `cancelled`
- `input_required` -> `working`, `cancelled`
- `completed`, `failed`, `cancelled` -> (terminal, no further transitions)

---

## 14.1 Task Creation

| Field | Value |
|-------|-------|
| **ID** | `TASK-001` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | Server: `capabilities.tasks.requests.tools.call` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session. Server advertises `capabilities.tasks` with `requests.tools.call` support. The tool being called supports tasks (via `execution.taskSupport`).

**Message Sequence:**

1. **Client -> Server**: `tools/call` with `task` parameter
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "long_analysis",
       "arguments": { "data": "large dataset" },
       "task": {
         "ttl": 60000
       }
     }
   }
   ```

2. **Server -> Client**: `CreateTaskResult`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "task": {
         "taskId": "task-abc-123",
         "status": "working",
         "statusMessage": "Analysis started",
         "createdAt": "2025-01-01T00:00:00Z",
         "lastUpdatedAt": "2025-01-01T00:00:00Z",
         "ttl": 60000,
         "pollInterval": 5000
       }
     }
   }
   ```

**Error Cases:**
- Tool does not support tasks (`execution.taskSupport` is `"forbidden"` or absent) and client sends `task` param -> Server returns `-32601` (Method not found)
- Tool requires tasks (`execution.taskSupport` is `"required"`) and client omits `task` param -> Server returns `-32601` (Method not found)
- Server does not advertise `capabilities.tasks` -> Server returns `-32601` (Method not found) or ignores `task` param

**Edge Cases:**
- `ttl` is optional; if omitted, server decides retention policy
- `pollInterval` is a suggestion; client MAY poll at different intervals
- The response is a `CreateTaskResult`, NOT a `CallToolResult` -- client must use `tasks/result` to get the actual tool output
- Server SHOULD return task status as `"working"` in the initial response

---

## 14.2 Task Polling

| Field | Value |
|-------|-------|
| **ID** | `TASK-002` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task has been created via a task-augmented request (TASK-001). Client knows the `taskId`.

**Message Sequence:**

1. **Client -> Server**: `tasks/get`
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

2. **Server -> Client**: Task status
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "taskId": "task-abc-123",
       "status": "working",
       "statusMessage": "Processing 45% complete",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:00:30Z",
       "ttl": 60000,
       "pollInterval": 5000
     }
   }
   ```

3. (Client waits `pollInterval` milliseconds, then polls again)

4. **Client -> Server**: `tasks/get` (subsequent poll)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "method": "tasks/get",
     "params": {
       "taskId": "task-abc-123"
     }
   }
   ```

5. **Server -> Client**: Task completed
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "result": {
       "taskId": "task-abc-123",
       "status": "completed",
       "statusMessage": "Analysis finished",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:01:00Z",
       "ttl": 60000
     }
   }
   ```

**Error Cases:**
- Unknown `taskId` -> `-32602` (Invalid params)
- Task has been deleted (TTL expired) -> `-32602` (Invalid params)

**Edge Cases:**
- `pollInterval` may change between polls as the server adjusts
- Client SHOULD respect `pollInterval` to avoid overwhelming the server
- Polling a terminal task (`completed`, `failed`, `cancelled`) is valid and returns the final status

---

## 14.3 Task Result Retrieval

| Field | Value |
|-------|-------|
| **ID** | `TASK-003` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task has been created and has reached or will reach a terminal status (`completed`, `failed`, `cancelled`).

**Message Sequence:**

1. **Client -> Server**: `tasks/result`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 4,
     "method": "tasks/result",
     "params": {
       "taskId": "task-abc-123"
     }
   }
   ```

2. (Server BLOCKS until task reaches terminal status)

3. **Server -> Client**: Original request result (e.g., `CallToolResult` for `tools/call`)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 4,
     "result": {
       "content": [
         { "type": "text", "text": "Analysis complete: 42 patterns found." }
       ],
       "isError": false,
       "_meta": {
         "io.modelcontextprotocol/related-task": {
           "taskId": "task-abc-123"
         }
       }
     }
   }
   ```

**Error Cases:**
- Unknown `taskId` -> `-32602` (Invalid params)
- Task failed -> JSON-RPC error response with failure details
  ```json
  {
    "jsonrpc": "2.0",
    "id": 4,
    "error": {
      "code": -32603,
      "message": "Task failed: out of memory during analysis"
    }
  }
  ```
- Task cancelled -> JSON-RPC error response
  ```json
  {
    "jsonrpc": "2.0",
    "id": 4,
    "error": {
      "code": -32603,
      "message": "Task was cancelled"
    }
  }
  ```
- Task TTL expired and deleted -> `-32602` (Invalid params)

**Edge Cases:**
- Result MUST include `_meta` with `io.modelcontextprotocol/related-task` containing the `taskId`
- If task is already completed when `tasks/result` is called, server responds immediately
- Multiple concurrent `tasks/result` calls for the same `taskId` SHOULD all receive the result
- The result payload matches what the original method (e.g., `tools/call`) would have returned directly

---

## 14.4 Task Listing

| Field | Value |
|-------|-------|
| **ID** | `TASK-004` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks.list` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session. The peer advertises `capabilities.tasks.list`.

**Message Sequence:**

1. **Client -> Server**: `tasks/list`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 5,
     "method": "tasks/list",
     "params": {}
   }
   ```

2. **Server -> Client**: List of visible tasks
   ```json
   {
     "jsonrpc": "2.0",
     "id": 5,
     "result": {
       "tasks": [
         {
           "taskId": "task-abc-123",
           "status": "working",
           "statusMessage": "Processing...",
           "createdAt": "2025-01-01T00:00:00Z",
           "lastUpdatedAt": "2025-01-01T00:00:30Z",
           "ttl": 60000,
           "pollInterval": 5000
         },
         {
           "taskId": "task-def-456",
           "status": "completed",
           "statusMessage": "Done",
           "createdAt": "2025-01-01T00:01:00Z",
           "lastUpdatedAt": "2025-01-01T00:02:00Z",
           "ttl": null
         }
       ]
     }
   }
   ```

3. (If `nextCursor` is present in the response, client paginates; absence indicates last page)

4. **Client -> Server**: `tasks/list` (paginated)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 6,
     "method": "tasks/list",
     "params": {
       "cursor": "cursor-abc"
     }
   }
   ```

**Error Cases:**
- Server does not support `capabilities.tasks.list` -> `-32601` (Method not found)

**Edge Cases:**
- Expired tasks (TTL exceeded) MAY be excluded from the list
- Tasks are scoped to the current peer/session -- a client only sees its own tasks
- Pagination follows the same cursor pattern as other MCP list operations

---

## 14.5 Task Cancellation

| Field | Value |
|-------|-------|
| **ID** | `TASK-005` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks.cancel` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task has been created and is in a non-terminal state (`working` or `input_required`).

**Message Sequence:**

1. **Client -> Server**: `tasks/cancel`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 7,
     "method": "tasks/cancel",
     "params": {
       "taskId": "task-abc-123"
     }
   }
   ```

2. (Server transitions task to `cancelled` state BEFORE responding)

3. **Server -> Client**: Updated task status
   ```json
   {
     "jsonrpc": "2.0",
     "id": 7,
     "result": {
       "taskId": "task-abc-123",
       "status": "cancelled",
       "statusMessage": "Task cancelled by client",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:00:45Z",
       "ttl": 60000
     }
   }
   ```

**Error Cases:**
- Task is already in terminal state (`completed`, `failed`, `cancelled`) -> `-32602`
  ```json
  {
    "jsonrpc": "2.0",
    "id": 7,
    "error": {
      "code": -32602,
      "message": "Cannot cancel task in terminal state"
    }
  }
  ```
- Unknown `taskId` -> `-32602` (Invalid params)
- Server does not support `capabilities.tasks.cancel` -> `-32601` (Method not found)

**Edge Cases:**
- `tasks/cancel` is a **request** (NOT `notifications/cancelled`) -- it has an `id` and returns a response
- Server MUST transition to `cancelled` BEFORE sending the response
- Any pending `tasks/result` calls for this task SHOULD receive a cancellation error
- `notifications/cancelled` is for cancelling in-flight JSON-RPC requests; `tasks/cancel` is specifically for task lifecycle management

---

## 14.6 Task with Elicitation

| Field | Value |
|-------|-------|
| **ID** | `TASK-006` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Server: `capabilities.tasks`, Client: `capabilities.elicitation` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Task is in `working` state. Server needs user input to proceed.

**Message Sequence:**

```
Client                                   Server
  |                                        |
  |--- tools/call { task: {...} } -------->|
  |                                        |
  |<------- CreateTaskResult (working) ----|
  |                                        |
  |  (Server begins processing...)         |
  |                                        |
  |<-- notifications/tasks/status ---------|
  |    (input_required)                    |
  |                                        |
  |<-- elicitation/create ----------------|
  |    { _meta: {                          |
  |        "io.modelcontextprotocol/       |
  |         related-task": {               |
  |           "taskId": "task-abc-123"     |
  |         }                              |
  |      },                                |
  |      message: "Please confirm...",     |
  |      requestedSchema: {...}            |
  |    }                                   |
  |                                        |
  |--- ElicitResult (accept) ------------>|
  |    { action: "accept",                 |
  |      content: { confirmed: true } }    |
  |                                        |
  |<-- notifications/tasks/status ---------|
  |    (working)                           |
  |                                        |
  |  (Server continues processing...)      |
  |                                        |
  |<-- notifications/tasks/status ---------|
  |    (completed)                         |
  |                                        |
  |--- tasks/result --------------------->|
  |                                        |
  |<-- CallToolResult --------------------|
  |    { _meta: {                          |
  |        "io.modelcontextprotocol/       |
  |         related-task": {               |
  |           "taskId": "task-abc-123"     |
  |         }                              |
  |      },                                |
  |      content: [...] }                  |
```

1. **Client -> Server**: `tools/call` with `task`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "deploy_service",
       "arguments": { "service": "api-gateway" },
       "task": { "ttl": 120000 }
     }
   }
   ```

2. **Server -> Client**: `CreateTaskResult`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "task": {
         "taskId": "task-deploy-001",
         "status": "working",
         "statusMessage": "Preparing deployment",
         "createdAt": "2025-01-01T00:00:00Z",
         "lastUpdatedAt": "2025-01-01T00:00:00Z",
         "ttl": 120000,
         "pollInterval": 3000
       }
     }
   }
   ```

3. **Server -> Client**: `notifications/tasks/status` (input_required)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tasks/status",
     "params": {
       "taskId": "task-deploy-001",
       "status": "input_required",
       "statusMessage": "Confirmation needed before deploying to production",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:00:10Z",
       "ttl": 120000
     }
   }
   ```

4. **Server -> Client**: `elicitation/create` with related-task metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 100,
     "method": "elicitation/create",
     "params": {
       "message": "Deploy api-gateway to production? This will affect 3 regions.",
       "requestedSchema": {
         "type": "object",
         "properties": {
           "confirmed": { "type": "boolean", "description": "Confirm deployment" }
         },
         "required": ["confirmed"]
       },
       "_meta": {
         "io.modelcontextprotocol/related-task": {
           "taskId": "task-deploy-001"
         }
       }
     }
   }
   ```

5. **Client -> Server**: `ElicitResult`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 100,
     "result": {
       "action": "accept",
       "content": { "confirmed": true }
     }
   }
   ```

6. **Server -> Client**: `notifications/tasks/status` (working)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tasks/status",
     "params": {
       "taskId": "task-deploy-001",
       "status": "working",
       "statusMessage": "Deploying to production...",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:00:15Z",
       "ttl": 120000
     }
   }
   ```

7. **Server -> Client**: `notifications/tasks/status` (completed)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tasks/status",
     "params": {
       "taskId": "task-deploy-001",
       "status": "completed",
       "statusMessage": "Deployment successful",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:01:00Z",
       "ttl": 120000
     }
   }
   ```

8. **Client -> Server**: `tasks/result`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "tasks/result",
     "params": { "taskId": "task-deploy-001" }
   }
   ```

9. **Server -> Client**: `CallToolResult` with related-task metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "content": [
         { "type": "text", "text": "Deployed api-gateway to 3 regions successfully." }
       ],
       "isError": false,
       "_meta": {
         "io.modelcontextprotocol/related-task": {
           "taskId": "task-deploy-001"
         }
       }
     }
   }
   ```

**Error Cases:**
- User declines elicitation (`action: "decline"`) -> Server may transition task to `failed` or `cancelled`
- Elicitation times out -> Server should handle gracefully, may fail the task

**Edge Cases:**
- Multiple elicitation rounds are possible (working -> input_required -> working -> input_required -> working -> completed)
- The `_meta.io.modelcontextprotocol/related-task` on the elicitation links it to the task context
- Client can cancel the task during `input_required` via `tasks/cancel`

---

## 14.7 Task with Sampling

| Field | Value |
|-------|-------|
| **ID** | `TASK-007` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Server: `capabilities.tasks`, Client: `capabilities.sampling` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Task is in `working` state. Server needs LLM sampling from the client to proceed.

**Message Sequence:**

```
Client                                   Server
  |                                        |
  |--- tools/call { task: {...} } -------->|
  |                                        |
  |<------- CreateTaskResult (working) ----|
  |                                        |
  |<-- sampling/createMessage ------------|
  |    { _meta: {                          |
  |        "io.modelcontextprotocol/       |
  |         related-task": {               |
  |           "taskId": "task-sample-001"  |
  |         }                              |
  |      },                                |
  |      messages: [...],                  |
  |      maxTokens: 1000                   |
  |    }                                   |
  |                                        |
  |--- CreateMessageResult --------------->|
  |    { role: "assistant",                |
  |      content: { type: "text",          |
  |        text: "..." },                  |
  |      model: "claude-3-opus" }          |
  |                                        |
  |<-- notifications/tasks/status ---------|
  |    (completed)                         |
  |                                        |
  |--- tasks/result --------------------->|
  |<-- CallToolResult --------------------|
```

1. **Client -> Server**: `tools/call` with `task`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "ai_assisted_review",
       "arguments": { "code": "function add(a, b) { return a + b; }" },
       "task": { "ttl": 30000 }
     }
   }
   ```

2. **Server -> Client**: `CreateTaskResult`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "task": {
         "taskId": "task-sample-001",
         "status": "working",
         "statusMessage": "Starting code review",
         "createdAt": "2025-01-01T00:00:00Z",
         "lastUpdatedAt": "2025-01-01T00:00:00Z",
         "ttl": 30000,
         "pollInterval": 2000
       }
     }
   }
   ```

3. **Server -> Client**: `sampling/createMessage` with related-task metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 200,
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         {
           "role": "user",
           "content": { "type": "text", "text": "Review this code: function add(a, b) { return a + b; }" }
         }
       ],
       "maxTokens": 500,
       "_meta": {
         "io.modelcontextprotocol/related-task": {
           "taskId": "task-sample-001"
         }
       }
     }
   }
   ```

4. **Client -> Server**: `CreateMessageResult`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 200,
     "result": {
       "role": "assistant",
       "content": { "type": "text", "text": "The add function looks correct but lacks type checking." },
       "model": "claude-3-opus-20240229"
     }
   }
   ```

5. Server completes task using sampling result

**Error Cases:**
- Client does not support sampling -> Server should not send `sampling/createMessage`; if it does, client returns `-32601`
- Sampling fails or is refused -> Server should handle gracefully, may fail the task

**Edge Cases:**
- Server may issue multiple sampling requests during a single task
- Sampling and elicitation may be interleaved within the same task
- The `_meta.io.modelcontextprotocol/related-task` ties the sampling request to the task

---

## 14.8 Task Status Notifications

| Field | Value |
|-------|-------|
| **ID** | `TASK-008` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client (or vice versa for client-side tasks) |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task exists and the peer supports push-style task status updates.

**Message Sequence:**

1. **Server -> Client**: `notifications/tasks/status`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tasks/status",
     "params": {
       "taskId": "task-abc-123",
       "status": "working",
       "statusMessage": "Processing 50% complete",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:00:30Z",
       "ttl": 60000,
       "pollInterval": 5000
     }
   }
   ```

2. **Server -> Client**: `notifications/tasks/status` (status change)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tasks/status",
     "params": {
       "taskId": "task-abc-123",
       "status": "completed",
       "statusMessage": "Done!",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:01:00Z",
       "ttl": 60000
     }
   }
   ```

**Error Cases:**
- Notification for unknown `taskId` -> Receiver SHOULD ignore

**Edge Cases:**
- Status notifications are fire-and-forget (no response expected, no `id` field)
- Notifications may arrive out of order; `lastUpdatedAt` can be used to resolve ordering
- After a terminal status notification, no further status notifications SHOULD be sent for that task
- `pollInterval` in a status notification updates the suggested polling interval

---

## 14.9 Task Progress

| Field | Value |
|-------|-------|
| **ID** | `TASK-009` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task was created from a request that included `_meta.progressToken`. Task is in a non-terminal state.

**Message Sequence:**

1. **Client -> Server**: `tools/call` with both `task` and `_meta.progressToken`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "batch_process",
       "arguments": { "items": 100 },
       "task": { "ttl": 300000 },
       "_meta": { "progressToken": "task-progress-001" }
     }
   }
   ```

2. **Server -> Client**: `CreateTaskResult` (returned immediately)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "task": {
         "taskId": "task-batch-001",
         "status": "working",
         "createdAt": "2025-01-01T00:00:00Z",
         "lastUpdatedAt": "2025-01-01T00:00:00Z",
         "ttl": 300000,
         "pollInterval": 10000
       }
     }
   }
   ```

3. **Server -> Client**: `notifications/progress` (continues after task creation)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "task-progress-001",
       "progress": 25,
       "total": 100,
       "message": "Processed 25 of 100 items"
     }
   }
   ```

4. (More progress notifications arrive over the task lifetime)

5. **Server -> Client**: `notifications/progress` (final, before terminal status)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "task-progress-001",
       "progress": 100,
       "total": 100,
       "message": "All items processed"
     }
   }
   ```

**Error Cases:**
- None specific beyond PROGRESS-001 error cases

**Edge Cases:**
- The `progressToken` from the original request spans the full task lifetime
- Progress notifications MUST stop after the task reaches a terminal status
- Progress notifications continue AFTER `CreateTaskResult` is returned (unlike non-task requests where progress stops at the response)
- Both `notifications/progress` and `notifications/tasks/status` may be sent concurrently for the same task

---

## 14.10 Task TTL Expiry

| Field | Value |
|-------|-------|
| **ID** | `TASK-010` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task was created with a `ttl` value. The task has reached a terminal state, and `ttl` milliseconds have elapsed since `createdAt`.

**Message Sequence:**

1. Task reaches terminal state (e.g., `completed`) at T=60s with `ttl=60000`

2. At T=120s (60s after creation = TTL exceeded), server MAY delete task and its results

3. **Client -> Server**: `tasks/get` (after TTL expiry)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 10,
     "method": "tasks/get",
     "params": { "taskId": "task-expired-001" }
   }
   ```

4. **Server -> Client**: Error (task deleted)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 10,
     "error": {
       "code": -32602,
       "message": "Task not found: task-expired-001"
     }
   }
   ```

5. **Client -> Server**: `tasks/result` (after TTL expiry)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 11,
     "method": "tasks/result",
     "params": { "taskId": "task-expired-001" }
   }
   ```

6. **Server -> Client**: Error (task deleted)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 11,
     "error": {
       "code": -32602,
       "message": "Task not found: task-expired-001"
     }
   }
   ```

**Error Cases:**
- Both `tasks/get` and `tasks/result` return `-32602` for deleted tasks
- `tasks/cancel` for an expired/deleted task returns `-32602`

**Edge Cases:**
- TTL is measured from `createdAt`, not from when the task reached terminal state
- `ttl: null` means the server decides the retention policy (could be indefinite)
- Server MAY keep tasks beyond their TTL; TTL is a hint for minimum retention
- Tasks in non-terminal states SHOULD NOT be deleted by TTL expiry alone

---

## 14.11 Task Failure

| Field | Value |
|-------|-------|
| **ID** | `TASK-011` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task was created and encounters an unrecoverable error during processing.

**Message Sequence:**

1. **Server -> Client**: `notifications/tasks/status` (failed)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/tasks/status",
     "params": {
       "taskId": "task-fail-001",
       "status": "failed",
       "statusMessage": "Out of memory: dataset exceeded 4GB limit",
       "createdAt": "2025-01-01T00:00:00Z",
       "lastUpdatedAt": "2025-01-01T00:00:45Z",
       "ttl": 60000
     }
   }
   ```

2. **Client -> Server**: `tasks/result` (retrieving failure details)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 12,
     "method": "tasks/result",
     "params": { "taskId": "task-fail-001" }
   }
   ```

3. **Server -> Client**: JSON-RPC error response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 12,
     "error": {
       "code": -32603,
       "message": "Task failed: Out of memory: dataset exceeded 4GB limit"
     }
   }
   ```

**Error Cases:**
- Task transitions directly from `working` to `failed`
- Task transitions from `input_required` to `failed` (if the input was invalid or timed out)

**Edge Cases:**
- `statusMessage` in the status notification SHOULD contain human-readable error details
- `tasks/result` for a failed task returns a JSON-RPC error, not a result
- Progress notifications MUST stop after `failed` status
- Failed is a terminal state: no further transitions are allowed

---

## 14.12 Tool-Level Task Negotiation

| Field | Value |
|-------|-------|
| **ID** | `TASK-012` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | Server: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Server advertises task support. Client queries tool list to discover per-tool task support.

**Message Sequence:**

1. **Client -> Server**: `tools/list`
   ```json
   { "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
   ```

2. **Server -> Client**: Tool list with `execution.taskSupport`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "tools": [
         {
           "name": "quick_echo",
           "description": "Echoes input immediately",
           "inputSchema": { "type": "object", "properties": { "text": { "type": "string" } } }
         },
         {
           "name": "batch_process",
           "description": "Processes large datasets",
           "inputSchema": { "type": "object", "properties": { "items": { "type": "number" } } },
           "execution": { "taskSupport": "required" }
         },
         {
           "name": "flexible_analysis",
           "description": "Analysis that optionally uses tasks",
           "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } },
           "execution": { "taskSupport": "optional" }
         }
       ]
     }
   }
   ```

**Negotiation Rules:**

| `execution.taskSupport` | Client sends `task` param | Behavior |
|---|---|---|
| `"required"` | Yes | Normal task flow |
| `"required"` | No | Error `-32601` (Method not found) |
| `"optional"` | Yes | Task flow |
| `"optional"` | No | Synchronous response |
| `"forbidden"` or absent | Yes | Error `-32601` (Method not found) |
| `"forbidden"` or absent | No | Synchronous response |

**Error Cases:**
- Calling a `"required"` tool without `task` param:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 2,
    "error": {
      "code": -32601,
      "message": "Tool 'batch_process' requires task parameter"
    }
  }
  ```
- Calling a `"forbidden"` tool with `task` param:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 3,
    "error": {
      "code": -32601,
      "message": "Tool 'quick_echo' does not support tasks"
    }
  }
  ```

**Edge Cases:**
- If `execution` or `execution.taskSupport` is absent, default behavior is `"forbidden"` (no task support)
- `"optional"` tools should work correctly in both task and non-task modes
- Tool task support can change between `tools/list` responses (e.g., after `notifications/tools/list_changed`)

---

## 14.13 Related-Task Metadata

| Field | Value |
|-------|-------|
| **ID** | `TASK-013` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | Peer: `capabilities.tasks` |
| **Existing Coverage** | :x: NONE |

**Preconditions:** A task exists. Any message related to the task is being sent.

**Message Sequence:**

All task-related messages MUST include `_meta` with the related-task annotation:

```json
{
  "_meta": {
    "io.modelcontextprotocol/related-task": {
      "taskId": "task-abc-123"
    }
  }
}
```

**Where it MUST appear:**
- `elicitation/create` params (when elicitation is part of a task)
- `sampling/createMessage` params (when sampling is part of a task)
- `tasks/result` response `result` field
- Any other server-to-client or client-to-server request made in the context of a task

**Where it is NOT needed (taskId already in params):**
- `tasks/get` params (has `taskId` directly)
- `tasks/list` response (each task has `taskId` directly)
- `tasks/cancel` params (has `taskId` directly)
- `notifications/tasks/status` params (has `taskId` directly)

**Error Cases:**
- Missing `_meta.io.modelcontextprotocol/related-task` on task-related messages -> Protocol violation; implementations SHOULD be lenient but MAY reject

**Edge Cases:**
- The `_meta` field is part of the standard MCP metadata mechanism
- The namespace `io.modelcontextprotocol/` prevents collision with user-defined metadata
- Receivers SHOULD use the related-task metadata to associate incoming requests with the correct task context

---
