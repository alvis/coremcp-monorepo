/**
 * session lifecycle utilities for mcp server
 *
 * provides helper functions for session lifecycle events and callbacks.
 * @module
 */

import type { Log } from '@coremcp/core';

/** callback type for session initialization notification */
export type OnSessionInitialized = (
  sessionId: string,
  userId?: string,
) => Promise<void>;

/**
 * notifies session initialization callback
 *
 * fire-and-forget pattern: async callback errors do not block session creation.
 * all errors are logged for debugging.
 * @param options notification options
 * @param options.callback the initialization callback to invoke
 * @param options.sessionId the newly created session id
 * @param options.userId the authenticated user id (undefined for anonymous)
 * @param options.log optional logger for error reporting
 */
export function notifySessionInitialized(options: {
  callback?: OnSessionInitialized;
  sessionId: string;
  userId?: string;
  log?: Log;
}): void {
  const { callback, sessionId, userId, log } = options;

  if (!callback) {
    return;
  }

  // fire and forget - don't block response
  callback(sessionId, userId).catch((error) => {
    log?.('error', 'onSessionInitialized callback failed', {
      sessionId,
      userId,
      error,
    });
  });
}
