import { SessionStore } from '..';

import type { SessionStoreOptions } from '..';

import type {
  RecordedSessionData,
  SessionData,
  SessionEvent,
} from '../../types';

/** configuration options for in-memory session storage */
export interface MemorySessionStoreOptions extends SessionStoreOptions {
  maxSessions?: number;
}

/**
 * in-memory session storage implementation
 * stores session data in memory for fast access without persistence
 */
export class MemorySessionStore extends SessionStore {
  public capabilities = { push: true };

  readonly #sessions: Map<string, RecordedSessionData>;
  readonly #sessionOrder: string[]; // array to track session order by last activity
  readonly #maxSessions?: number;
  readonly #sessionTimeout?: number;
  readonly #listeners = new Map<string, Set<(event: SessionEvent) => void>>();

  /**
   * creates new memory session storage with optional configuration
   * @param options session storage configuration options
   */
  constructor(options?: MemorySessionStoreOptions) {
    super();

    this.#sessions = new Map();
    this.#sessionOrder = [];
    this.#maxSessions = options?.maxSessions;
    this.#sessionTimeout = options?.sessionTimeout;
  }

  /**
   * removes session from order tracking array
   * @param sessionId session id to remove from order
   */
  #removeFromOrder(sessionId: string): void {
    const index = this.#sessionOrder.indexOf(sessionId);
    if (index > -1) {
      this.#sessionOrder.splice(index, 1);
    }
  }

  /**
   * adds session to end of order tracking array (most recently active)
   * @param sessionId session id to add to order
   */
  #addToOrder(sessionId: string): void {
    this.#sessionOrder.push(sessionId);
  }

  /**
   * moves session to end of order tracking array (most recently active)
   * @param sessionId session id to move in order
   */
  #moveToEnd(sessionId: string): void {
    this.#removeFromOrder(sessionId);
    this.#addToOrder(sessionId);
  }

  /**
   * removes oldest sessions to keep count at or below maxSessions
   */
  #cleanup(): void {
    if (this.#maxSessions && this.#sessions.size > this.#maxSessions) {
      const excessCount = this.#sessions.size - this.#maxSessions;

      // sort sessions by last activity (oldest first) for LRU eviction
      const sessionsByActivity = Array.from(this.#sessions.entries())
        .map(([id, data]) => ({
          id,
          data,
          lastActivity: this.#getLastActivity(data),
        }))
        .sort((a, b) => a.lastActivity - b.lastActivity);

      // remove the oldest sessions (no let, immutable iteration)
      sessionsByActivity.slice(0, excessCount).forEach(({ id }) => {
        this.#sessions.delete(id);
        this.#removeFromOrder(id);
      });
    }
  }

  /**
   * stores session data in memory
   * @param data session data to store
   */
  public async set(data: SessionData): Promise<void> {
    const sessionId = data.id;

    // check if this is an update to an existing session
    const existingSession = this.#sessions.get(sessionId);

    if (existingSession) {
      // move existing session to end of order (most recently active)
      this.#moveToEnd(sessionId);
    } else {
      // add to order for new session
      this.#addToOrder(sessionId);
    }

    const now = Date.now();
    const dataWithRecordedAt = {
      ...data,
      events: data.events.map((event) => ({
        recordedAt: now,
        ...event,
      })),
    };

    // add or update the session
    this.#sessions.set(sessionId, dataWithRecordedAt);

    // cleanup excess sessions if needed
    this.#cleanup();
  }

  /**
   * retrieves session data from memory
   * @param sessionId optional session identifier
   * @returns session object if found, null otherwise
   */
  public async get(sessionId?: string): Promise<SessionData | null> {
    if (!sessionId) {
      return null;
    }

    const sessionData = this.#sessions.get(sessionId);

    if (!sessionData) {
      return null;
    }

    if (this.#sessionTimeout) {
      const now = Date.now();
      const lastActivity = this.#getLastActivity(sessionData);
      const timeSinceActivity = now - lastActivity;

      if (timeSinceActivity > this.#sessionTimeout) {
        this.#sessions.delete(sessionId);
        this.#removeFromOrder(sessionId);

        return null;
      }
    }

    return sessionData;
  }

  /**
   * deletes session data from memory
   * @param sessionId session identifier to delete
   */
  public async drop(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
    this.#removeFromOrder(sessionId);
  }

  /**
   * pulls events from the store after the given event id
   * @param sessionId session identifier to pull events for
   * @param lastEventId id of the last event the client has seen
   * @returns promise resolving to array of new events
   */
  public async pullEvents(
    sessionId: string,
    lastEventId: string,
  ): Promise<SessionEvent[]> {
    // get events for the specific session
    const sessionData = this.#sessions.get(sessionId);
    if (!sessionData) {
      return [];
    }

    // sort events by timestamp and filter events after lastEventId
    const events = [...sessionData.events].sort(
      (a, b) => a.occurredAt - b.occurredAt,
    );

    const lastEventIndex = events.findIndex(
      (event) => event.id === lastEventId,
    );
    if (lastEventIndex === -1) {
      return events;
    }

    return events.slice(lastEventIndex + 1);
  }

  /**
   * pushes events to the store
   * @param sessionId session identifier to push events for
   * @param events array of events to push
   * @returns promise resolving to the stored events
   */
  public async pushEvents(
    sessionId: string,
    events: SessionEvent[],
  ): Promise<SessionEvent[]> {
    if (events.length === 0) {
      return [];
    }

    const sessionData = this.#sessions.get(sessionId);
    if (!sessionData) {
      return [];
    }

    const existingIds = new Set(sessionData.events.map(({ id }) => id));
    const uniqueIncoming = events.filter(({ id }) => !existingIds.has(id));
    if (uniqueIncoming.length === 0) {
      return [];
    }

    const recordedAt = Date.now();
    const merged = [
      ...sessionData.events,
      ...uniqueIncoming.map((event) => ({ recordedAt, ...event })),
    ].toSorted(
      (a, b) => a.occurredAt - b.occurredAt || a.recordedAt - b.recordedAt,
    );

    const updated = { ...sessionData, events: merged };
    this.#sessions.set(sessionId, updated);

    const changeset = uniqueIncoming.toSorted(
      (a, b) => a.occurredAt - b.occurredAt,
    );

    const listeners = this.#listeners.get(sessionId);
    if (listeners?.size) {
      for (const event of changeset) {
        for (const listener of listeners) {
          try {
            listener(event);
          } catch {
            // ignore listener errors to avoid breaking store
          }
        }
      }
    }

    return changeset;
  }

  /**
   * registers an event listener for session events
   * @param sessionId session identifier to listen to events from
   * @param listener function to handle events
   * @returns function to unsubscribe the listener
   */
  public subscribe(
    sessionId: string,
    listener: (event: SessionEvent) => void,
  ): () => void {
    const existing = this.#listeners.get(sessionId) ?? new Set();
    existing.add(listener);
    this.#listeners.set(sessionId, existing);

    return () => {
      const current = this.#listeners.get(sessionId);
      current?.delete(listener);
      if (current?.size === 0) {
        this.#listeners.delete(sessionId);
      }
    };
  }

  /**
   * gets the last activity timestamp from session data
   * @param sessionData session data to extract last activity from
   * @returns last activity timestamp
   */
  #getLastActivity(sessionData: SessionData): number {
    if (sessionData.events.length === 0) {
      return 0;
    }

    return Math.max(...sessionData.events.map(({ occurredAt }) => occurredAt));
  }
}
