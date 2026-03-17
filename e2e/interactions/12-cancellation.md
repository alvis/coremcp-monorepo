# 12. Cancellation Flows

Cancellation allows either side to signal that a previously-issued request should be abandoned. Cancellation is a notification (no response expected) and is best-effort.

## 12.1 Client Cancels Server Request

| Field | Value |
|-------|-------|
| **ID** | `CANCEL-001` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | None required (cancellation is always available) |
| **Existing Coverage** | NONE |

**Preconditions:** Client has sent a request to the server that is still in-flight (e.g., `tools/call` for a long-running operation).

**Message Sequence:**

1. **Client -> Server**: Original request (e.g., `tools/call`)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 42,
     "method": "tools/call",
     "params": {
       "name": "longRunningOperation",
       "arguments": { "duration": 60, "steps": 100 }
     }
   }
   ```

2. **Client -> Server**: `notifications/cancelled` (while request 42 is in-flight)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/cancelled",
     "params": {
       "requestId": 42,
       "reason": "User cancelled the operation"
     }
   }
   ```

3. **Server behavior**: Server SHOULD stop processing request 42, free associated resources, and NOT send a response for request 42.

**Params Schema:**
- `requestId` (RequestId, required per spec): The ID of the request to cancel (string or integer, matching the original request's `id`). Note: The SDK's `CancelledNotificationParamsSchema` marks `requestId` as `ZodOptional`, but implementations SHOULD always provide it since a cancellation without a `requestId` is meaningless.
- `reason` (string, optional): Human-readable reason for cancellation

**Important Constraints:**
- The `initialize` request MUST NOT be cancelled
- Cancellation is a notification - no response is expected
- Server MAY ignore the cancellation (e.g., if it does not recognize the requestId or has already completed processing)

**Error Cases:**
- Not applicable (notifications have no response)

**Edge Cases:**
- Cancel a request that the server has never received (lost in transit) - server ignores
- Cancel a request that the server has already completed - server ignores (see CANCEL-003)
- Cancel the same request multiple times - server handles idempotently
- Cancel with string requestId vs integer requestId - must match the type used in the original request
- Server was about to send an error response when cancellation arrives - server should suppress the error response

---

## 12.2 Server Cancels Client Request

| Field | Value |
|-------|-------|
| **ID** | `CANCEL-002` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | None required |
| **Existing Coverage** | NONE |

**Preconditions:** Server has sent a request to the client that is still in-flight (e.g., `sampling/createMessage` or `elicitation/create`).

**Message Sequence:**

1. **Server -> Client**: Original request (e.g., `sampling/createMessage`)
   ```json
   {
     "jsonrpc": "2.0",
     "id": "sample-req-1",
     "method": "sampling/createMessage",
     "params": {
       "messages": [
         { "role": "user", "content": { "type": "text", "text": "Analyze this data..." } }
       ],
       "maxTokens": 2000
     }
   }
   ```

2. **Server -> Client**: `notifications/cancelled`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/cancelled",
     "params": {
       "requestId": "sample-req-1",
       "reason": "Server no longer needs this sampling result"
     }
   }
   ```

3. **Client behavior**: Client SHOULD stop LLM generation, free resources, and NOT send a response for request "sample-req-1".

**Applicable Server-to-Client Requests that can be cancelled:**
- `sampling/createMessage`
- `elicitation/create`
- `roots/list`
- `ping`

**Error Cases:**
- Not applicable (notifications have no response)

**Edge Cases:**
- Client has already started LLM generation when cancellation arrives - client should abort generation
- Client has already prompted user for elicitation when cancellation arrives - client should dismiss the prompt
- Cancellation of `roots/list` - unlikely but valid; client should stop building roots list
- HTTP transport: cancellation notification delivery depends on open channel

---

## 12.3 Cancel Already-Completed Request

| Field | Value |
|-------|-------|
| **ID** | `CANCEL-003` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | NONE |

**Preconditions:** A request was sent, processed, and the response was already sent before the cancellation notification arrives.

**Message Sequence:**

1. **Client -> Server**: Request
   ```json
   {
     "jsonrpc": "2.0",
     "id": 99,
     "method": "tools/call",
     "params": { "name": "echo", "arguments": { "message": "fast" } }
   }
   ```

2. **Server -> Client**: Response (arrives quickly)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 99,
     "result": {
       "content": [{ "type": "text", "text": "Echo: fast" }]
     }
   }
   ```

3. **Client -> Server**: Cancellation (arrives after response was already sent)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/cancelled",
     "params": {
       "requestId": 99,
       "reason": "Took too long"
     }
   }
   ```

4. **Server behavior**: Server receives cancellation for completed request 99. Server MUST handle gracefully by ignoring the notification. No error should be raised.

**Error Cases:**
- Not applicable (both sides handle gracefully)

**Edge Cases:**
- Sender already received the response before the cancellation was sent - sender should use the response normally
- Receiver has cleaned up request state - cancellation for unknown ID should be silently ignored
- This is a normal race condition in asynchronous protocols and MUST NOT cause errors on either side

---

## 12.4 Race Condition: Response After Cancel

| Field | Value |
|-------|-------|
| **ID** | `CANCEL-004` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | NONE |

**Preconditions:** A request is in-flight. The sender sends a cancellation, but the receiver has already started sending the response (or sends it before processing the cancellation).

**Message Sequence:**

1. **Client -> Server**: Request
   ```json
   {
     "jsonrpc": "2.0",
     "id": 200,
     "method": "tools/call",
     "params": { "name": "longRunningOperation", "arguments": { "duration": 5, "steps": 10 } }
   }
   ```

2. **Client -> Server**: Cancellation (sent after 2 seconds)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/cancelled",
     "params": {
       "requestId": 200,
       "reason": "Timeout exceeded"
     }
   }
   ```

3. **Server -> Client**: Response (server finished just before processing the cancellation)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 200,
     "result": {
       "content": [{ "type": "text", "text": "Long running operation completed. Duration: 5 seconds, Steps: 10." }]
     }
   }
   ```

**Sender (Client) Behavior:**
- Client sent cancellation, so it SHOULD ignore any late-arriving response for request 200
- Client MAY choose to use the response if it is still useful
- Client MUST NOT treat the late response as an error

**Receiver (Server) Behavior:**
- Server MAY have already sent the response before processing the cancellation
- Server MUST NOT send an error because the request was "cancelled but also completed"
- If server processed cancellation first, it should suppress the response

**Error Cases:**
- Not applicable (this is expected behavior, not an error condition)

**Edge Cases:**
- Transport ordering: on stdio, messages are ordered; on HTTP with separate channels, ordering is not guaranteed
- Both cancellation and response may arrive in the same transport frame/batch
- Server sends partial progress notifications before both response and cancellation
- Multiple in-flight requests: cancellation for one should not affect others
- Sender retries the same operation after cancelling - new request gets a new ID
- Double delivery: if transport delivers response twice, client must handle idempotently

