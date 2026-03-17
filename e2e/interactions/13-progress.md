# 13. Progress Flows

Progress notifications allow the sender of a request to receive incremental updates on long-running operations. Either side (client or server) can send progress notifications for requests they have received, identified by a `progressToken` included in the original request's `_meta`.

---

## 13.1 Progress with Known Total

| Field | Value |
|-------|-------|
| **ID** | `PROGRESS-001` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required (progress is a base protocol feature) |
| **Existing Coverage** | `client-connector-http.spec.e2e.ts:170` (longRunningOperation with progress, but no progressToken verification) |

**Preconditions:** An active MCP session. The request sender includes `_meta.progressToken` in a request that triggers a long-running operation.

**Message Sequence:**

1. **Client -> Server**: `tools/call` with `_meta.progressToken`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "long_operation",
       "arguments": {},
       "_meta": {
         "progressToken": "progress-123"
       }
     }
   }
   ```

2. **Server -> Client**: `notifications/progress` (first update)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-123",
       "progress": 1,
       "total": 5
     }
   }
   ```

3. **Server -> Client**: `notifications/progress` (intermediate updates, progress 2 through 4)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-123",
       "progress": 3,
       "total": 5
     }
   }
   ```

4. **Server -> Client**: `notifications/progress` (final update)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-123",
       "progress": 5,
       "total": 5
     }
   }
   ```

   Note: The `message` field is optional and MAY be included for human-readable progress descriptions.

5. **Server -> Client**: `tools/call` response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [
         { "type": "text", "text": "Operation completed successfully." }
       ],
       "isError": false
     }
   }
   ```

**Error Cases:**
- Server sends progress with unknown `progressToken` -> Client SHOULD ignore
- `progress` value is negative -> Invalid, client SHOULD ignore
- `progress` exceeds `total` -> Invalid, client SHOULD ignore

**Edge Cases:**
- Progress value MUST increase monotonically; non-increasing values SHOULD be ignored
- Multiple concurrent requests with different `progressToken` values must not cross-contaminate
- Progress notifications may arrive after the response (race condition) and SHOULD be ignored by the client once the response is received

---

## 13.2 Progress with Unknown Total

| Field | Value |
|-------|-------|
| **ID** | `PROGRESS-002` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session. Request includes `_meta.progressToken`. The server does not know the total amount of work upfront.

**Message Sequence:**

1. **Client -> Server**: `tools/call` with `_meta.progressToken`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "tools/call",
     "params": {
       "name": "streaming_analysis",
       "arguments": { "data": "..." },
       "_meta": { "progressToken": "progress-456" }
     }
   }
   ```

2. **Server -> Client**: `notifications/progress` (no `total` field)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-456",
       "progress": 10,
       "message": "Processing batch 1..."
     }
   }
   ```

3. **Server -> Client**: `notifications/progress` (still no `total`)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-456",
       "progress": 35,
       "message": "Processing batch 2..."
     }
   }
   ```

4. **Server -> Client**: `tools/call` response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "content": [
         { "type": "text", "text": "Analysis complete." }
       ]
     }
   }
   ```

**Error Cases:**
- None specific beyond PROGRESS-001 error cases

**Edge Cases:**
- Client SHOULD display indeterminate progress (e.g., spinner) when `total` is omitted
- Server MAY start without `total` and add it later as work becomes known
- `progress` MUST still increase monotonically even without `total`

---

## 13.3 Progress Resets Timeout

| Field | Value |
|-------|-------|
| **ID** | `PROGRESS-003` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session. Client has a request timeout configured. Request includes `_meta.progressToken`.

**Message Sequence:**

1. **Client -> Server**: `tools/call` with `_meta.progressToken`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "method": "tools/call",
     "params": {
       "name": "very_long_operation",
       "arguments": {},
       "_meta": { "progressToken": "progress-789" }
     }
   }
   ```

2. **Server -> Client**: `notifications/progress` at T+25s (resets 30s timeout)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-789",
       "progress": 33,
       "total": 100,
       "message": "Phase 1 complete"
     }
   }
   ```

3. **Server -> Client**: `notifications/progress` at T+50s (resets timeout again)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-789",
       "progress": 66,
       "total": 100,
       "message": "Phase 2 complete"
     }
   }
   ```

4. **Server -> Client**: Response at T+75s (within reset timeout window)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 3,
     "result": {
       "content": [
         { "type": "text", "text": "Done." }
       ]
     }
   }
   ```

**Error Cases:**
- No progress received within timeout -> Client sends `notifications/cancelled` and stops waiting

**Edge Cases:**
- Implementation SHOULD track per-request timeout timers
- Timeout reset applies only to the specific request identified by the `progressToken`
- Maximum timeout (PROGRESS-004) still enforced regardless of resets

---

## 13.4 Maximum Timeout Despite Progress

| Field | Value |
|-------|-------|
| **ID** | `PROGRESS-004` |
| **Since** | 2025-03-26 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session. Client has both per-progress timeout and maximum overall timeout configured.

**Message Sequence:**

1. **Client -> Server**: `tools/call` with `_meta.progressToken`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 4,
     "method": "tools/call",
     "params": {
       "name": "infinite_operation",
       "arguments": {},
       "_meta": { "progressToken": "progress-max" }
     }
   }
   ```

2. **Server -> Client**: `notifications/progress` (keeps arriving, resetting per-progress timeout)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/progress",
     "params": {
       "progressToken": "progress-max",
       "progress": 1,
       "total": 1000000,
       "message": "Step 1 of 1000000"
     }
   }
   ```

3. (Progress notifications continue arriving periodically, but max timeout expires)

4. **Client -> Server**: `notifications/cancelled` (max timeout exceeded)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/cancelled",
     "params": {
       "requestId": 4,
       "reason": "Maximum timeout exceeded"
     }
   }
   ```

5. Client stops waiting for the response.

**Error Cases:**
- Server ignores cancellation -> Client MUST still stop waiting; server MAY continue processing

**Edge Cases:**
- Implementations SHOULD enforce a maximum timeout to prevent unbounded waits
- The maximum timeout is a safety net; well-behaved servers should complete or fail within reasonable time
- After cancellation, if the server eventually sends a response, the client SHOULD ignore it (unknown request ID)

---
