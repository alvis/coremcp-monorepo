import { generateBase62Uuid } from '#id';

import { updateRequestFromEvent } from './request-manager';
import { updateActivityTimestamps } from './sync';

import type { RequestId } from '@coremcp/protocol';

import type {
  EventHook,
  SessionEvent,
  SessionEventInput,
  SessionRequest,
  SessionTimestamps,
} from './types';

/**
 * creates a fully-formed session event from partial data
 * @param partial event data with optional id, channelId and timestamp
 * @param channelId default channel id to use if not provided
 * @returns the complete session event
 */
export function createSessionEvent(
  partial: SessionEventInput,
  channelId: string,
): SessionEvent {
  const {
    id = generateBase62Uuid(),
    channelId: eventChannelId = channelId,
    occurredAt: timestamp = Date.now(),
    ...rest
  } = partial;

  return {
    id,
    channelId: eventChannelId,
    occurredAt: timestamp,
    ...rest,
  } as SessionEvent;
}

/**
 * records an event into session state and updates activity timestamps and requests
 * @param events mutable events array to push onto
 * @param requests mutable request map to update
 * @param event the session event to record
 * @param timestamps mutable timestamps object to update
 * @param onEvent optional event hook
 */
export function recordEvent(
  events: SessionEvent[],
  requests: Map<RequestId, SessionRequest>,
  event: SessionEvent,
  timestamps: SessionTimestamps,
  onEvent?: EventHook,
): void {
  events.push(event);

  const updated = updateActivityTimestamps(
    event,
    timestamps.first,
    timestamps.last,
  );
  timestamps.first = updated.firstActivity;
  timestamps.last = updated.lastActivity;

  updateRequestFromEvent(requests, event);
  onEvent?.(event);
}
