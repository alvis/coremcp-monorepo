/**
 * live notification stream utilities for mcp server
 *
 * provides functions for forwarding server-initiated notifications
 * to clients over active SSE connections.
 * @module
 */

import { DEFAULT_PULL_INTERVAL_MS } from '#constants/defaults';

import type { Session, SessionEvent, SessionStore } from '@coremcp/core';

import type { ConnectionContext } from '#types';

/** options for starting a live notification stream */
export interface StreamSessionNotificationsOptions {
  /** the active session to stream notifications from */
  session: Session;
  /** connection context for writing to the SSE stream */
  context: ConnectionContext;
  /** optional session storage backend for pull-based sync */
  sessionStorage?: SessionStore;
}

/**
 * starts forwarding server-initiated notifications to an open SSE connection
 *
 * listens for new session events and writes server-message events that
 * are not responses to client requests (i.e., notifications) directly
 * to the connection context. for non-push stores, sets up a polling
 * interval to pull remote events periodically.
 * @param options stream configuration including session, context, and optional storage
 * @returns cleanup function that stops streaming and clears polling
 */
export function streamSessionNotifications(
  options: StreamSessionNotificationsOptions,
): () => void {
  const { session, context, sessionStorage } = options;

  const unsubscribeSession = session.addListener(
    (event: SessionEvent): void => {
      // skip events that originated from this channel because
      // session.reply() already wrote them via session.channel.write()
      if (
        event.type === 'server-message' &&
        !event.responseToRequestId &&
        event.channelId !== context.channelId
      ) {
        void context.write(event.message);
      }
    },
  );

  const interval =
    sessionStorage && !sessionStorage.capabilities.push
      ? setInterval(async () => {
          await session.sync();
        }, DEFAULT_PULL_INTERVAL_MS)
      : undefined;

  return (): void => {
    unsubscribeSession();

    if (interval) {
      clearInterval(interval);
    }
  };
}
