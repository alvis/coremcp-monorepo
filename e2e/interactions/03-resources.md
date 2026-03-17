# 3. Resource Flows

## 3.1 resources/list

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.resources` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:209` ✅ `server-transport-http.spec.e2e.ts:241` ✅ `client-connector-stdio.spec.e2e.ts:215` ✅ `client-connector-http.spec.e2e.ts:185` ✅ `client.spec.e2e.ts:209` |

**Preconditions:** Session initialized. Server declared `capabilities.resources`.

**Message Sequence:**

1. **Client → Server**: `resources/list`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/list",
     "params": {}
   }
   ```

2. **Server → Client**: Resource list response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "resources": [
         {
           "uri": "test://static/resource/1",
           "name": "Resource 1",
           "description": "A test resource",
           "mimeType": "text/plain"
         },
         {
           "uri": "test://static/resource/2",
           "name": "Resource 2",
           "mimeType": "application/octet-stream"
         }
       ],
       "nextCursor": "cursor-page-2"
     }
   }
   ```

**Pagination (optional):**

1. **Client → Server**: `resources/list` with cursor
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "method": "resources/list",
     "params": {
       "cursor": "cursor-page-2"
     }
   }
   ```

2. **Server → Client**: Next page (no `nextCursor` means last page)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 2,
     "result": {
       "resources": [
         {
           "uri": "test://static/resource/3",
           "name": "Resource 3",
           "mimeType": "text/plain"
         }
       ]
     }
   }
   ```

**Error Cases:**
- Server does not declare `capabilities.resources` → Error code `-32601` (Method not found)
- Invalid cursor value → Server may return error or empty result

**Edge Cases:**
- Server has no resources → `resources` array is empty `[]`
- Very large resource list → Pagination required; client must follow `nextCursor`
- Resource list changes between paginated requests → Client may see inconsistent results

---

## 3.2 resources/read — Text

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.resources` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:219` ✅ `server-transport-http.spec.e2e.ts:258` ✅ `client-connector-stdio.spec.e2e.ts:232` ✅ `client-connector-http.spec.e2e.ts:204` ✅ `client.spec.e2e.ts:241` |

**Preconditions:** Session initialized. Server declared `capabilities.resources`. Resource URI is known.

**Message Sequence:**

1. **Client → Server**: `resources/read`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/read",
     "params": {
       "uri": "test://static/resource/1"
     }
   }
   ```

2. **Server → Client**: Text resource contents
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "contents": [
         {
           "uri": "test://static/resource/1",
           "mimeType": "text/plain",
           "text": "Resource 1: This is a plaintext resource"
         }
       ]
     }
   }
   ```

**Error Cases:**
- Unknown resource URI → Server returns JSON-RPC error (implementation-defined code)
- Resource URI that was listed but is no longer available → Server returns error

**Edge Cases:**
- Resource with empty text → `text: ""`
- Resource with very large text content → May require streaming or chunking at transport level
- `mimeType` may be omitted → Client should not assume a default
- `contents` array may contain multiple items (e.g., multi-part resources)

---

## 3.3 resources/read — Binary/Blob

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-003` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.resources` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:231` ✅ `server-transport-http.spec.e2e.ts:269` ✅ `client-connector-stdio.spec.e2e.ts:244` ✅ `client-connector-http.spec.e2e.ts:225` ✅ `client.spec.e2e.ts:256` |

**Preconditions:** Session initialized. Server declared `capabilities.resources`. Resource URI is known. Resource is binary.

**Message Sequence:**

1. **Client → Server**: `resources/read`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/read",
     "params": {
       "uri": "test://static/resource/2"
     }
   }
   ```

2. **Server → Client**: Blob resource contents (base64-encoded)
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "contents": [
         {
           "uri": "test://static/resource/2",
           "mimeType": "application/octet-stream",
           "blob": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
         }
       ]
     }
   }
   ```

**Error Cases:**
- Same as RESOURCE-002

**Edge Cases:**
- Large binary resources → Base64 encoding increases size by ~33%
- Invalid base64 in `blob` field → Client should handle decoding errors
- `mimeType` indicates the actual binary format (e.g., `image/png`, `application/pdf`)
- A resource response contains `blob` (not `text`) → This is `BlobResourceContents`

---

## 3.4 resources/templates/list

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-004` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.resources` |
| **Existing Coverage** | ✅ `server-transport-http/03-resources.spec.e2e.ts:112` ✅ `server-transport-stdio/03-resources.spec.e2e.ts:109` |

**Preconditions:** Session initialized. Server declared `capabilities.resources`.

**Message Sequence:**

1. **Client → Server**: `resources/templates/list`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/templates/list",
     "params": {}
   }
   ```

2. **Server → Client**: Resource templates list
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "resourceTemplates": [
         {
           "uriTemplate": "test://text/{id}",
           "name": "Text Resource",
           "description": "A text resource by ID",
           "mimeType": "text/plain"
         },
         {
           "uriTemplate": "test://binary/{id}",
           "name": "Binary Resource",
           "mimeType": "image/png"
         }
       ]
     }
   }
   ```

**Pagination (optional):**

Same pattern as `resources/list` — `cursor` in params, `nextCursor` in result. Absence of `nextCursor` indicates the last page.

**Error Cases:**
- Server does not declare `capabilities.resources` → Error code `-32601`

**Edge Cases:**
- Server has no templates → `resourceTemplates` is empty `[]`
- URI templates use RFC 6570 syntax (e.g., `{id}`, `{+path}`)
- Templates may include optional description and mimeType

---

## 3.5 resources/subscribe + Update Notification

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-005` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Bidirectional |
| **Capabilities** | `capabilities.resources.subscribe` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:363` ✅ `server-transport-http.spec.e2e.ts:373` ✅ `client-connector-stdio.spec.e2e.ts:422` |

**Preconditions:** Session initialized. Server declared `capabilities.resources.subscribe`.

**Message Sequence:**

1. **Client → Server**: `resources/subscribe`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/subscribe",
     "params": {
       "uri": "test://static/resource/1"
     }
   }
   ```

2. **Server → Client**: Empty success response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {}
   }
   ```

3. _(Later, when resource changes)_ **Server → Client**: `notifications/resources/updated`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/resources/updated",
     "params": {
       "uri": "test://static/resource/1"
     }
   }
   ```

4. **Client**: Re-reads the resource to get updated content (via `resources/read`)

**Error Cases:**
- Server does not declare `capabilities.resources.subscribe` → Error code `-32601`
- Subscribe to nonexistent resource → Server may accept (subscribe speculatively) or reject

**Edge Cases:**
- Multiple subscriptions to same URI → Server should send only one notification per change
- Resource changes rapidly → Server may coalesce notifications
- Client disconnects while subscribed → Subscriptions are lost; must re-subscribe after reconnect

---

## 3.6 resources/unsubscribe

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-006` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.resources.subscribe` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:369` ✅ `server-transport-http.spec.e2e.ts:379` ✅ `client-connector-stdio.spec.e2e.ts:429` |

**Preconditions:** Session initialized. Client has an active subscription to the resource URI.

**Message Sequence:**

1. **Client → Server**: `resources/unsubscribe`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "resources/unsubscribe",
     "params": {
       "uri": "test://static/resource/1"
     }
   }
   ```

2. **Server → Client**: Empty success response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {}
   }
   ```

**Error Cases:**
- Unsubscribe from URI that was never subscribed → Server may succeed silently or return error

**Edge Cases:**
- Double unsubscribe → Should be idempotent
- Unsubscribe while notification is in-flight → Client may still receive one more notification

---

## 3.7 notifications/resources/list_changed

| Field | Value |
|-------|-------|
| **ID** | `RESOURCE-007` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server → Client |
| **Capabilities** | `capabilities.resources.listChanged` |
| **Existing Coverage** | ✅ `server-transport-http/03-resources.spec.e2e.ts:232` ✅ `server-transport-stdio/03-resources.spec.e2e.ts:213` |

**Preconditions:** Session initialized. Server declared `capabilities.resources.listChanged`. Server's resource list has changed (resource added, removed, or modified).

**Message Sequence:**

1. **Server → Client**: `notifications/resources/list_changed`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/resources/list_changed"
   }
   ```

2. **Client**: Should re-fetch the resource list via `resources/list` to discover changes

**Error Cases:**
- Server sends this notification without declaring `capabilities.resources.listChanged` → Client may ignore or log warning

**Edge Cases:**
- Rapid list changes → Server may coalesce multiple changes into one notification
- Client receives notification but does not re-fetch → Client's resource list becomes stale
- Notification arrives during a `resources/list` request → Client should re-fetch after the current request completes

---
