# 7. Logging Flows

## 7.1 Set Logging Level

| Field | Value |
|-------|-------|
| **ID** | `LOGGING-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | Server must declare `capabilities.logging` |
| **Existing Coverage** | `client.spec.e2e.ts:436` `client-connector-http.spec.e2e.ts:332` `client-connector-stdio.spec.e2e.ts:412` `server-transport-stdio.spec.e2e.ts:414` `server-transport-http.spec.e2e.ts:429` |

**Preconditions:** Client and server have completed the initialization handshake. Server advertises `capabilities.logging`.

**Message Sequence:**

1. **Client -> Server**: `logging/setLevel`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "logging/setLevel",
     "params": {
       "level": "info"
     }
   }
   ```

2. **Server -> Client**: Empty result
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {}
   }
   ```

**Valid LoggingLevel Values:** `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug`

**Error Cases:**
- Invalid logging level value -> Server SHOULD return JSON-RPC invalid params error
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32602,
      "message": "Invalid params: unknown logging level 'verbose'"
    }
  }
  ```
- Server does not support logging capability -> Server returns method not found error
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32601,
      "message": "Method not found: logging/setLevel"
    }
  }
  ```

**Edge Cases:**
- Setting the same level multiple times should be idempotent
- Setting level to `debug` then `error` should filter out debug/info/warning/notice messages
- Server MAY ignore the level and continue to send all messages

---

## 7.2 Server Log Message Notification

| Field | Value |
|-------|-------|
| **ID** | `LOGGING-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Server must declare `capabilities.logging` |
| **Existing Coverage** | ✅ `server-transport-http/07-logging.spec.e2e.ts:60` ✅ `server-transport-stdio/07-logging.spec.e2e.ts:49` |

**Preconditions:** Client and server have completed the initialization handshake. Server advertises `capabilities.logging`. Note: Server MAY also send log messages during initialization (before the client sends the `notifications/initialized` notification).

**Message Sequence:**

1. **Server -> Client**: `notifications/message` (notification, no id)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/message",
     "params": {
       "level": "info",
       "data": "Processing request for resource test://example",
       "logger": "resource-handler"
     }
   }
   ```

**Params Schema:**
- `level` (LoggingLevel, required): Severity level of the log message
- `data` (any, required): Log data - can be a string, object, array, or any JSON value
- `logger` (string, optional): Name of the logger that produced this message

**Examples with different data types:**

String data:
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "level": "debug",
    "data": "Cache hit for key abc123"
  }
}
```

Structured data:
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "level": "error",
    "data": {
      "error": "ConnectionRefused",
      "host": "db.example.com",
      "port": 5432,
      "retryCount": 3
    },
    "logger": "database"
  }
}
```

**Error Cases:**
- Not applicable (notifications have no response and cannot produce errors)

**Edge Cases:**
- Server may send log messages before `notifications/initialized` (during init phase)
- Client should handle `data` of any JSON type (string, number, boolean, object, array, null)
- Server SHOULD respect the logging level set by `logging/setLevel` but is not required to
- Messages at or above the set level should be sent; messages below should be filtered
- If no level has been set, server chooses its own default behavior
- Rapid burst of log messages should not cause client to drop messages or crash
- Logger field is optional; client must handle missing logger gracefully

---
