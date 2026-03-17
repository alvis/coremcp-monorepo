# 6. Completion Flows

## 6.1 completion/complete — Prompt Argument

| Field | Value |
|-------|-------|
| **ID** | `COMPLETION-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.completions` |
| **Existing Coverage** | ✅ `server-transport-http/06-completion.spec.e2e.ts:30` ✅ `server-transport-stdio/06-completion.spec.e2e.ts:30` |

**Preconditions:** Session initialized. Server declared `capabilities.completions`. Prompt name and argument name are known.

**Message Sequence:**

1. **Client → Server**: `completion/complete` for a prompt argument
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "completion/complete",
     "params": {
       "ref": {
         "type": "ref/prompt",
         "name": "greeting-prompt"
       },
       "argument": {
         "name": "name",
         "value": "A"
       }
     }
   }
   ```

2. **Server → Client**: Completion suggestions
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "completion": {
         "values": ["Alice", "Alex"],
         "hasMore": false,
         "total": 2
       }
     }
   }
   ```

**Optional context parameter (since 2025-06-18):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "completion/complete",
  "params": {
    "ref": {
      "type": "ref/prompt",
      "name": "greeting-prompt"
    },
    "argument": {
      "name": "name",
      "value": "A"
    },
    "context": {
      "arguments": {
        "style": "formal"
      }
    }
  }
}
```

**Error Cases:**
- Server does not declare `capabilities.completions` → Error code `-32601`
- Unknown prompt name in `ref` → Server may return empty completions or error
- Unknown argument name → Server may return empty completions or error

**Edge Cases:**
- Empty `value` string → Server returns all possible completions (or a subset)
- `hasMore: true` → More completions available; client may refine the query
- `total` is optional; if provided, indicates total number of matching completions
- `values` array may be empty if no completions match

---

## 6.2 completion/complete — Resource Template

| Field | Value |
|-------|-------|
| **ID** | `COMPLETION-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.completions` |
| **Existing Coverage** | ✅ `server-transport-http/06-completion.spec.e2e.ts:50` ✅ `server-transport-stdio/06-completion.spec.e2e.ts:49` |

**Preconditions:** Session initialized. Server declared `capabilities.completions`. Resource template URI is known.

**Message Sequence:**

1. **Client → Server**: `completion/complete` for a resource template argument
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "completion/complete",
     "params": {
       "ref": {
         "type": "ref/resource",
         "uri": "test://text/{id}"
       },
       "argument": {
         "name": "id",
         "value": "1"
       }
     }
   }
   ```

2. **Server → Client**: Completion suggestions
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "completion": {
         "values": ["1"],
         "hasMore": false,
         "total": 1
       }
     }
   }
   ```

**Error Cases:**
- Unknown resource template URI → Server may return empty completions or error
- Invalid argument name for template → Server may return empty completions or error

**Edge Cases:**
- Template with multiple parameters → Complete one at a time
- `ref.uri` should match a known resource template's `uriTemplate`
- `values` are always strings (even for numeric IDs)
- Same `context` parameter support as COMPLETION-001 (since 2025-06-18)

