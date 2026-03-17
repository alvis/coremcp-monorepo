# 11. Ping Flows

Ping is a simple health check mechanism. Either side can send a ping to verify the connection is alive. Both client and server MUST respond to ping with an empty result.

## 11.1 Client -> Server Ping

| Field | Value |
|-------|-------|
| **ID** | `PING-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-http/11-ping.spec.e2e.ts:42` ✅ `server-transport-stdio/11-ping.spec.e2e.ts:42` |

**Preconditions:** Client and server have an active connection. Ping can be sent during or after initialization.

**Message Sequence:**

1. **Client -> Server**: `ping`
   ```json
   {
     "jsonrpc": "2.0",
     "id": "ping-1",
     "method": "ping"
   }
   ```

2. **Server -> Client**: Empty result
   ```json
   {
     "jsonrpc": "2.0",
     "id": "ping-1",
     "result": {}
   }
   ```

**Error Cases:**
- Server is unresponsive -> No response received (timeout at transport level)
- Server has crashed -> Transport error (broken pipe, connection reset, HTTP 5xx)

**Edge Cases:**
- Ping during initialization (before `notifications/initialized`) - server MUST still respond
- Rapid successive pings - server must handle each independently
- Ping with string ID vs integer ID - both are valid JSON-RPC request IDs
- Ping after server has started shutdown but before connection closed

---

## 11.2 Server -> Client Ping

| Field | Value |
|-------|-------|
| **ID** | `PING-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | None required |
| **Existing Coverage** | ✅ `server-transport-http/11-ping.spec.e2e.ts:45` ✅ `server-transport-stdio/11-ping.spec.e2e.ts:45` |

**Preconditions:** Client and server have an active connection.

**Message Sequence:**

1. **Server -> Client**: `ping`
   ```json
   {
     "jsonrpc": "2.0",
     "id": "server-ping-1",
     "method": "ping"
   }
   ```

2. **Client -> Server**: Empty result
   ```json
   {
     "jsonrpc": "2.0",
     "id": "server-ping-1",
     "result": {}
   }
   ```

**Error Cases:**
- Client is unresponsive -> No response received (timeout at transport level)
- Client has disconnected -> Transport error

**Edge Cases:**
- Server pings during a long-running tool call to check if client is alive
- HTTP transport: server-initiated ping requires an open SSE/streaming channel or pending request
- Stdio transport: server writes ping to stdout, reads response from stdin

---

## 11.3 Ping Timeout

| Field | Value |
|-------|-------|
| **ID** | `PING-003` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | None required |
| **Existing Coverage** | NONE |

**Preconditions:** One side sends a ping and expects a response within a reasonable timeframe.

**Message Sequence:**

1. **Sender**: `ping`
   ```json
   {
     "jsonrpc": "2.0",
     "id": "health-check",
     "method": "ping"
   }
   ```

2. **Receiver**: No response (or response arrives after timeout declared)

**Sender Behavior on Timeout:**
- Sender MAY consider the connection stale
- Sender MAY terminate the connection
- Sender MAY attempt reconnection (HTTP transport)
- Sender MAY retry the ping before declaring failure
- The protocol does not define a specific timeout value - this is implementation-specific

**Error Cases:**
- Not applicable in the JSON-RPC sense (no error response is received)

**Edge Cases:**
- Response arrives just after sender declares timeout - sender must handle gracefully (ignore late response)
- Network partition: ping sent but never delivered - transport-level error eventually surfaces
- Sender sends multiple pings without waiting for responses - each should have unique IDs
- Receiver processes ping but response is lost in transit
- HTTP transport: ping timeout may trigger session re-establishment
- Stdio transport: ping timeout may trigger process kill and respawn

---
