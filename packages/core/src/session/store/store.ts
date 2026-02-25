import type { SessionData, SessionEvent } from '../types';

/** session management configuration */
export interface SessionStoreOptions {
  /** session inactivity timeout in milliseconds */
  sessionTimeout?: number;
  /** maximum number of sessions to maintain */
  maxSessions?: number;
}

/** session storage backend interface */
export abstract class SessionStore {
  public abstract capabilities: {
    /** true if the store can emit event when new event arrived at the store */
    push: boolean;
  };
  /** stores session data */
  public abstract set(session: SessionData): Promise<void>;
  /**
   * retrieves session data
   * @param sessionId optional session identifier
   * @returns session data or null if not found
   */
  public abstract get(sessionId?: string): Promise<SessionData | null>;
  /** deletes session data */
  public abstract drop(sessionId: string): Promise<void>;
  /**
   * retrieves events after a given event
   * @param sessionId session identifier
   * @param lastEventId ID of the last event already retrieved
   * @returns array of new events
   */
  public abstract pullEvents(
    sessionId: string,
    lastEventId: string,
  ): Promise<SessionEvent[]>;
  /**
   * stores new events for a session
   * @param sessionId session identifier
   * @param events events to store
   * @returns stored events
   */
  public abstract pushEvents(
    sessionId: string,
    events: SessionEvent[],
  ): Promise<SessionEvent[]>;
  /**
   * subscribes to session events
   * @param sessionId session identifier
   * @param listener callback invoked when event arrives
   * @returns unsubscribe function
   */
  public abstract subscribe(
    sessionId: string,
    listener: (event: SessionEvent) => void,
  ): () => void;
}
