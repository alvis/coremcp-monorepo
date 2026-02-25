import {
  access,
  mkdir,
  readdir,
  rm,
  stat,
  watch,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { SessionStore } from '@coremcp/core';

import { SESSION_REGEX, SESSION_TIMESTAMP_REGEX } from '#constants';
import {
  deleteSessionFile,
  loadSessionFile,
  saveSessionFile,
} from '#file-operations';
import { notifyListeners } from '#listeners';
import { computeLastActivity, filenameToSessionId } from '#session-activity';

import type {
  RecordedSessionEvent,
  SessionData,
  SessionEvent,
} from '@coremcp/core';

import type { LocalSessionStoreOptions } from '#types';

/** json file-based session storage implementation */
export class LocalSessionStore extends SessionStore {
  public readonly capabilities = { push: true };
  #storeDirectory: string;
  #sessionTimeout?: number;
  #timestampIndexDir: string;
  #listeners = new Map<string, Set<(event: SessionEvent) => void>>();
  #watchController?: AbortController;
  #lastEmittedStoredAt = new Map<string, number>();

  /**
   * creates new json session storage with specified directory
   * @param options configuration for session storage
   */
  constructor(options?: LocalSessionStoreOptions) {
    super();

    this.#storeDirectory =
      options?.storeDirectory ?? resolve(process.cwd(), 'sessions');
    this.#sessionTimeout = options?.sessionTimeout;
    this.#timestampIndexDir = join(
      this.#storeDirectory,
      '.index',
      'lastActivity',
    );
  }

  // public API Methods //

  /**
   * stores session data to json file
   * @param data session instance to store
   */
  public async set(data: SessionData): Promise<void> {
    // ensure directory structure exists
    await this.#ensureDirectory();

    await saveSessionFile(this.#storeDirectory, data);

    // compute and update timestamp index from events
    const lastActivity = computeLastActivity(data.events);
    await this.#updateTimestampIndex(data.id, lastActivity);

    // cleanup sessions if needed
    await this.#cleanupSessions();
  }

  /**
   * retrieves session data from json file
   * @param sessionId unique identifier of the session
   * @returns session instance or null if not found
   */
  public async get(sessionId?: string): Promise<SessionData | null> {
    if (!sessionId) {
      return null;
    }
    const data = await loadSessionFile(this.#storeDirectory, sessionId);
    if (!data) {
      return null;
    }

    if (this.#sessionTimeout) {
      const lastActivity = computeLastActivity(data.events);
      if (Date.now() - lastActivity > this.#sessionTimeout) {
        await deleteSessionFile(this.#storeDirectory, sessionId);
        await this.#removeTimestampIndex(sessionId, lastActivity);

        return null;
      }
    }

    return data;
  }

  /**
   * deletes session data from json file
   * @param sessionId unique identifier of the session
   */
  public async drop(sessionId: string): Promise<void> {
    try {
      await deleteSessionFile(this.#storeDirectory, sessionId);
      await this.#removeTimestampIndex(sessionId);
    } catch {
      // ignore if file doesn't exist
    }
  }

  /**
   * pulls new events from the store after the given event ID
   * @param sessionId the session ID to pull events for
   * @param lastEventId the ID of the last event the client has seen
   * @returns array of new events
   */
  public async pullEvents(
    sessionId: string,
    lastEventId: string,
  ): Promise<SessionEvent[]> {
    const stored = await loadSessionFile(this.#storeDirectory, sessionId);
    if (!stored) {
      return [];
    }

    const events = stored.events.toSorted(
      (a, b) => a.occurredAt - b.occurredAt,
    );

    // if lastEventId not found, return all events (client may be out of sync)
    const lastIndex = events.findIndex((e) => e.id === lastEventId);
    if (lastIndex === -1) {
      return events;
    }

    return events.slice(lastIndex + 1);
  }

  /**
   * pushes events to the store
   * @param sessionId the session ID to push events for
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

    const storedSession = await loadSessionFile(
      this.#storeDirectory,
      sessionId,
    );
    if (!storedSession) {
      // session not found – nothing to push
      return [];
    }

    const prevLastActivity = computeLastActivity(storedSession.events);

    // build a set of existing IDs for deduplication
    const existingIds = new Set(storedSession.events.map((e) => e.id));
    const uniqueIncoming = events.filter((e) => !existingIds.has(e.id));

    if (uniqueIncoming.length === 0) {
      return [];
    }

    // stamp storedAt for the new events and merge, sorted by timestamp
    const now = Date.now();
    const recordedNewEvents: RecordedSessionEvent[] = uniqueIncoming.map(
      (event) => ({ recordedAt: now, ...event }),
    );
    const mergedEvents = [
      ...storedSession.events,
      ...recordedNewEvents,
    ].toSorted(
      (a, b) => a.occurredAt - b.occurredAt || a.recordedAt - b.recordedAt,
    );

    // persist updated session data immutably
    const updatedStored = { ...storedSession, events: mergedEvents };
    await saveSessionFile(this.#storeDirectory, updatedStored);

    // update timestamp index only if last activity changed
    const newLastActivity = computeLastActivity(mergedEvents);
    if (newLastActivity !== prevLastActivity) {
      await this.#updateTimestampIndex(
        sessionId,
        newLastActivity,
        prevLastActivity,
      );
    }

    // bump last emitted barrier for this session
    this.#lastEmittedStoredAt.set(sessionId, now);

    // notify listeners for newly added events (sorted for deterministic order)
    const changeset = uniqueIncoming.toSorted(
      (a, b) => a.occurredAt - b.occurredAt,
    );
    notifyListeners(this.#listeners.get(sessionId), changeset);

    return changeset;
  }

  /**
   * registers an event listener
   * @param sessionId session identifier to listen for events from
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

    // lazily start fs watcher
    this.#ensureWatcher();

    return () => {
      const current = this.#listeners.get(sessionId);
      current?.delete(listener);
      if (current?.size === 0) {
        this.#listeners.delete(sessionId);
      }
    };
  }

  // timestamp Index Management //

  /**
   * gets the file path for a timestamp index entry
   * @param timestamp the last activity timestamp
   * @param sessionId the session ID
   * @returns the timestamp index file path
   */
  #getTimestampIndexFilePath(timestamp: number, sessionId: string): string {
    return join(this.#timestampIndexDir, `${timestamp}-${sessionId}`);
  }

  /**
   * updates the timestamp index for a session
   * @param sessionId the session ID
   * @param newTimestamp the new last activity timestamp
   * @param oldTimestamp the previous timestamp to remove
   */
  async #updateTimestampIndex(
    sessionId: string,
    newTimestamp: number,
    oldTimestamp?: number,
  ): Promise<void> {
    await mkdir(this.#timestampIndexDir, { recursive: true });
    await this.#removeTimestampIndex(sessionId, oldTimestamp);
    const indexFile = this.#getTimestampIndexFilePath(newTimestamp, sessionId);
    await writeFile(indexFile, '', 'utf-8');
  }

  /**
   * lists all timestamp files for a given session
   * @param sessionId the session ID
   * @returns array of timestamps from the index directory
   */
  async #listTimestampFiles(sessionId: string): Promise<number[]> {
    const files = await readdir(this.#timestampIndexDir);

    return files
      .map((file) => SESSION_TIMESTAMP_REGEX.exec(file))
      .filter((match): match is RegExpExecArray => match?.[2] === sessionId)
      .map((match) => parseInt(match[1], 10))
      .filter((timestamp) => !isNaN(timestamp));
  }

  /**
   * removes timestamp index entries for a session
   * @param sessionId the session ID
   * @param timestamp optional specific timestamp to remove; if not provided, removes all timestamps for the session
   */
  async #removeTimestampIndex(
    sessionId: string,
    timestamp?: number,
  ): Promise<void> {
    const timestamps = timestamp
      ? [timestamp]
      : await this.#listTimestampFiles(sessionId);

    await Promise.all(
      timestamps.map(async (ts) =>
        rm(this.#getTimestampIndexFilePath(ts, sessionId)),
      ),
    );
  }

  // directory Management //

  /**
   * ensures the store directory and timestamp index directory exist
   */
  async #ensureDirectory(): Promise<void> {
    try {
      await access(this.#storeDirectory);
    } catch {
      await mkdir(this.#storeDirectory, { recursive: true });
    }
    try {
      await access(this.#timestampIndexDir);
    } catch {
      await mkdir(this.#timestampIndexDir, { recursive: true });
    }
  }

  /**
   * ensures the timestamp index is initialized by rebuilding it if necessary
   */
  async #ensureTimestampIndex(): Promise<void> {
    try {
      await stat(this.#timestampIndexDir);
    } catch {
      await this.#ensureDirectory();
      for (const file of await readdir(this.#storeDirectory)) {
        const match = SESSION_REGEX.exec(file);
        if (!match) {
          continue;
        }
        const [sessionId] = match;
        const sessionData = await loadSessionFile(
          this.#storeDirectory,
          sessionId,
        );
        if (!sessionData) {
          continue;
        }
        const lastActivity = computeLastActivity(sessionData.events);
        await writeFile(
          this.#getTimestampIndexFilePath(lastActivity, sessionId),
          '',
          'utf-8',
        );
      }
    }
  }

  // cleanup Operations //

  /**
   * cleans up expired sessions based on the configured timeout
   */
  async #cleanupSessions(): Promise<void> {
    if (!this.#sessionTimeout) {
      return;
    }
    const now = Date.now();
    await this.#ensureTimestampIndex();
    for (const file of await readdir(this.#timestampIndexDir)) {
      const match = SESSION_TIMESTAMP_REGEX.exec(file);
      if (!match) {
        continue;
      }
      const lastActivity = parseInt(match[1], 10);
      const sessionId = match[2];
      if (isNaN(lastActivity)) {
        continue;
      }
      if (now - lastActivity > this.#sessionTimeout) {
        await deleteSessionFile(this.#storeDirectory, sessionId);
        await this.#removeTimestampIndex(sessionId, lastActivity);
      } else {
        break; // files sorted by timestamp, remaining are not expired
      }
    }
  }

  // fs watch //

  /**
   * ensures a file system watcher is active for monitoring session directory
   */
  #ensureWatcher(): void {
    if (this.#watchController) {
      return;
    }
    this.#watchController = new AbortController();
    const { signal } = this.#watchController;

    void (async () => {
      try {
        for await (const event of watch(this.#storeDirectory, { signal })) {
          const sessionId = filenameToSessionId(event.filename);
          if (!sessionId || !this.#listeners.has(sessionId)) {
            continue;
          }
          await this.#emitNewEventsFor(sessionId);
        }
      } catch {
        // watcher ended or failed; ignore
      }
    })();
  }

  /**
   * emits new events for a session to registered listeners
   * @param sessionId the session ID to emit events for
   */
  async #emitNewEventsFor(sessionId: string): Promise<void> {
    const data = await loadSessionFile(this.#storeDirectory, sessionId);
    if (!data) {
      return;
    }
    const lastEmitted = this.#lastEmittedStoredAt.get(sessionId) ?? 0;
    const newEvents = data.events.filter(
      ({ recordedAt }) => recordedAt > lastEmitted,
    );
    if (newEvents.length === 0) {
      return;
    }
    notifyListeners(this.#listeners.get(sessionId), newEvents);
    this.#lastEmittedStoredAt.set(sessionId, Date.now());
  }
}
