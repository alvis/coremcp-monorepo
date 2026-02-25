import { describe, expect, it, vi } from 'vitest';

import { MemorySessionStore } from '#session/store/adapters/memory';

import type { SessionClientMessageEvent, SessionData } from '#session/types';

vi.useFakeTimers();

// HELPERS //

const createClientMessageEvent = (
  overrides?: Partial<SessionClientMessageEvent>,
): SessionClientMessageEvent =>
  ({
    id: 'event-1',
    type: 'client-message',
    channelId: 'test-channel',
    occurredAt: Date.now(),
    message: {
      jsonrpc: '2.0',
      id: 'req-test',
      method: 'test',
      params: {},
    },
    ...overrides,
  }) satisfies SessionClientMessageEvent;

const createSessionData = (overrides?: Partial<SessionData>): SessionData =>
  ({
    id: 'test-session',
    userId: 'user-1',
    protocolVersion: '1.0',
    clientInfo: { name: 'Test Client', version: '1.0' },
    serverInfo: { name: 'Test Server', version: '1.0' },
    capabilities: { client: {}, server: {} },
    tools: [],
    prompts: [],
    resources: [],
    resourceTemplates: [],
    subscriptions: [],
    events: [createClientMessageEvent()],
    ...overrides,
  }) satisfies SessionData;

// TEST SUITES //

describe('cl: MemorySessionStore', () => {
  describe('mt: constructor', () => {
    it('should create storage without options', () => {
      const storage = new MemorySessionStore();

      expect(storage).toBeInstanceOf(MemorySessionStore);
    });

    it('should create storage with all options', () => {
      const storage = new MemorySessionStore({
        maxSessions: 10,
        sessionTimeout: 3600000,
      });

      expect(storage).toBeInstanceOf(MemorySessionStore);
    });
  });

  describe('mt: set', () => {
    it('should store session data in memory', async () => {
      const store = new MemorySessionStore();
      const data = createSessionData();

      await store.set(data);
    });

    it('should update existing session and move to end of order', async () => {
      const storage = new MemorySessionStore({
        maxSessions: 2,
      });
      const now = Date.now();
      const session1 = createSessionData({
        id: 'session-1',
        userId: null,
        events: [
          createClientMessageEvent({
            id: 'session-1-event',
            channelId: 'channel-1',
            occurredAt: now,
            message: {
              jsonrpc: '2.0',
              id: 'req-1',
              method: 'init',
              params: {},
            },
          }),
        ],
      });
      const session2 = createSessionData({
        id: 'session-2',
        userId: null,
        events: [
          createClientMessageEvent({
            id: 'session-2-event',
            channelId: 'channel-2',
            occurredAt: now + 1000,
            message: {
              jsonrpc: '2.0',
              id: 'req-2',
              method: 'init',
              params: {},
            },
          }),
        ],
      });

      await storage.set(session1);
      await storage.set(session2);

      // update first session with new event (this calls #moveToEnd)
      const updatedSession1: SessionData = {
        ...session1,
        events: [
          ...session1.events,
          createClientMessageEvent({
            id: 'session-1-event-2',
            channelId: 'channel-1',
            occurredAt: now + 2000,
            message: {
              jsonrpc: '2.0',
              id: 'req-3',
              method: 'update',
              params: {},
            },
          }),
        ],
      };
      await storage.set(updatedSession1);

      // add third session - this should evict session2 since session1 was moved to end
      const session3 = createSessionData({
        id: 'session-3',
        userId: null,
        events: [
          createClientMessageEvent({
            id: 'session-3-event',
            channelId: 'channel-3',
            occurredAt: now + 3000,
            message: {
              jsonrpc: '2.0',
              id: 'req-4',
              method: 'init',
              params: {},
            },
          }),
        ],
      });
      await storage.set(session3);

      const retrieved1 = await storage.get('session-1');
      const retrieved2 = await storage.get('session-2');
      const retrieved3 = await storage.get('session-3');

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).toBeNull();
      expect(retrieved3).not.toBeNull();
    });

    it('should not evict sessions when no max limit is set', async () => {
      const storage = new MemorySessionStore();
      const sessions = Array.from({ length: 5 }, (_, i) =>
        createSessionData({
          id: `session-${i + 1}`,
          userId: null,
          events: [
            createClientMessageEvent({
              id: `session-${i + 1}-event`,
              channelId: `channel-${i + 1}`,
              occurredAt: Date.now(),
              message: {
                jsonrpc: '2.0',
                id: `req-${i + 1}`,
                method: 'init',
                params: {},
              },
            }),
          ],
        }),
      );

      for (const session of sessions) {
        await storage.set(session);
      }

      // all sessions should still be retrievable
      for (let i = 1; i <= 5; i++) {
        const retrieved = await storage.get(`session-${i}`);

        expect(retrieved).not.toBeNull();
      }
    });

    it('should not evict sessions when under max limit', async () => {
      const storage = new MemorySessionStore({
        maxSessions: 3,
      });
      const data = createSessionData({
        id: 'session-1',
        userId: null,
        events: [
          createClientMessageEvent({
            id: 'session-1-event',
            channelId: 'channel-1',
            occurredAt: Date.now(),
            message: {
              jsonrpc: '2.0',
              id: 'req-1',
              method: 'init',
              params: {},
            },
          }),
        ],
      });

      await storage.set(data);

      const retrieved = await storage.get('session-1');

      expect(retrieved).not.toBeNull();
    });

    it('should enforce max sessions limit', async () => {
      const storage = new MemorySessionStore({
        maxSessions: 2,
      });
      const now = Date.now();
      const sessions: SessionData[] = [
        createSessionData({
          id: 'session-1',
          userId: null,
          events: [
            createClientMessageEvent({
              id: 'session-1-event',
              channelId: 'channel-1',
              occurredAt: now - 2000,
              message: {
                jsonrpc: '2.0',
                id: 'req-1',
                method: 'init',
                params: {},
              },
            }),
          ],
        }),
        createSessionData({
          id: 'session-2',
          userId: null,
          events: [
            createClientMessageEvent({
              id: 'session-2-event',
              channelId: 'channel-2',
              occurredAt: now - 1000,
              message: {
                jsonrpc: '2.0',
                id: 'req-2',
                method: 'init',
                params: {},
              },
            }),
          ],
        }),
        createSessionData({
          id: 'session-3',
          userId: null,
          events: [
            createClientMessageEvent({
              id: 'session-3-event',
              channelId: 'channel-3',
              occurredAt: now,
              message: {
                jsonrpc: '2.0',
                id: 'req-3',
                method: 'init',
                params: {},
              },
            }),
          ],
        }),
      ];

      for (const session of sessions) {
        await storage.set(session);
      }

      const session1 = await storage.get('session-1');
      const session2 = await storage.get('session-2');
      const session3 = await storage.get('session-3');

      expect(session1).toBeNull();
      expect(session2).not.toBeNull();
      expect(session3).not.toBeNull();
    });
  });

  describe('mt: get', () => {
    it('should return null for undefined session id', async () => {
      const store = new MemorySessionStore();

      const result = await store.get();

      expect(result).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      const store = new MemorySessionStore();

      const result = await store.get('non-existent');

      expect(result).toBeNull();
    });

    it('should retrieve stored session', async () => {
      const store = new MemorySessionStore();
      const sessionData = createSessionData({
        events: [
          createClientMessageEvent({
            id: 'retrieve-test-event',
            channelId: 'retrieve-channel',
            occurredAt: Date.now(),
            message: {
              jsonrpc: '2.0',
              id: 'req-retrieve',
              method: 'init',
              params: {},
            },
          }),
        ],
      });

      await store.set(sessionData);

      const retrieved = await store.get('test-session');

      expect(retrieved).toEqual(
        expect.objectContaining({
          id: 'test-session',
          userId: 'user-1',
        }),
      );
    });

    it('should delete expired sessions based on timeout', async () => {
      const storage = new MemorySessionStore({
        sessionTimeout: 1000,
      });
      const now = Date.now();
      const sessionData = createSessionData({
        id: 'test-session',
        userId: null,
        events: [
          createClientMessageEvent({
            id: 'expired-session-event',
            channelId: 'expired-channel',
            occurredAt: now - 2000,
            message: {
              jsonrpc: '2.0',
              id: 'req-expired',
              method: 'init',
              params: {},
            },
          }),
        ],
      });

      await storage.set(sessionData);

      const retrieved = await storage.get('test-session');

      expect(retrieved).toBeNull();
    });

    it('should return active sessions within timeout', async () => {
      const storage = new MemorySessionStore({
        sessionTimeout: 5000,
      });
      const sessionData = createSessionData({
        id: 'test-session',
        userId: null,
        events: [
          createClientMessageEvent({
            id: 'active-session-event',
            channelId: 'active-channel',
            occurredAt: Date.now(),
            message: {
              jsonrpc: '2.0',
              id: 'req-active',
              method: 'init',
              params: {},
            },
          }),
        ],
      });

      await storage.set(sessionData);

      const retrieved = await storage.get('test-session');

      expect(retrieved).toEqual(
        expect.objectContaining({
          id: 'test-session',
        }),
      );
    });
  });

  describe('mt: drop', () => {
    it('should delete existing session', async () => {
      const testStore = new MemorySessionStore();
      const sessionData = createSessionData({
        events: [
          createClientMessageEvent({
            id: 'drop-test-event',
            channelId: 'drop-channel',
            occurredAt: Date.now(),
            message: {
              jsonrpc: '2.0',
              id: 'req-drop',
              method: 'init',
              params: {},
            },
          }),
        ],
      });

      await testStore.set(sessionData);
      await testStore.drop('test-session');

      const retrieved = await testStore.get('test-session');

      expect(retrieved).toBeNull();
    });

    it('should handle dropping non-existent session', async () => {
      const store = new MemorySessionStore();

      await store.drop('non-existent');
    });
  });
});
