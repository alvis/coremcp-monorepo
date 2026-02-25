/**
 * session cleanup utilities for mcp server
 *
 * provides functions for cleaning up inactive sessions based on
 * configurable inactivity timeout thresholds.
 * @module
 */

import { DEFAULT_INACTIVITY_TIMEOUT_MS } from '#constants/defaults';

import { cleanupSessionSubscriptions } from './subscription-manager';

import type { Log, Session, SessionStore } from '@coremcp/core';

import type { SubscriptionMap } from './subscription-manager';

/**
 * context required for performing session cleanup operations
 */
export interface SessionCleanupContext {
  /** map of active sessions keyed by session id */
  activeSessions: Map<string, Session>;
  /** subscription map for resource notifications */
  subscriptions: SubscriptionMap;
  /** optional session storage backend */
  sessionStorage?: SessionStore;
  /** optional logger */
  log?: Log;
}

/**
 * cleans up sessions that have been inactive beyond the specified threshold
 *
 * iterates over all active sessions, checking the timestamp of their last event.
 * sessions exceeding the inactivity threshold are removed from the active sessions map,
 * dropped from storage, and have their subscriptions cleaned up.
 * @param context server state needed for cleanup operations
 * @param inactivityTimeoutMs milliseconds of inactivity threshold (default: 300000 = 5 minutes)
 * @returns number of sessions cleaned up
 */
export function cleanupInactiveSessions(
  context: SessionCleanupContext,
  inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
): number {
  const { activeSessions, subscriptions, sessionStorage, log } = context;
  const now = Date.now();
  let count = 0;

  for (const [sessionId, session] of activeSessions) {
    // get last activity time from session events
    const events = session.events;
    const lastEvent = events[events.length - 1];
    /* istanbul ignore next - recordedAt is always set by Session, fallback is defensive */
    const lastActivity = lastEvent.recordedAt ?? now;

    // check if session has been inactive longer than threshold
    if (now - lastActivity >= inactivityTimeoutMs) {
      // remove from active sessions
      activeSessions.delete(sessionId);

      // remove from storage
      void sessionStorage?.drop(sessionId);

      // unsubscribe from all resources
      cleanupSessionSubscriptions(
        subscriptions,
        sessionId,
        session.subscriptions,
      );

      count++;
      log?.('info', 'inactive session cleaned up', {
        sessionId,
        inactivityTimeoutMs,
      });
    }
  }

  if (count > 0) {
    log?.('info', 'session cleanup completed', {
      sessionsCleanedUp: count,
      inactivityTimeoutMs,
    });
  }

  return count;
}
