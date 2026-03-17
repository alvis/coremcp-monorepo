# 4. Prompt Flows

## 4.1 prompts/list

| Field | Value |
|-------|-------|
| **ID** | `PROMPT-001` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.prompts` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:279` ✅ `server-transport-http.spec.e2e.ts:306` ✅ `client-connector-stdio.spec.e2e.ts:277` ✅ `client-connector-http.spec.e2e.ts:255` ✅ `client.spec.e2e.ts:306` |

**Preconditions:** Session initialized. Server declared `capabilities.prompts`.

**Message Sequence:**

1. **Client → Server**: `prompts/list`
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "prompts/list",
     "params": {}
   }
   ```

2. **Server → Client**: Prompt list response
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "prompts": [
         {
           "name": "simple-prompt",
           "description": "A simple prompt without arguments"
         },
         {
           "name": "greeting-prompt",
           "description": "A prompt with arguments",
           "arguments": [
             {
               "name": "name",
               "description": "The name to greet",
               "required": true
             }
           ]
         },
         {
           "name": "styled-prompt",
           "description": "A prompt with style and format options",
           "arguments": [
             {
               "name": "style",
               "description": "The output style",
               "required": false
             },
             {
               "name": "format",
               "description": "The output format",
               "required": false
             }
           ]
         }
       ]
     }
   }
   ```

**Pagination (optional):**

Same pattern as `resources/list` — `cursor` in params, `nextCursor` in result.

**Error Cases:**
- Server does not declare `capabilities.prompts` → Error code `-32601`

**Edge Cases:**
- Server has no prompts → `prompts` array is empty `[]`
- Prompt with no arguments → `arguments` field is omitted or empty `[]`
- Prompt arguments with `required: true` must be provided in `prompts/get`

---

## 4.2 prompts/get — No Arguments

| Field | Value |
|-------|-------|
| **ID** | `PROMPT-002` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.prompts` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:289` ✅ `server-transport-http.spec.e2e.ts:328` ✅ `client-connector-stdio.spec.e2e.ts:292` ✅ `client-connector-http.spec.e2e.ts:278` ✅ `client.spec.e2e.ts:347` |

**Preconditions:** Session initialized. Server declared `capabilities.prompts`. Prompt name is known.

**Message Sequence:**

1. **Client → Server**: `prompts/get` without arguments
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "prompts/get",
     "params": {
       "name": "simple-prompt"
     }
   }
   ```

2. **Server → Client**: Prompt messages
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "description": "A simple prompt",
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "This is a simple prompt message."
           }
         }
       ]
     }
   }
   ```

**Error Cases:**
- Unknown prompt name → Server returns JSON-RPC error
- Prompt requires arguments but none provided → Server may return error or use defaults

**Edge Cases:**
- `description` in response may differ from `description` in `prompts/list`
- `messages` array may contain multiple messages with different roles
- Message content may be `TextContent`, `ImageContent`, or `EmbeddedResource`

---

## 4.3 prompts/get — With Arguments

| Field | Value |
|-------|-------|
| **ID** | `PROMPT-003` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Client → Server |
| **Capabilities** | `capabilities.prompts` |
| **Existing Coverage** | ✅ `server-transport-stdio.spec.e2e.ts:303` ✅ `server-transport-http.spec.e2e.ts:343` ✅ `client-connector-stdio.spec.e2e.ts:303` ✅ `client-connector-http.spec.e2e.ts:285` ✅ `client.spec.e2e.ts:359` |

**Preconditions:** Session initialized. Server declared `capabilities.prompts`. Prompt accepts arguments.

**Message Sequence:**

1. **Client → Server**: `prompts/get` with arguments
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "prompts/get",
     "params": {
       "name": "greeting-prompt",
       "arguments": {
         "name": "Alice"
       }
     }
   }
   ```

2. **Server → Client**: Prompt messages with substituted arguments
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "description": "A greeting prompt",
       "messages": [
         {
           "role": "user",
           "content": {
             "type": "text",
             "text": "Hello, Alice! Welcome."
           }
         }
       ]
     }
   }
   ```

**Error Cases:**
- Missing required argument → Server returns JSON-RPC error
- Unknown argument name → Server may ignore or return error
- Invalid argument value → Server-defined behavior

**Edge Cases:**
- Only required arguments provided, optional ones omitted → Server uses defaults for optional args
- All arguments are optional and none provided → Same as prompts/get without arguments
- Argument values are always strings (even for numeric concepts like "temperature")

---

## 4.4 notifications/prompts/list_changed

| Field | Value |
|-------|-------|
| **ID** | `PROMPT-004` |
| **Since** | 2024-11-05 |
| **Transport** | both |
| **Direction** | Server → Client |
| **Capabilities** | `capabilities.prompts.listChanged` |
| **Existing Coverage** | ✅ `server-transport-http/04-prompts.spec.e2e.ts:138` ✅ `server-transport-stdio/04-prompts.spec.e2e.ts:139` |

**Preconditions:** Session initialized. Server declared `capabilities.prompts.listChanged`. Server's prompt list has changed.

**Message Sequence:**

1. **Server → Client**: `notifications/prompts/list_changed`
   ```json
   {
     "jsonrpc": "2.0",
     "method": "notifications/prompts/list_changed"
   }
   ```

2. **Client**: Should re-fetch the prompt list via `prompts/list`

**Error Cases:**
- Server sends this without declaring `capabilities.prompts.listChanged` → Client may ignore

**Edge Cases:**
- Same coalescing and timing considerations as RESOURCE-007

---
