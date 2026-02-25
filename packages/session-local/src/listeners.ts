import type { SessionEvent } from '@coremcp/core';

/**
 * notifies listeners of new events
 * @param listeners set of listener functions
 * @param events array of events to emit
 */
export function notifyListeners(
  listeners: Set<(event: SessionEvent) => void> | undefined,
  events: SessionEvent[],
): void {
  if (!listeners?.size) {
    return;
  }
  for (const event of events) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}
