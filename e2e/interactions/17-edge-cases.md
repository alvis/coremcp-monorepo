# 17. Real-World Edge Cases

These interactions are NOT part of the formal MCP specification but represent real-world scenarios that robust e2e tests should cover. These test the resilience and correctness of implementations under adverse conditions.

---

## 17.1 Network Interruption Mid-Request

| Field | Value |
|-------|-------|
| **ID** | `EDGE-001` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session with a request in-flight.

**Scenario:**

Connection drops while a request is pending and no response has been received.

**Expected Behavior:**

- **HTTP (SSE):** SSE stream closes unexpectedly. Client detects stream termination. Pending request promise should reject with a connection error after timeout.
- **stdio:** Pipe breaks (SIGPIPE or EOF on stdout). Client detects pipe closure. Pending request promise should reject.

**What to Test:**
1. Send a long-running request (e.g., `longRunningOperation`)
2. Kill the connection mid-request (close SSE, kill stdio process)
3. Verify pending request rejects with appropriate error
4. Verify client enters disconnected state
5. Verify no unhandled promise rejections or crashes

**Edge Cases:**
- Partial JSON message received before disconnection -> Must not cause parse errors that crash the client
- Multiple pending requests when connection drops -> All should reject
- Progress notifications may have been received before the drop

---

## 17.2 Reconnection After Network Failure

| Field | Value |
|-------|-------|
| **ID** | `EDGE-002` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | `client-connector-http.spec.e2e.ts:385` (disconnect and reconnect), `server-transport-http.spec.e2e.ts:486` (new session after reconnection) |

**Preconditions:** An MCP session that was interrupted by a network failure.

**Scenario:**

Client detects disconnection and attempts to re-establish the session.

**Expected Behavior:**

- **HTTP:** Client reconnects SSE stream with `Last-Event-ID` header for event replay. If session is still valid on server, session resumes. If session expired (server returns 404), client must reinitialize from scratch.
- **stdio:** Client restarts the server subprocess and performs full initialization handshake.

**What to Test:**
1. Establish session and perform some operations
2. Disconnect (gracefully or forcefully)
3. Reconnect
4. Verify session state:
   - HTTP: Check if session ID is preserved or new
   - stdio: Verify full reinitialization
5. Verify operations work after reconnection

**Edge Cases:**
- Server-side state (subscriptions, logging level) may be lost after reconnection
- HTTP session ID may be reused if server still has the session
- stdio always requires full reinitialization (no session persistence)
- Race condition: server sends notification during reconnection

---

## 17.3 Load Balancing -- Request on Different Server

| Field | Value |
|-------|-------|
| **ID** | `EDGE-003` |
| **Since** | N/A (deployment concern) |
| **Transport** | HTTP |
| **Direction** | Client -> Server |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Multiple MCP server instances behind a load balancer. Client has an active session with instance A.

**Scenario:**

Load balancer routes a request to instance B, which does not have the session.

**Expected Behavior:**

1. Client sends request with `Mcp-Session-Id` header
2. Instance B does not recognize the session ID
3. Server returns HTTP 404 (session not found)
4. Client reinitializes with a new session (which may land on instance B)

**What to Test:**
1. Establish session
2. Simulate sticky session failure (send request with invalid session ID)
3. Verify client receives 404
4. Verify client reinitializes successfully
5. Verify operations work on the new session

**Edge Cases:**
- Shared session store (e.g., Redis) eliminates this problem
- Client SHOULD NOT retry the same request on the new session without reinitialization
- Session migration may cause loss of server-side state (subscriptions, progress)

---

## 17.4 Concurrent Requests

| Field | Value |
|-------|-------|
| **ID** | `EDGE-004` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | `client-connector-http.spec.e2e.ts:343` (3 concurrent tool calls), `server-transport-stdio.spec.e2e.ts:434` (5 concurrent operations), `server-transport-http.spec.e2e.ts:439` (6 concurrent operations) |

**Preconditions:** An active MCP session.

**Scenario:**

Multiple requests sent concurrently with different `id` values. Server may respond out of order.

**Expected Behavior:**

- All requests receive correct responses matched by `id`
- Progress notifications for different requests are correctly routed by `progressToken`
- No response cross-contamination

**What to Test:**
1. Send N requests simultaneously (e.g., 10+ mixed tools/call, resources/read, prompts/get)
2. Verify all responses received
3. Verify each response matches the correct request by `id`
4. Verify no timeouts under normal conditions
5. Measure response time compared to sequential execution

**Edge Cases:**
- Server may process requests in parallel or serially depending on implementation
- HTTP: Multiple POST requests may use different SSE streams
- stdio: All requests share a single stdin/stdout pair; responses must be demultiplexed by `id`
- Very high concurrency (100+ requests) may trigger server-side throttling

---

## 17.5 Request Timeout + Cancellation

| Field | Value |
|-------|-------|
| **ID** | `EDGE-005` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session. Client has a request timeout configured.

**Scenario:**

A request exceeds the timeout threshold. Client sends cancellation and stops waiting.

**Expected Behavior:**

1. Client sends request
2. Timeout expires
3. Client sends `notifications/cancelled` with the request ID
4. Client rejects the pending request promise with a timeout error
5. Server receives cancellation and stops processing (best effort)

**What to Test:**
1. Send a request that will take longer than the timeout (e.g., `longRunningOperation` with high duration)
2. Configure a short timeout
3. Verify `notifications/cancelled` is sent when timeout expires
4. Verify the client's pending promise rejects
5. Verify subsequent requests still work (connection is not broken)
6. Verify server handles the cancellation gracefully

**Edge Cases:**
- Server may finish processing before receiving the cancellation -> Client ignores the late response
- Server may not support cancellation -> Still processes and returns a response that client ignores
- Cancellation is a notification (fire-and-forget), not a request

---

## 17.6 Backpressure / High-Frequency Requests

| Field | Value |
|-------|-------|
| **ID** | `EDGE-006` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | None |
| **Existing Coverage** | ⚠️ `server-transport-stdio/17-edge-cases.spec.e2e.ts:141` (10 sequential rapid requests; below 50-100 target) |

**Preconditions:** An active MCP session.

**Scenario:**

Client sends many requests in rapid succession, potentially overwhelming the server.

**Expected Behavior:**

- Server handles all requests without crashing
- Server may queue, throttle, or reject excess requests
- All accepted requests eventually receive responses
- No data corruption or message interleaving

**What to Test:**
1. Send 50-100 requests as fast as possible
2. Verify all requests receive responses (or graceful rejection)
3. Verify no crashes, hangs, or corrupted responses
4. Measure memory usage during burst
5. Verify connection remains stable after burst

**Edge Cases:**
- stdio: Buffer overflow on stdin pipe if server cannot consume fast enough
- HTTP: Server may return 429 (Too Many Requests) or 503 (Service Unavailable)
- Message ordering: responses may arrive out of order under load
- Node.js backpressure: writable stream may emit `drain` events

---

## 17.7 Large Payload Handling

| Field | Value |
|-------|-------|
| **ID** | `EDGE-007` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session.

**Scenario:**

Very large content in resource responses, tool results, or prompt messages.

**Expected Behavior:**

- Large payloads are transmitted and received correctly
- No truncation or corruption
- Memory usage is reasonable (streaming where possible)

**What to Test:**
1. Resource with > 1MB text content -> Verify complete and uncorrupted
2. Tool result with large base64 binary blob -> Verify complete decoding
3. Resource list with 10,000+ items -> Verify pagination works correctly
4. Deeply nested JSON structures -> Verify parsing
5. Very long single-line strings (> 64KB) -> Verify no line-buffer issues

**Edge Cases:**
- stdio: Single JSON message must be on one line (no newlines except as delimiter)
- HTTP: Large SSE events may be chunked by intermediary proxies
- Memory: Server/client should not hold entire large payloads in memory unnecessarily
- Some implementations may have undocumented size limits

---

## 17.8 Session Migration After Server Restart

| Field | Value |
|-------|-------|
| **ID** | `EDGE-008` |
| **Since** | N/A (deployment concern) |
| **Transport** | HTTP |
| **Direction** | Client -> Server |
| **Capabilities** | None |
| **Existing Coverage** | `server-transport-http.spec.e2e.ts:128` (graceful shutdown), `server-transport-http.spec.e2e.ts:486` (new session after reconnection) |

**Preconditions:** An active HTTP MCP session. Server restarts (planned or unplanned).

**Scenario:**

HTTP server restarts. Existing session IDs become invalid. Client must recover.

**Expected Behavior:**

1. Client sends request with `Mcp-Session-Id` header
2. Server returns 404 (session not found)
3. Client reinitializes with a new `initialize` request
4. Server returns new session ID
5. Client resumes operations on new session

**What to Test:**
1. Establish session and make some requests
2. Kill/restart the server process
3. Wait for server to be available again
4. Send request with old session ID
5. Verify 404 response
6. Verify successful reinitialization
7. Verify all operations work on new session

**Edge Cases:**
- Server-side state is lost: subscriptions, logging level, in-progress operations
- Client should re-subscribe to resources after reinitialization
- In-progress tool calls will fail and need to be retried
- Progress tokens from previous session are invalid

---

## 17.9 Partial/Incomplete JSON

| Field | Value |
|-------|-------|
| **ID** | `EDGE-009` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session.

**Scenario:**

Truncated or incomplete JSON message is received by either peer.

**Expected Behavior:**

- **stdio:** Newline delimiter means incomplete JSON is detected when the next line arrives (or pipe closes). Parser should reject the incomplete JSON and return a parse error.
- **HTTP:** Connection closed mid-SSE event. Client detects incomplete data in the event buffer.

**What to Test:**
1. Send valid request then inject partial JSON (test at transport level)
2. Verify parse error is returned (or handled gracefully)
3. Verify no crash or hang
4. Verify connection remains usable (stdio) or client reconnects (HTTP)
5. Verify subsequent valid messages are processed correctly

**Edge Cases:**
- Partial JSON followed by valid JSON on next line (stdio) -> First is parse error, second should work
- UTF-8 multi-byte character split across chunks -> Must buffer correctly
- Empty lines between messages (stdio) -> Should be ignored gracefully

---

## 17.10 Server Request Before Init Complete

| Field | Value |
|-------|-------|
| **ID** | `EDGE-010` |
| **Since** | N/A (protocol compliance) |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** MCP session initialization is in progress. Client has sent `initialize` but has NOT yet sent `notifications/initialized`.

**Scenario:**

Server sends a request (other than `ping` or `notifications/message`) before receiving `notifications/initialized`.

**Expected Behavior:**

Per the specification, only `ping` and logging notifications are allowed before initialization completes. Other requests/notifications from the server should be rejected or ignored by the client.

**What to Test:**
1. Connect at transport level (do NOT send `notifications/initialized`)
2. Server attempts to send `sampling/createMessage` or `roots/list`
3. Verify client rejects with an appropriate error or ignores the message
4. Verify initialization can still complete normally afterward

**Edge Cases:**
- `ping` and `notifications/message` are allowed before init and SHOULD be handled
- Server sending `notifications/tools/list_changed` before init -> Client SHOULD ignore
- This is a protocol violation by the server; clients should be defensive

---

## 17.11 Client Request Before Init Complete

| Field | Value |
|-------|-------|
| **ID** | `EDGE-011` |
| **Since** | N/A (protocol compliance) |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client has NOT yet completed initialization (no `initialize` request sent, or `initialize` sent but no `notifications/initialized` sent).

**Scenario:**

Client sends a request other than `initialize` or `ping` before initialization completes.

**Expected Behavior:**

Server SHOULD reject the request with an error or ignore it. Only `initialize` and `ping` are valid before initialization.

**What to Test:**
1. Connect at transport level
2. Send `tools/list` before `initialize`
3. Verify server rejects or ignores the request
4. Send `initialize`, receive response, send `notifications/initialized`
5. Verify `tools/list` now works correctly

**Edge Cases:**
- `ping` is allowed before init -> Server SHOULD respond with empty result
- Sending `initialize` twice -> Server SHOULD reject the second `initialize`
- Client sending requests between `initialize` response and `notifications/initialized` -> Server MAY queue or reject

---

## 17.12 Duplicate Request IDs

| Field | Value |
|-------|-------|
| **ID** | `EDGE-012` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | :x: NONE |

**Preconditions:** An active MCP session.

**Scenario:**

Two requests are sent with the same `id` value (which violates the JSON-RPC specification).

**Expected Behavior:**

Behavior is undefined per JSON-RPC spec. Implementations should handle gracefully without crashing.

**What to Test:**
1. Send request A with `id: 1`
2. Before A responds, send request B with `id: 1`
3. Observe behavior:
   - Server may return error for the duplicate
   - Server may process both and return two responses with the same id
   - Server may only process the first and ignore the second
4. Verify no crash, hang, or data corruption
5. Verify subsequent requests with unique IDs still work

**Edge Cases:**
- Client-side: Response for duplicate ID may be delivered to wrong pending request
- This is a programming error; implementations should be defensive
- Some implementations use monotonically increasing IDs to prevent this

---

## 17.13 Message Ordering Guarantees

| Field | Value |
|-------|-------|
| **ID** | `EDGE-013` |
| **Since** | N/A (implementation concern) |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None |
| **Existing Coverage** | ✅ `server-transport-stdio/17-edge-cases.spec.e2e.ts:161` (ordered verification) ✅ `server-transport-http/17-edge-cases.spec.e2e.ts:239` (sequential requests) |

**Preconditions:** An active MCP session.

**Scenario:**

Verify that message ordering guarantees are maintained per transport.

**Expected Behavior:**

- **stdio:** Messages on a single pipe are strictly ordered. Responses arrive in the order the server processes them (which may differ from request order).
- **HTTP:** Each POST gets its own response stream. Multiple concurrent streams may interleave. Within a single SSE stream, events are ordered.

**What to Test:**
1. Send N sequential requests (e.g., echo with incrementing numbers)
2. Verify all responses are received
3. For stdio: Verify responses arrive in a consistent order (server processing order)
4. For HTTP: Verify responses arrive on the correct streams
5. Verify notifications are interleaved correctly with responses
6. Test causal ordering: if request B depends on side effects of request A, ensure B sees A's effects

**Edge Cases:**
- stdio: If server processes requests out of order, responses arrive out of request order (valid behavior)
- HTTP: Server MAY batch multiple responses into a single SSE stream
- Notifications may arrive between request and response
- JSON-RPC has no ordering guarantee; clients MUST match by `id`, never by position
