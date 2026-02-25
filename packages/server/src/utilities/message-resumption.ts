/**
 * message resumption utilities for mcp server
 *
 * provides functions for replaying undelivered events and awaiting
 * completion of resumed requests during session reconnection.
 * @module
 */

import {
  DEFAULT_PULL_INTERVAL_MS,
  DEFAULT_RESUME_TIMEOUT_MS,
} from '#constants/defaults';

import type { Session, SessionEvent, SessionStore } from '@coremcp/core';

import type { ConnectionContext } from '#types';

/** options for replaying undelivered events after session resumption */
export interface ReplayUndeliveredEventsOptions {
  /** the resumed session */
  session: Session;
  /** connection context for the resumed connection */
  context: ConnectionContext;
  /** optional session storage backend */
  sessionStorage?: SessionStore;
}

/**
 * replays undelivered events from a resumed session and waits for completion
 *
 * finds events after the last-event-id, delivers any missed server messages
 * for the same request, and subscribes for future events until the request
 * completes or a timeout is reached.
 * @param options replay options including session, context, and storage
 * @returns a promise that resolves when replay and wait are complete, or undefined if no replay was needed
 */
export async function replayUndeliveredEvents(
  options: ReplayUndeliveredEventsOptions,
): Promise<void | undefined> {
  const { session, context, sessionStorage } = options;
  const { lastEventId } = context;

  /* istanbul ignore next */
  if (!lastEventId) {
    return undefined;
  }

  /* istanbul ignore next */
  const lastEventIndex = session.events.findIndex(
    (event) => event.id === lastEventId,
  );

  if (lastEventIndex === -1) {
    return undefined;
  }

  const lastEvent = session.events[lastEventIndex] as {
    type: 'server-message';
    responseToRequestId?: string | number;
    message: Parameters<ConnectionContext['write']>[0];
  };

  const undeliveredEvents = session.events.slice(lastEventIndex);

  // deliver missing events
  for (const event of undeliveredEvents) {
    if (
      event.type === 'server-message' &&
      event.responseToRequestId === lastEvent.responseToRequestId
    ) {
      // NOTE: do not use session.reply since it will add events to the data store
      await context.write(event.message);
    }
  }

  const { promise: waitUntilChannelEnded, resolve: signalChannelEnded } =
    Promise.withResolvers<void>();

  // setup maximum timeout for waiting any undelivered messages from previous contact
  const timeout = setTimeout(signalChannelEnded, DEFAULT_RESUME_TIMEOUT_MS);

  /* istanbul ignore next */
  const handleEvent = /* istanbul ignore next */ async (
    event: SessionEvent,
  ): Promise<void> => {
    /* istanbul ignore next */
    if (
      event.type === 'server-message' &&
      event.responseToRequestId === lastEvent.responseToRequestId
    ) {
      /* istanbul ignore next */
      await context.write(event.message);

      /* istanbul ignore next */
      if (event.message.result) {
        // when a request is finished
        /* istanbul ignore next */
        signalChannelEnded();
        /* istanbul ignore next */
        clearTimeout(timeout);
      }
    }
  };

  sessionStorage?.subscribe(session.id, handleEvent);

  if (!sessionStorage?.capabilities.push) {
    const interval = setInterval(async () => {
      // try to pull the session store every second if it doesn't support push notification until timeout
      const newEvents = await session.sync();

      newEvents.forEach(handleEvent);
    }, DEFAULT_PULL_INTERVAL_MS);

    // stop pulling when the previous channel has ended
    void waitUntilChannelEnded.then(() => clearInterval(interval));
  }

  return Promise.race([
    context.waitUntilClosed,
    // return when the request is complete and sent to the client
    waitUntilChannelEnded,
  ]);
}
