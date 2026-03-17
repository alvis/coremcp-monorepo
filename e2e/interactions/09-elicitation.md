# 9. Elicitation Flows (Server -> Client)

Server requests user input from the client. The client presents UI to the user and returns the user's response.

## 9.1 Elicitation - Form Mode

| Field | Value |
|-------|-------|
| **ID** | `ELICITATION-001` |
| **Since** | 2025-06-18 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.elicitation` (bare `{}` is sufficient for form mode) |
| **Existing Coverage** | ✅ `server-transport-http/09-elicitation.spec.e2e.ts:192` ✅ `server-transport-stdio/09-elicitation.spec.e2e.ts:103` |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.elicitation` (bare `{}` enables form mode; `capabilities.elicitation.form` is also accepted).

**Message Sequence:**

1. **Server -> Client**: `elicitation/create`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "elicitation/create",
     "params": {
       "message": "Please provide your API key to continue",
       "requestedSchema": {
         "type": "object",
         "properties": {
           "apiKey": {
             "type": "string",
             "title": "API Key",
             "description": "Your API key for the external service"
           }
         },
         "required": ["apiKey"]
       }
     }
   }
   ```

2. **Client -> Server**: Elicitation result (user accepts)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "action": "accept",
       "content": {
         "apiKey": "sk-abc123def456"
       }
     }
   }
   ```

**Params Schema:**
- `message` (string, required): Human-readable message to display to the user
- `requestedSchema` (object, required): JSON Schema describing the expected input structure

**Result Schema:**
- `action` (string, required): User's action - `"accept"`, `"decline"`, or `"cancel"`
- `content` (object, optional): User-submitted form data matching the requestedSchema (present only when `action` is `"accept"`)

**Example with multiple fields:**

Request:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "elicitation/create",
  "params": {
    "message": "Configure the deployment settings",
    "requestedSchema": {
      "type": "object",
      "properties": {
        "environment": {
          "type": "string",
          "title": "Environment",
          "enum": ["staging", "production"]
        },
        "replicas": {
          "type": "number",
          "title": "Replica Count",
          "description": "Number of replicas to deploy",
          "minimum": 1,
          "maximum": 10
        },
        "autoScale": {
          "type": "boolean",
          "title": "Enable Auto-scaling"
        }
      },
      "required": ["environment", "replicas"]
    }
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "action": "accept",
    "content": {
      "environment": "staging",
      "replicas": 3,
      "autoScale": true
    }
  }
}
```

**Error Cases:**
- Client does not support elicitation -> method not found error:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32601,
      "message": "Method not found: elicitation/create"
    }
  }
  ```
- Invalid requestedSchema -> client returns invalid params:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32602,
      "message": "Invalid params: requestedSchema is not valid JSON Schema"
    }
  }
  ```

**Edge Cases:**
- Schema with nested objects - client must render nested forms
- Schema with `enum` values - client should present as dropdown/select
- Schema with `default` values - client should pre-populate
- User takes a very long time to respond - no timeout defined by protocol (caller may cancel)
- Content that does not match requestedSchema - client SHOULD validate before sending
- Empty requestedSchema `{ "type": "object", "properties": {} }` - confirmation dialog with no input fields

---

## 9.2 Elicitation - URL Mode

| Field | Value |
|-------|-------|
| **ID** | `ELICITATION-002` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.elicitation.url` |
| **Existing Coverage** | NONE |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.elicitation.url`.

**Message Sequence:**

1. **Server -> Client**: `elicitation/create` with URL mode
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "elicitation/create",
     "params": {
       "mode": "url",
       "message": "Please authorize in your browser",
       "url": "https://example.com/auth/callback?state=xyz",
       "elicitationId": "elicit-abc-123",
       "requestedSchema": {
         "type": "object",
         "properties": {}
       }
     }
   }
   ```

2. **Client -> Server**: Immediate acknowledgement (client opens URL in browser)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "action": "accept",
       "content": {}
     }
   }
   ```

   Or if the client knows the outcome immediately:
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "action": "accept",
       "content": {
         "authCode": "code-from-redirect"
       }
     }
   }
   ```

**Additional Params (URL mode):**
- `mode` (string, required for URL mode): Must be `"url"`
- `url` (string, required for URL mode): URL for the out-of-band interaction
- `elicitationId` (string, required for URL mode): Correlation ID used in the completion notification

**Error Cases:**
- Client does not support URL mode elicitation:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32042,
      "message": "URL elicitation mode not supported"
    }
  }
  ```
- Invalid URL provided:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32602,
      "message": "Invalid params: url is not a valid URL"
    }
  }
  ```

**Edge Cases:**
- User closes browser without completing flow - client should eventually respond with `"decline"` or `"cancel"`
- URL redirects to a different domain - client should still handle
- Multiple URL elicitations in flight - each has a unique `elicitationId`
- URL is unreachable - client should report error to user and respond with `"cancel"`
- Headless client with no browser - should return error code -32042

---

## 9.3 Elicitation Complete Notification

| Field | Value |
|-------|-------|
| **ID** | `ELICITATION-003` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Related to `capabilities.elicitation.url` |
| **Existing Coverage** | NONE |

**Preconditions:** A URL-mode elicitation (ELICITATION-002) was previously initiated. The out-of-band interaction at the URL has completed (e.g., the server's backend received a callback).

**Message Sequence:**

1. **Server -> Client**: `notifications/elicitation/complete` (notification, no id)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/elicitation/complete",
     "params": {
       "elicitationId": "elicit-abc-123"
     }
   }
   ```

**Params Schema:**
- `elicitationId` (string, required): The correlation ID from the original URL-mode `elicitation/create` request

**Error Cases:**
- Not applicable (notifications have no response and cannot produce errors)

**Edge Cases:**
- Notification arrives before client has finished opening the URL - client should still handle
- Notification arrives after client already responded to the original elicitation/create - client should ignore
- Unknown elicitationId - client SHOULD ignore the notification gracefully
- Multiple completion notifications for the same elicitationId - client should handle idempotently

---

## 9.4 User Declines/Cancels Elicitation

| Field | Value |
|-------|-------|
| **ID** | `ELICITATION-004` |
| **Since** | 2025-06-18 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.elicitation.form` or `capabilities.elicitation.url` |
| **Existing Coverage** | NONE |

**Preconditions:** Server has sent an `elicitation/create` request to the client (either form or URL mode).

**Message Sequence (Decline):**

1. **Server -> Client**: `elicitation/create` (any mode)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "elicitation/create",
     "params": {
       "message": "Please provide your credentials",
       "requestedSchema": {
         "type": "object",
         "properties": {
           "username": { "type": "string" },
           "password": { "type": "string" }
         },
         "required": ["username", "password"]
       }
     }
   }
   ```

2. **Client -> Server**: User declines
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "action": "decline"
     }
   }
   ```

**Message Sequence (Cancel):**

2. **Client -> Server**: User cancels
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "action": "cancel"
     }
   }
   ```

**Action Semantics:**
- `"decline"`: User explicitly chose not to provide input (soft refusal)
- `"cancel"`: User wants to abort the entire operation (hard refusal)

**Error Cases:**
- Server receives decline/cancel and must handle gracefully - no further elicitation attempts for same flow

**Edge Cases:**
- Server attempts to re-elicit after decline - allowed, but server should respect user intent
- Server attempts to re-elicit after cancel - server SHOULD NOT retry
- Distinction between decline and cancel is guidance for server behavior, not enforced by protocol
- Content field MUST NOT be present when action is "decline" or "cancel"

---

## 9.5 Elicitation - Task-Augmented (Client-Side Async Tasks)

| Field | Value |
|-------|-------|
| **ID** | `ELICITATION-005` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.elicitation` AND `capabilities.tasks.requests.elicitation.create` |
| **Existing Coverage** | NONE |

**Note:** This flow describes client-side async task elicitation, where the client returns a `CreateTaskResult` with `input_required` status. This is distinct from server-side `_meta` related-task injection (see ELICITATION-006 below), which is what the current E2E tests validate.

**Preconditions:** Client and server have completed the initialization handshake. Client advertises both elicitation support and `capabilities.tasks.requests.elicitation.create`.

**Message Sequence:**

1. **Server -> Client**: `elicitation/create` with `task` metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "elicitation/create",
     "params": {
       "message": "Please review and approve this configuration",
       "requestedSchema": {
         "type": "object",
         "properties": {
           "approved": { "type": "boolean", "title": "Approve?" }
         },
         "required": ["approved"]
       },
       "task": {
         "ttl": 300000
       }
     }
   }
   ```

2. **Client -> Server**: CreateTaskResult
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "taskId": "task-elicit-789",
       "status": "input_required",
       "statusMessage": "Waiting for user input",
       "createdAt": "2026-03-16T10:00:00Z",
       "lastUpdatedAt": "2026-03-16T10:00:00Z",
       "ttl": 300000,
       "pollInterval": 5000
     }
   }
   ```

3. Follows the same task polling/notification pattern as SAMPLING-004 (tasks/get, tasks/result, notifications/tasks/status).

4. **Final result** (via `tasks/result`):
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "result": {
       "action": "accept",
       "content": {
         "approved": true
       }
     }
   }
   ```

**Error Cases:**
- Same task-related errors as SAMPLING-004
- User never responds and TTL expires - task transitions to `"failed"` status

**Edge Cases:**
- Task with `input_required` status indicates waiting for user interaction
- User decline/cancel while task is active - task transitions to `"completed"` with decline/cancel action
- Server cancels task before user responds via `tasks/cancel`
- Very long TTL for asynchronous approval workflows (hours/days)

---

## 9.6 Elicitation - Server-Side Related-Task Metadata

| Field | Value |
|-------|-------|
| **ID** | `ELICITATION-006` |
| **Since** | 2025-11-25 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.elicitation` |
| **Existing Coverage** | ✅ `server-transport-http/09-elicitation.spec.e2e.ts:416` ✅ `server-transport-stdio/09-elicitation.spec.e2e.ts:323` |

**Note:** This flow describes the server-side `_meta` related-task injection pattern. When the server triggers `elicitation/create` from within a running server-side task context, it SHOULD include `_meta` with `io.modelcontextprotocol/related-task` containing the task ID. This is orthogonal to ELICITATION-005 (client-side async tasks).

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.elicitation`. Server is executing a tool call within a task context.

**Message Sequence:**

1. **Server -> Client**: `elicitation/create` with `_meta` containing related-task metadata
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "elicitation/create",
     "params": {
       "message": "Please provide input",
       "requestedSchema": {
         "type": "object",
         "properties": {
           "value": { "type": "string" }
         }
       },
       "_meta": {
         "io.modelcontextprotocol/related-task": "task-abc-123"
       }
     }
   }
   ```

2. **Client -> Server**: Normal elicitation result

**Protocol Rules:**
- The `_meta` field with `io.modelcontextprotocol/related-task` SHOULD be present when elicitation is triggered from within a task execution context
- The value SHOULD equal the task ID string of the originating task

---
