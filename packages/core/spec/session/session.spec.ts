import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionStore } from '#session';

import type { SessionData, SessionEvent, SessionSystemEvent } from '#session';

// set fake timers at file level
vi.useFakeTimers();
vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

// CONSTANTS //

const baseSessionData: SessionData = {
  id: 'test-session-123',
  userId: 'user-123',
  protocolVersion: '2025-06-18',
  clientInfo: { name: 'TestClient', version: '1.0.0' },
  serverInfo: { name: 'TestServer', version: '1.0.0' },
  capabilities: {
    client: { roots: { listChanged: true } },
    server: { tools: {}, prompts: {}, resources: {} },
  },
  tools: [],
  prompts: [],
  resources: [],
  resourceTemplates: [],
  subscriptions: [],
  events: [],
};

// HELPERS //

const createSessionData = (overrides?: Partial<SessionData>): SessionData => ({
  ...baseSessionData,
  ...overrides,
});

const createSystemEvent = (
  overrides?: Partial<Omit<SessionSystemEvent, 'type'>>,
): SessionSystemEvent => ({
  id: 'event-1',
  type: 'channel-started',
  channelId: 'channel-1',
  occurredAt: Date.now(),
  ...overrides,
});

// concrete implementation for testing
class TestSessionStore extends SessionStore {
  public capabilities = { push: false };

  public sessions = new Map<string, SessionData>();

  public get sessionCount(): number {
    return this.sessions.size;
  }

  public async set(session: SessionData): Promise<void> {
    this.sessions.set(session.id, session);
  }

  public async get(sessionId?: string): Promise<SessionData | null> {
    if (!sessionId) {
      return null;
    }

    return this.sessions.get(sessionId) ?? null;
  }

  public async drop(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  public async pullEvents(
    sessionId: string,
    lastEventId: string,
  ): Promise<SessionEvent[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const events = session.events;
    const lastIndex = events.findIndex((e) => e.id === lastEventId);

    return lastIndex === -1 ? events : events.slice(lastIndex + 1);
  }

  public async pushEvents(
    sessionId: string,
    events: SessionEvent[],
  ): Promise<SessionEvent[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const existingIds = new Set(session.events.map(({ id }) => id));
    const newEvents = events.filter(({ id }) => !existingIds.has(id));
    session.events = [...session.events, ...newEvents];

    return newEvents;
  }

  public subscribe(
    _sessionId: string,
    _listener: (event: SessionEvent) => void,
  ): () => void {
    // for testing, return a no-op unsubscribe function
    return () => {};
  }
}

// TEST SUITES //

describe('cl: SessionStore', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  describe('abstract methods implementation', () => {
    describe('mt: set', () => {
      it('should store session', async () => {
        const storage = new TestSessionStore();
        const sessionData = createSessionData();

        await storage.set(sessionData);

        const retrieved = await storage.get('test-session-123');
        expect(retrieved).toEqual(sessionData);
      });

      it('should overwrite existing session with same id', async () => {
        const storage = new TestSessionStore();
        const sessionData = createSessionData();
        await storage.set(sessionData);
        const updatedSessionData = createSessionData({
          protocolVersion: '2025-07-01',
        });

        await storage.set(updatedSessionData);

        const retrieved = await storage.get('test-session-123');
        expect(retrieved?.protocolVersion).toBe('2025-07-01');
      });
    });

    describe('mt: get', () => {
      it('should return session when found', async () => {
        const storage = new TestSessionStore();
        const sessionData = createSessionData();
        await storage.set(sessionData);

        const result = await storage.get('test-session-123');

        expect(result).toEqual(sessionData);
      });

      it('should return null when session not found', async () => {
        const storage = new TestSessionStore();

        const result = await storage.get('non-existent-session');

        expect(result).toBeNull();
      });

      it('should return null when sessionId is undefined', async () => {
        const storage = new TestSessionStore();

        const result = await storage.get(undefined);

        expect(result).toBeNull();
      });

      it('should return null when sessionId is empty string', async () => {
        const storage = new TestSessionStore();

        const result = await storage.get('');

        expect(result).toBeNull();
      });
    });

    describe('mt: drop', () => {
      it('should remove existing session', async () => {
        const storage = new TestSessionStore();
        const sessionData = createSessionData();
        await storage.set(sessionData);

        await storage.drop('test-session-123');

        expect(await storage.get('test-session-123')).toBeNull();
      });

      it('should handle when session not found', async () => {
        const storage = new TestSessionStore();

        await storage.drop('non-existent-session');

        expect(storage.sessionCount).toBe(0);
      });

      it('should handle empty session id', async () => {
        const storage = new TestSessionStore();

        await storage.drop('');

        expect(storage.sessionCount).toBe(0);
      });
    });

    describe('mt: pullEvents', () => {
      it('should return all events when lastEventId not found', async () => {
        const storage = new TestSessionStore();
        const events = [
          createSystemEvent({ id: 'event-1' }),
          createSystemEvent({ id: 'event-2' }),
        ];
        const sessionData = createSessionData({ events });
        await storage.set(sessionData);

        const result = await storage.pullEvents(
          'test-session-123',
          'non-existent',
        );

        expect(result).toEqual(events);
      });

      it('should return events after lastEventId', async () => {
        const storage = new TestSessionStore();
        const events = [
          createSystemEvent({ id: 'event-1' }),
          createSystemEvent({ id: 'event-2' }),
          createSystemEvent({ id: 'event-3' }),
        ];
        const sessionData = createSessionData({ events });
        await storage.set(sessionData);

        const result = await storage.pullEvents('test-session-123', 'event-1');

        expect(result).toEqual([events[1], events[2]]);
      });

      it('should return empty array when session not found', async () => {
        const storage = new TestSessionStore();

        const result = await storage.pullEvents('non-existent', 'event-1');

        expect(result).toEqual([]);
      });

      it('should return empty array when lastEventId is the last event', async () => {
        const storage = new TestSessionStore();
        const events = [createSystemEvent({ id: 'event-1' })];
        const sessionData = createSessionData({ events });
        await storage.set(sessionData);

        const result = await storage.pullEvents('test-session-123', 'event-1');

        expect(result).toEqual([]);
      });
    });

    describe('mt: pushEvents', () => {
      it('should add new events to session', async () => {
        const storage = new TestSessionStore();
        const sessionData = createSessionData();
        await storage.set(sessionData);
        const newEvents = [
          createSystemEvent({ id: 'new-event-1' }),
          createSystemEvent({ id: 'new-event-2' }),
        ];

        const result = await storage.pushEvents('test-session-123', newEvents);

        expect(result).toEqual(newEvents);
        const session = await storage.get('test-session-123');
        expect(session?.events).toEqual(newEvents);
      });

      it('should filter duplicate events', async () => {
        const storage = new TestSessionStore();
        const existingEvent = createSystemEvent({ id: 'existing-event' });
        const sessionData = createSessionData({ events: [existingEvent] });
        await storage.set(sessionData);
        const newEvents = [
          createSystemEvent({ id: 'existing-event' }),
          createSystemEvent({ id: 'new-event' }),
        ];

        const result = await storage.pushEvents('test-session-123', newEvents);

        expect(result).toEqual([newEvents[1]]);
      });

      it('should return empty array when session not found', async () => {
        const storage = new TestSessionStore();
        const events = [createSystemEvent({ id: 'event-1' })];

        const result = await storage.pushEvents('non-existent', events);

        expect(result).toEqual([]);
      });

      it('should return empty array when pushing empty events', async () => {
        const storage = new TestSessionStore();
        const sessionData = createSessionData();
        await storage.set(sessionData);

        const result = await storage.pushEvents('test-session-123', []);

        expect(result).toEqual([]);
      });
    });

    describe('mt: subscribe', () => {
      it('should return unsubscribe function', () => {
        const storage = new TestSessionStore();
        const listener = vi.fn();

        const unsubscribe = storage.subscribe('test-session-123', listener);

        expect(typeof unsubscribe).toBe('function');
      });

      it('should allow calling unsubscribe without error', () => {
        const storage = new TestSessionStore();
        const listener = vi.fn();
        const unsubscribe = storage.subscribe('test-session-123', listener);

        expect(() => unsubscribe()).not.toThrow();
      });
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle concurrent operations', async () => {
      const storage = new TestSessionStore();
      const sessionData1 = createSessionData({ id: 'session-1' });
      const sessionData2 = createSessionData({ id: 'session-2' });

      await Promise.all([storage.set(sessionData1), storage.set(sessionData2)]);

      const [result1, result2] = await Promise.all([
        storage.get('session-1'),
        storage.get('session-2'),
      ]);
      expect(result1).toEqual(sessionData1);
      expect(result2).toEqual(sessionData2);
    });

    it('should handle rapid set/get/drop operations', async () => {
      const storage = new TestSessionStore();
      const sessionData = createSessionData();
      await storage.set(sessionData);
      const retrieved = await storage.get('test-session-123');
      expect(retrieved).toEqual(sessionData);

      await storage.drop('test-session-123');

      const afterDrop = await storage.get('test-session-123');
      expect(afterDrop).toBeNull();
    });

    it('should handle invalid session IDs gracefully', async () => {
      const storage = new TestSessionStore();
      const invalidIds = [null, undefined, '', '  ', '\n', '\t'];

      for (const id of invalidIds) {
        const result = await storage.get(id as string | undefined);

        expect(result).toBeNull();
      }
    });
  });

  describe('type safety', () => {
    it('should work with different user IDs', async () => {
      const customStorage = new TestSessionStore();
      const customSessionData = createSessionData({
        userId: 'custom-user-123',
      });

      await customStorage.set(customSessionData);

      const retrieved = await customStorage.get('test-session-123');
      expect(retrieved?.userId).toBe('custom-user-123');
    });

    it('should work with null user', async () => {
      const storage = new TestSessionStore();
      const nullUserSessionData = createSessionData({ userId: null });

      await storage.set(nullUserSessionData);

      const retrieved = await storage.get('test-session-123');
      expect(retrieved?.userId).toBeNull();
    });
  });
});
