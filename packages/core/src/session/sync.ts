import type { SessionEvent } from './types';

/**
 * computes unsynced events from the event list
 * @param events all events in the session
 * @param lastSyncedEventId ID of the last synced event, or null if none
 * @returns array of events that haven't been synced yet
 */
export function getUnsyncedEvents(
  events: SessionEvent[],
  lastSyncedEventId: string | null,
): SessionEvent[] {
  const lastSyncedEventIndex = events.findIndex(
    ({ id }) => lastSyncedEventId && id === lastSyncedEventId,
  );

  return events.slice(lastSyncedEventIndex + 1);
}

/**
 * merges and sorts events, returning the new last synced ID
 * @param existingEvents current session events
 * @param newEvents events retrieved from the store
 * @returns merged events sorted by occurrence time and the new last synced ID
 */
export function mergeEvents(
  existingEvents: SessionEvent[],
  newEvents: SessionEvent[],
): { events: SessionEvent[]; lastSyncedEventId: string | null } {
  const merged = [...existingEvents, ...newEvents].toSorted(
    (a, b) => a.occurredAt - b.occurredAt,
  );

  return {
    events: merged,
    lastSyncedEventId: merged.length > 0 ? merged[merged.length - 1].id : null,
  };
}

/**
 * updates activity timestamps based on an event
 * @param event the event to process
 * @param firstActivity current first activity timestamp or null
 * @param lastActivity current last activity timestamp or null
 * @returns updated timestamps
 */
export function updateActivityTimestamps(
  event: SessionEvent,
  firstActivity: number | null,
  lastActivity: number | null,
): { firstActivity: number; lastActivity: number } {
  return {
    firstActivity: Math.min(firstActivity ?? Infinity, event.occurredAt),
    lastActivity: Math.max(lastActivity ?? 0, event.occurredAt),
  };
}
