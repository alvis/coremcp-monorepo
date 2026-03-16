/**
 * notification broadcasting utilities for mcp server
 *
 * provides functions for broadcasting resource update notifications
 * to all subscribed sessions.
 * @module
 */

import type { Session } from '@coremcp/core';

import type { SubscriptionMap } from './subscription-manager';

/**
 * broadcasts a resource update notification to all subscribed sessions
 *
 * looks up the set of session ids subscribed to the given resource uri,
 * then sends a notifications/resources/updated message to each session.
 * uses Promise.allSettled to ensure all subscribers are notified even if
 * individual deliveries fail.
 * @param subscriptions the subscription map tracking resource observers
 * @param activeSessions map of active sessions keyed by session id
 * @param uri resource uri that was updated
 */
export async function broadcastResourceUpdate(
  subscriptions: SubscriptionMap,
  activeSessions: Map<string, Session>,
  uri: string,
): Promise<void> {
  const subscribers = subscriptions.get(uri);

  if (!subscribers) {
    return;
  }

  await Promise.allSettled(
    [...subscribers].map(async (sessionId) => {
      const session = activeSessions.get(sessionId)!;

      return session.notify({
        method: 'notifications/resources/updated',
        params: { uri },
      });
    }),
  );
}
