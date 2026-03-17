# 10. Roots Flows (Server -> Client)

Roots represent filesystem directories or file URIs that the client exposes to the server. The server uses roots to understand which parts of the filesystem are relevant.

## 10.1 List Roots

| Field | Value |
|-------|-------|
| **ID** | `ROOTS-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server -> Client |
| **Capabilities** | Client must declare `capabilities.roots` |
| **Existing Coverage** | NONE |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.roots`.

**Message Sequence:**

1. **Server -> Client**: `roots/list`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "roots/list"
   }
   ```

2. **Client -> Server**: RootsListResult
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "roots": [
         {
           "uri": "file:///home/user/project",
           "name": "Main Project"
         },
         {
           "uri": "file:///home/user/libs",
           "name": "Libraries"
         }
       ]
     }
   }
   ```

**Params:** None

**Result Schema:**
- `roots` (array, required): Array of root objects
  - `uri` (string, required): URI of the root (typically `file://` scheme)
  - `name` (string, optional): Human-readable name for the root

**Error Cases:**
- Client does not support roots -> method not found error:
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "error": {
      "code": -32601,
      "message": "Method not found: roots/list"
    }
  }
  ```

**Edge Cases:**
- Empty roots array - client has no roots to expose
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
      "roots": []
    }
  }
  ```
- Roots with non-file URIs (e.g., `https://` or custom schemes)
- Root URIs pointing to non-existent paths - server must handle gracefully
- Very large number of roots - no pagination defined for roots/list
- Root names containing special characters or Unicode
- Root URIs with spaces or special characters must be properly encoded

---

## 10.2 Roots List Changed Notification

| Field | Value |
|-------|-------|
| **ID** | `ROOTS-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client -> Server |
| **Capabilities** | Client must declare `capabilities.roots.listChanged` |
| **Existing Coverage** | NONE |

**Preconditions:** Client and server have completed the initialization handshake. Client advertises `capabilities.roots` with `listChanged: true`.

**Message Sequence:**

1. **Client -> Server**: `notifications/roots/list_changed` (notification, no id)
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/roots/list_changed"
   }
   ```

2. **Server -> Client** (typical follow-up): `roots/list` to get updated roots
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "roots/list"
   }
   ```

3. **Client -> Server**: Updated roots list
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "roots": [
         {
           "uri": "file:///home/user/project",
           "name": "Main Project"
         },
         {
           "uri": "file:///home/user/new-module",
           "name": "New Module"
         }
       ]
     }
   }
   ```

**Params:** None

**Error Cases:**
- Not applicable (notifications have no response)

**Edge Cases:**
- Server receives notification but chooses not to re-request roots (allowed)
- Rapid succession of list_changed notifications - server should debounce or coalesce
- Client sends notification before server has requested roots the first time
- Server does not support roots capability - it should ignore the notification
- Client sends notification but roots have not actually changed - server handles gracefully

---
