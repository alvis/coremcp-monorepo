import type { SessionData, SessionEvent } from './types';

/** result of initializing session from events */
export interface SessionInitResult {
  events: SessionEvent[];
  firstActivity: number | null;
  lastActivity: number | null;
  lastSyncedEventId: string | null;
}

/**
 * initializes session state from event data
 * @param data session data containing events
 * @returns initialized session state with computed timestamps
 */
export function initializeFromEvents(data: SessionData): SessionInitResult {
  if (data.events.length === 0) {
    return {
      events: [],
      firstActivity: null,
      lastActivity: null,
      lastSyncedEventId: null,
    };
  }

  const events = [...data.events];
  const timestamps = events.map((e) => e.occurredAt);

  return {
    events,
    firstActivity: Math.min(...timestamps),
    lastActivity: Math.max(...timestamps),
    lastSyncedEventId: events[events.length - 1].id,
  };
}

/**
 * gets sorted events for request rebuilding
 * @param events array of session events
 * @returns events sorted by occurrence time
 */
export function getSortedEventsForRebuilding(
  events: SessionEvent[],
): SessionEvent[] {
  return [...events].sort((a, b) => a.occurredAt - b.occurredAt);
}
