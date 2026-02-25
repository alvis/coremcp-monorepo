import type { SessionEvent } from '@coremcp/core';

/**
 * computes the last activity timestamp from events
 * @param events array of session events
 * @returns the timestamp of the most recent event, or current time if no events
 */
export function computeLastActivity(events: SessionEvent[]): number {
  return events.length === 0
    ? Date.now()
    : Math.max(...events.map((event) => event.occurredAt));
}

/**
 * extracts session id from filename
 * @param filename filename to extract session id from
 * @returns session id or null if filename is invalid
 */
export function filenameToSessionId(filename?: string | null): string | null {
  if (!filename?.endsWith('.json')) {
    return null;
  }

  return filename.slice(0, -'.json'.length);
}
