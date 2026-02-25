/**
 * subscription management utilities for mcp server
 *
 * provides functions to manage resource subscriptions in a session-based model.
 * subscriptions map resource uris to sets of session ids that are subscribed.
 * @module
 */

/** maps resource uri to set of subscribed session ids */
export type SubscriptionMap = Map<string, Set<string>>;

/**
 * subscribes a session to resource updates
 * @param subscriptions the subscription map to modify
 * @param uri resource uri to subscribe to
 * @param sessionId session id to subscribe
 */
export function subscribeToResource(
  subscriptions: SubscriptionMap,
  uri: string,
  sessionId: string,
): void {
  if (!subscriptions.has(uri)) {
    subscriptions.set(uri, new Set());
  }

  subscriptions.get(uri)!.add(sessionId);
}

/**
 * unsubscribes a session from resource updates
 * @param subscriptions the subscription map to modify
 * @param uri resource uri to unsubscribe from
 * @param sessionId session id to unsubscribe
 */
export function unsubscribeFromResource(
  subscriptions: SubscriptionMap,
  uri: string,
  sessionId: string,
): void {
  const subscribers = subscriptions.get(uri);

  if (subscribers) {
    subscribers.delete(sessionId);

    if (subscribers.size === 0) {
      subscriptions.delete(uri);
    }
  }
}

/**
 * removes all subscription references for a session
 * @param subscriptions the subscription map to modify
 * @param sessionId session id to remove subscriptions for
 * @param subscribedUris list of resource uris the session is subscribed to
 */
export function cleanupSessionSubscriptions(
  subscriptions: SubscriptionMap,
  sessionId: string,
  subscribedUris: readonly string[],
): void {
  for (const uri of subscribedUris) {
    const subscribers = subscriptions.get(uri);

    /* istanbul ignore next - defensive check: subscribers should exist for subscribed resources */
    if (subscribers) {
      subscribers.delete(sessionId);

      // clean up empty subscription sets
      if (subscribers.size === 0) {
        subscriptions.delete(uri);
      }
    }
  }
}
