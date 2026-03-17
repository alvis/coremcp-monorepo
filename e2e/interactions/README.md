# MCP Interaction Flows for E2E Testing

This document catalogs all MCP (Model Context Protocol) interaction flows as defined in the specification through version 2025-11-25. Each interaction documents the exact JSON-RPC message sequence, error cases, edge cases, and existing e2e test coverage status.

**Coverage Legend:**
- ✅ = Covered by existing e2e tests (with file:line reference)
- ❌ = Not yet covered (needs new e2e test)
- ⚠️ = Partially covered

---

## Table of Contents

| # | Section | Interactions | ✅ | ❌ | ⚠️ |
|---|---------|-------------|-----|-----|-----|
| 1 | [Lifecycle Flows](./01-lifecycle.md) | 7 | 4 | 2 | 1 |
| 2 | [Transport Flows](./02-transport.md) | 15 | 3 | 10 | 2 |
| 3 | [Resource Flows](./03-resources.md) | 7 | 6 | 1 | 0 |
| 4 | [Prompt Flows](./04-prompts.md) | 4 | 3 | 1 | 0 |
| 5 | [Tool Flows](./05-tools.md) | 6 | 3 | 2 | 1 |
| 6 | [Completion Flows](./06-completion.md) | 2 | 2 | 0 | 0 |
| 7 | [Logging Flows](./07-logging.md) | 2 | 1 | 1 | 0 |
| 8 | [Sampling Flows (Server -> Client)](./08-sampling.md) | 4 | 0 | 4 | 0 |
| 9 | [Elicitation Flows (Server -> Client)](./09-elicitation.md) | 5 | 0 | 5 | 0 |
| 10 | [Roots Flows (Server -> Client)](./10-roots.md) | 2 | 0 | 2 | 0 |
| 11 | [Ping Flows](./11-ping.md) | 3 | 1 | 2 | 0 |
| 12 | [Cancellation Flows](./12-cancellation.md) | 4 | 0 | 4 | 0 |
| 13 | [Progress Flows](./13-progress.md) | 4 | 1 | 3 | 0 |
| 14 | [Task Flows](./14-tasks.md) | 13 | 0 | 13 | 0 |
| 15 | [Authorization Flows](./15-authorization.md) | 7 | 0 | 7 | 0 |
| 16 | [Error Handling Flows](./16-error-handling.md) | 8 | 2 | 6 | 0 |
| 17 | [Real-World Edge Cases](./17-edge-cases.md) | 13 | 5 | 8 | 0 |

**Total: 106 interactions | 31 ✅ | 71 ❌ | 4 ⚠️**

---

## All Interaction IDs

### 1. Lifecycle Flows
- [`LIFECYCLE-001`](./01-lifecycle.md) — Happy path init (3-message handshake) ✅
- [`LIFECYCLE-002`](./01-lifecycle.md) — Version negotiation — compatible ✅
- [`LIFECYCLE-003`](./01-lifecycle.md) — Version negotiation — incompatible (disconnect) ❌
- [`LIFECYCLE-004`](./01-lifecycle.md) — Capability negotiation ✅
- [`LIFECYCLE-005`](./01-lifecycle.md) — Shutdown — stdio (close stdin → SIGTERM → SIGKILL) ✅
- [`LIFECYCLE-006`](./01-lifecycle.md) — Shutdown — HTTP (DELETE + session ID) ⚠️
- [`LIFECYCLE-007`](./01-lifecycle.md) — Session expiry (HTTP 404 → re-init) ❌

### 2. Transport Flows
- [`TRANSPORT-001`](./02-transport.md) — stdio: basic message exchange (newline-delimited JSON-RPC) ✅
- [`TRANSPORT-002`](./02-transport.md) — stdio: server crash detection + restart ⚠️
- [`TRANSPORT-003`](./02-transport.md) — stdio: invalid JSON on stdin/stdout ❌
- [`TRANSPORT-004`](./02-transport.md) — stdio: stderr logging passthrough ❌
- [`TRANSPORT-005`](./02-transport.md) — Streamable HTTP: POST → JSON response ✅
- [`TRANSPORT-006`](./02-transport.md) — Streamable HTTP: POST → SSE response (streaming) ❌
- [`TRANSPORT-007`](./02-transport.md) — Streamable HTTP: GET → server-initiated SSE stream ❌
- [`TRANSPORT-008`](./02-transport.md) — Streamable HTTP: session management (MCP-Session-Id lifecycle) ✅
- [`TRANSPORT-009`](./02-transport.md) — Streamable HTTP: client-initiated termination (HTTP DELETE) ⚠️
- [`TRANSPORT-010`](./02-transport.md) — Streamable HTTP: server-initiated termination (HTTP 404) ❌
- [`TRANSPORT-011`](./02-transport.md) — Streamable HTTP: reconnection with Last-Event-ID ❌
- [`TRANSPORT-012`](./02-transport.md) — Streamable HTTP: multiple simultaneous SSE streams ❌
- [`TRANSPORT-013`](./02-transport.md) — Streamable HTTP: protocol version header (MCP-Protocol-Version) ❌
- [`TRANSPORT-014`](./02-transport.md) — Streamable HTTP: origin header validation (DNS rebinding) ❌
- [`TRANSPORT-015`](./02-transport.md) — Streamable HTTP: backwards compat with HTTP+SSE (2024-11-05 fallback) ❌

### 3. Resource Flows
- [`RESOURCE-001`](./03-resources.md) — resources/list (basic + pagination) ✅
- [`RESOURCE-002`](./03-resources.md) — resources/read (text content) ✅
- [`RESOURCE-003`](./03-resources.md) — resources/read (blob/binary content) ✅
- [`RESOURCE-004`](./03-resources.md) — resources/templates/list ✅
- [`RESOURCE-005`](./03-resources.md) — resources/subscribe → notifications/resources/updated ✅
- [`RESOURCE-006`](./03-resources.md) — resources/unsubscribe ✅
- [`RESOURCE-007`](./03-resources.md) — notifications/resources/list_changed ❌

### 4. Prompt Flows
- [`PROMPT-001`](./04-prompts.md) — prompts/list (basic + pagination) ✅
- [`PROMPT-002`](./04-prompts.md) — prompts/get (no args) ✅
- [`PROMPT-003`](./04-prompts.md) — prompts/get (with args) ✅
- [`PROMPT-004`](./04-prompts.md) — notifications/prompts/list_changed ❌

### 5. Tool Flows
- [`TOOL-001`](./05-tools.md) — tools/list (basic + pagination) ✅
- [`TOOL-002`](./05-tools.md) — tools/call (success) ✅
- [`TOOL-003`](./05-tools.md) — tools/call (error / isError=true) ✅
- [`TOOL-004`](./05-tools.md) — tools/call (structured output, since 2025-06-18) ❌
- [`TOOL-005`](./05-tools.md) — tools/call with progress notifications ⚠️
- [`TOOL-006`](./05-tools.md) — notifications/tools/list_changed ❌

### 6. Completion Flows
- [`COMPLETION-001`](./06-completion.md) — completion/complete (prompt argument) ✅
- [`COMPLETION-002`](./06-completion.md) — completion/complete (resource template argument) ✅

### 7. Logging Flows
- [`LOGGING-001`](./07-logging.md) — logging/setLevel ✅
- [`LOGGING-002`](./07-logging.md) — notifications/message ❌

### 8. Sampling Flows (server → client)
- [`SAMPLING-001`](./08-sampling.md) — sampling/createMessage (basic) ❌
- [`SAMPLING-002`](./08-sampling.md) — sampling/createMessage (with model preferences) ❌
- [`SAMPLING-003`](./08-sampling.md) — sampling/createMessage (with tools + toolChoice, since 2025-11-25) ❌
- [`SAMPLING-004`](./08-sampling.md) — sampling/createMessage (task-augmented, since 2025-11-25) ❌

### 9. Elicitation Flows (server → client)
- [`ELICITATION-001`](./09-elicitation.md) — elicitation/create (form mode) ❌
- [`ELICITATION-002`](./09-elicitation.md) — elicitation/create (URL mode, since 2025-11-25) ❌
- [`ELICITATION-003`](./09-elicitation.md) — notifications/elicitation/complete (URL mode completion) ❌
- [`ELICITATION-004`](./09-elicitation.md) — User declines/cancels elicitation ❌
- [`ELICITATION-005`](./09-elicitation.md) — elicitation/create (task-augmented, since 2025-11-25) ❌

### 10. Roots Flows (server → client)
- [`ROOTS-001`](./10-roots.md) — roots/list ❌
- [`ROOTS-002`](./10-roots.md) — notifications/roots/list_changed ❌

### 11. Ping Flows
- [`PING-001`](./11-ping.md) — Client → Server ping ✅
- [`PING-002`](./11-ping.md) — Server → Client ping ❌
- [`PING-003`](./11-ping.md) — Ping timeout → connection stale ❌

### 12. Cancellation Flows
- [`CANCEL-001`](./12-cancellation.md) — Client cancels server request ❌
- [`CANCEL-002`](./12-cancellation.md) — Server cancels client request ❌
- [`CANCEL-003`](./12-cancellation.md) — Cancel already-completed request (graceful ignore) ❌
- [`CANCEL-004`](./12-cancellation.md) — Race condition: response arrives after cancel sent ❌

### 13. Progress Flows
- [`PROGRESS-001`](./13-progress.md) — Progress with known total ✅
- [`PROGRESS-002`](./13-progress.md) — Progress with unknown total ❌
- [`PROGRESS-003`](./13-progress.md) — Progress resets timeout timer ❌
- [`PROGRESS-004`](./13-progress.md) — Maximum timeout regardless of progress ❌

### 14. Task Flows (since 2025-11-25, experimental)
- [`TASK-001`](./14-tasks.md) — Task creation (task-augmented tools/call → CreateTaskResult) ❌
- [`TASK-002`](./14-tasks.md) — Task polling (tasks/get) ❌
- [`TASK-003`](./14-tasks.md) — Task result retrieval (tasks/result — blocking) ❌
- [`TASK-004`](./14-tasks.md) — Task listing (tasks/list + pagination) ❌
- [`TASK-005`](./14-tasks.md) — Task cancellation (tasks/cancel) ❌
- [`TASK-006`](./14-tasks.md) — Task with elicitation (working → input_required → working → completed) ❌
- [`TASK-007`](./14-tasks.md) — Task with sampling (server requests createMessage mid-task) ❌
- [`TASK-008`](./14-tasks.md) — Task status notifications (notifications/tasks/status) ❌
- [`TASK-009`](./14-tasks.md) — Task progress (progressToken spans task lifetime) ❌
- [`TASK-010`](./14-tasks.md) — Task TTL expiry (resource cleanup) ❌
- [`TASK-011`](./14-tasks.md) — Task failure (status=failed, result contains error) ❌
- [`TASK-012`](./14-tasks.md) — Tool-level task negotiation (required/optional/forbidden) ❌
- [`TASK-013`](./14-tasks.md) — Related-task metadata linking (_meta.io.modelcontextprotocol/related-task) ❌

### 15. Authorization Flows (HTTP only)
- [`AUTH-001`](./15-authorization.md) — Protected resource metadata discovery (WWW-Authenticate + .well-known) ❌
- [`AUTH-002`](./15-authorization.md) — Authorization server metadata discovery ❌
- [`AUTH-003`](./15-authorization.md) — Client registration (pre-registered / metadata doc / dynamic) ❌
- [`AUTH-004`](./15-authorization.md) — OAuth 2.1 authorization code + PKCE flow ❌
- [`AUTH-005`](./15-authorization.md) — Token refresh ❌
- [`AUTH-006`](./15-authorization.md) — Scope challenge → step-up authorization ❌
- [`AUTH-007`](./15-authorization.md) — Token expiry → re-authorization ❌

### 16. Error Handling Flows
- [`ERROR-001`](./16-error-handling.md) — Invalid JSON-RPC message ❌
- [`ERROR-002`](./16-error-handling.md) — Method not found (-32601) ❌
- [`ERROR-003`](./16-error-handling.md) — Invalid params (-32602) ❌
- [`ERROR-004`](./16-error-handling.md) — Internal error (-32603) ❌
- [`ERROR-005`](./16-error-handling.md) — Resource not found (-32001) ✅
- [`ERROR-006`](./16-error-handling.md) — Tool not found ✅
- [`ERROR-007`](./16-error-handling.md) — Unsupported protocol version ❌
- [`ERROR-008`](./16-error-handling.md) — Capability mismatch (using undeclared feature) ❌

### 17. Real-World Edge Cases
- [`EDGE-001`](./17-edge-cases.md) — Network interruption mid-request (connection drop) ❌
- [`EDGE-002`](./17-edge-cases.md) — Reconnection after network failure (SSE resume) ✅
- [`EDGE-003`](./17-edge-cases.md) — Request landing on different server (load balancing / sticky sessions) ❌
- [`EDGE-004`](./17-edge-cases.md) — Concurrent requests (multiple in-flight operations) ✅
- [`EDGE-005`](./17-edge-cases.md) — Request timeout + cancellation ❌
- [`EDGE-006`](./17-edge-cases.md) — Backpressure / high-frequency requests ✅
- [`EDGE-007`](./17-edge-cases.md) — Large payload handling (streaming) ❌
- [`EDGE-008`](./17-edge-cases.md) — Session migration after server restart ✅
- [`EDGE-009`](./17-edge-cases.md) — Partial message / incomplete JSON ❌
- [`EDGE-010`](./17-edge-cases.md) — Server sends request before init complete (protocol violation) ❌
- [`EDGE-011`](./17-edge-cases.md) — Client sends request before init complete (protocol violation) ❌
- [`EDGE-012`](./17-edge-cases.md) — Duplicate request IDs ❌
- [`EDGE-013`](./17-edge-cases.md) — Message ordering guarantees ✅
