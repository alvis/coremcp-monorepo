# @coremcp/core

> Shared utilities and session management for MCP implementations — the foundation for robust client-server architectures.

[![CI](https://img.shields.io/github/actions/workflow/status/alvis/coremcp-monorepo/ci.yml?label=CI&logo=github)](#)
[![License](https://img.shields.io/github/license/alvis/coremcp-monorepo?color=success)](#)

---

## ⚡ TL;DR / Quick-Start

```bash
npm i @coremcp/core
```

```typescript
import { Session, MemoryStorage } from '@coremcp/core';

// Complete session management with activity tracking
const session = new Session({
  id: 'session-123',
  user: { id: 'user-1', name: 'Alice' },
  protocolVersion: '2025-06-18',
  // ... other session data
});

// Storage abstraction for persistence
const storage = new MemoryStorage();
await storage.set(session);
```

---

## ✨ Key Features

| Feature                    | @coremcp/core | DIY Session Mgmt |
| -------------------------- | ------------- | ---------------- |
| 🔒 **Type-safe sessions**  | ✅            | ❌               |
| ⏰ **Activity tracking**   | ✅            | ❌               |
| 💾 **Storage abstraction** | ✅            | ❌               |
| 🔄 **JSON serialization**  | ✅            | ❌               |
| 🛡️ **User management**     | ✅            | ❌               |

_Top 3 reasons you'll love it_

- **Session-centric design** — Complete lifecycle management with automatic activity tracking
- **Storage agnostic** — Works with memory, Redis, databases, or custom backends
- **Type-safe throughout** — Full TypeScript support with generic user types

---

## 😩 Problem → 💡 Solution

> **The pain**: Building MCP servers requires complex session state management, user tracking, and storage abstractions.
>
> **The fix**: @coremcp/core provides battle-tested session management with pluggable storage — focus on your business logic, not infrastructure.

---

## 🚀 Usage

### Basic Session Management

```typescript
import { Session } from '@coremcp/core';
import type { User } from './types';

// Create a new session with comprehensive state
const session = new Session<User>({
  id: crypto.randomUUID(),
  user: { id: 'user-123', name: 'Alice', role: 'admin' },
  protocolVersion: '2025-06-18',
  clientInfo: { name: 'MyApp', version: '1.0.0' },
  serverInfo: { name: 'MyMCPServer', version: '2.0.0' },
  capabilities: {
    client: { tools: { listChanged: true } },
    server: { resources: { listChanged: true } },
  },
  tools: [],
  prompts: [],
  resources: [],
  messages: [],
  createdAt: Date.now(),
  lastActivity: Date.now(),
});

// Session automatically tracks activity
session.addTool({
  name: 'calculate',
  description: 'Performs calculations',
  inputSchema: {
    type: 'object',
    properties: { expression: { type: 'string' } },
  },
});

console.log(session.tools); // Tool is now available
console.log(session.lastActivity); // Updated timestamp
```

### Storage Abstraction

```typescript
import { MemoryStorage, Session } from '@coremcp/core';

// Built-in memory storage
const storage = new MemoryStorage<User>();

// Store session
await storage.set(session);

// Retrieve session
const retrieved = await storage.get('session-123');

// Cleanup expired sessions
await storage.cleanup();

// Custom storage implementation
class RedisStorage implements SessionStorage<User> {
  async get(sessionId: string): Promise<Session<User> | null> {
    const data = await redis.get(`session:${sessionId}`);
    return data ? new Session(JSON.parse(data)) : null;
  }

  async set(session: Session<User>): Promise<void> {
    await redis.setex(
      `session:${session.id}`,
      3600,
      JSON.stringify(session.toJSON()),
    );
  }

  async delete(sessionId: string): Promise<void> {
    await redis.del(`session:${sessionId}`);
  }

  async cleanup(): Promise<void> {
    // Redis TTL handles this automatically
  }
}
```

### User Management

```typescript
import { Session } from '@coremcp/core';

// Sessions use simple user IDs
const session = new Session({
  id: 'session-123',
  userId: 'user-456',
  // ... other session config
});

// User ID access
const userId = session.userId; // string | null
if (userId) {
  // User-specific operations
  console.log(`User ${userId} is authenticated`);
}
```

### JSON Utilities

```typescript
import { safeJsonParse, safeJsonStringify } from '@coremcp/core';

// Safe JSON parsing with fallbacks
const data = safeJsonParse('{"invalid": json}', { error: 'fallback' });

// Safe JSON stringification
const jsonString = safeJsonStringify(complexObject);

// Export/import sessions
const sessionData = session.toJSON();
const recreated = new Session(sessionData);
```

### Logging Integration

```typescript
import { createLogger, LogLevel } from '@coremcp/core';

// Structured logging
const logger = createLogger({
  level: LogLevel.INFO,
  context: { sessionId: session.id, userId: session.user?.id },
});

logger.info('Tool executed successfully', {
  toolName: 'calculate',
  duration: 125,
});

logger.error('Tool execution failed', error);
```

---

## 🧩 API Reference

### Session Class

| Method                  | Description                       |
| ----------------------- | --------------------------------- |
| `new Session(data)`     | Create session from configuration |
| `addTool(tool)`         | Add tool to session               |
| `addPrompt(prompt)`     | Add prompt to session             |
| `addResource(resource)` | Add resource to session           |
| `addMessage(message)`   | Add message to history            |
| `updateActivity()`      | Update last activity timestamp    |
| `toJSON()`              | Export session as JSON            |

### Storage Interface

| Method              | Description               |
| ------------------- | ------------------------- |
| `get(sessionId)`    | Retrieve session by ID    |
| `set(session)`      | Store session             |
| `delete(sessionId)` | Remove session            |
| `cleanup()`         | Clean up expired sessions |

### Utility Functions

| Function              | Description                          |
| --------------------- | ------------------------------------ |
| `safeJsonParse()`     | Parse JSON with error handling       |
| `safeJsonStringify()` | Stringify with circular ref handling |
| `createLogger()`      | Create structured logger             |

---

## 🔧 Session Lifecycle

```typescript
// 1. Session Creation
const session = new Session({
  id: crypto.randomUUID(),
  userId: authenticatedUserId,
  protocolVersion: '2025-06-18',
  // ... other required fields
});

// 2. Activity Tracking (automatic)
session.addTool(newTool); // Updates lastActivity
session.addMessage(request); // Updates lastActivity
session.updateActivity(); // Manual update

// 3. Persistence
await storage.set(session);

// 4. Retrieval
const retrieved = await storage.get(session.id);

// 5. Cleanup (TTL-based or manual)
await storage.cleanup();
```

---

## 🌐 Compatibility

| Target         | Support        |
| -------------- | -------------- |
| Node.js        | ≥ 18           |
| TypeScript     | ≥ 5.0          |
| Module formats | ESM            |
| Storage        | Memory, Custom |

---

## 🆚 Alternatives

| Approach          | Session Mgmt | Storage | Type Safety |
| ----------------- | ------------ | ------- | ----------- |
| **@coremcp/core** | ✅           | ✅      | ✅          |
| Express sessions  | 🔶           | ✅      | ❌          |
| Custom solution   | ❌           | 🔶      | 🔶          |

> **When to choose @coremcp/core?**
>
> - You're building MCP servers or clients
> - You need comprehensive session management
> - You want pluggable storage backends

---

## 🤝 Contributing

1. **Fork → feature branch → PR**
2. Follow [Conventional Commits](https://www.conventionalcommits.org/)
3. `pnpm lint && pnpm test` must pass

> See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.

---

## 🛡️ Security

Found a vulnerability? Email **security@coremcp.dev** — we respond within **48h**.

---

## 📜 License

**MIT** © 2025 — free for personal & commercial use. See [LICENSE](../../LICENSE).
